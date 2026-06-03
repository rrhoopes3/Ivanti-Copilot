import * as path from "path";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";

export interface IvantiCopilotStackProps extends StackProps {
  /** Deployment environment: dev | pilot | prod. Drives resource names and the API stage. */
  appEnv: string;

  // Non-secret Ivanti configuration. When omitted, the Lambda falls back to the
  // defaults baked into backend/src/config.ts.
  ivantiBaseUrl?: string;
  ivantiOdataPath?: string;
  ivantiKnowledgeObject?: string;
  ivantiIncidentObject?: string;
  articleUrlTemplate?: string;
  ivantiTimeoutMs?: number;

  // Request authorization.
  requireBearerToken?: boolean;
  allowedOrigins?: string;
  entraTenantId?: string;
  entraAudience?: string;
  entraIssuer?: string;

  // Pilot-only inline secrets. These land in the Lambda environment, which the
  // security model reserves for a narrow IT-only pilot. For production, leave
  // them unset and source credentials from the Secrets Manager secret instead.
  ivantiAuthHeaderValue?: string;
  internalSharedSecret?: string;

  // API Gateway stage throttling.
  throttleRateLimit?: number;
  throttleBurstLimit?: number;

  // Operational hardening.
  enableWaf?: boolean;
  alarmEmail?: string;
}

/**
 * AWS deployment for the Ivanti Copilot middleware:
 *   WAF -> API Gateway (REST, proxy) -> Lambda -> Ivanti REST API
 *                                          |-> Secrets Manager (Ivanti credentials)
 *                                          |-> CloudWatch Logs + Alarms
 *
 * Wire it to your account/bootstrap pattern. For production, set the Entra ID
 * context values so the middleware validates caller tokens.
 */
export class IvantiCopilotStack extends Stack {
  constructor(scope: Construct, id: string, props: IvantiCopilotStackProps) {
    super(scope, id, props);

    const { appEnv } = props;
    const functionName = `ivanti-copilot-${appEnv}`;

    // The Lambda asset is the compiled backend. Run `npm run build` in
    // ../../backend first so this directory exists.
    const backendDist = path.join(__dirname, "..", "..", "..", "backend", "dist");

    // Intended home for Ivanti credentials. Default removal policy is RETAIN so
    // the secret survives stack teardown. After deploy, replace the generated
    // placeholder value with the real Ivanti auth header, e.g.:
    //   aws secretsmanager put-secret-value \
    //     --secret-id ivanti-copilot/<env>/ivanti-auth \
    //     --secret-string '{"ivantiAuthHeaderValue":"Bearer ...","internalSharedSecret":"..."}'
    const ivantiSecret = new secretsmanager.Secret(this, "IvantiAuthSecret", {
      secretName: `ivanti-copilot/${appEnv}/ivanti-auth`,
      description: "Ivanti REST auth header value and internal pilot secret for the Copilot middleware."
    });

    // Conventional Lambda log group with explicit retention. CloudWatch must not
    // capture article bodies, ticket descriptions, or tokens (see security-model.md).
    const logGroup = new logs.LogGroup(this, "FunctionLogs", {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH
    });

    const handler = new lambda.Function(this, "MiddlewareFunction", {
      functionName,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler.handler",
      code: lambda.Code.fromAsset(backendDist),
      memorySize: 256,
      timeout: Duration.seconds(15),
      logGroup,
      environment: buildEnvironment(props, ivantiSecret.secretArn)
    });

    // Lambda reads the credential secret at cold start when no inline value is set.
    ivantiSecret.grantRead(handler);

    const api = new apigateway.LambdaRestApi(this, "Api", {
      restApiName: `ivanti-copilot-${appEnv}`,
      description: "Read-only Copilot actions for Ivanti Neurons for ITSM knowledge and incidents.",
      handler,
      proxy: true,
      deployOptions: {
        stageName: appEnv,
        throttlingRateLimit: props.throttleRateLimit ?? 20,
        throttlingBurstLimit: props.throttleBurstLimit ?? 40,
        metricsEnabled: true
        // Execution logging (loggingLevel) is intentionally off: it requires an
        // account-level API Gateway CloudWatch role. Enable it once that role
        // exists if you need per-request gateway logs.
      }
    });

    this.addWebAcl(props, api);
    this.addAlarms(props, handler, api);

    new CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Base URL for the Copilot action endpoint. Use this in the OpenAPI servers block."
    });

    new CfnOutput(this, "IvantiSecretArn", {
      value: ivantiSecret.secretArn,
      description: "Secrets Manager ARN holding the Ivanti auth header value."
    });

    new CfnOutput(this, "FunctionNameOutput", {
      value: handler.functionName,
      description: "Lambda function name for the middleware."
    });
  }

  /** Regional WAF with AWS managed rule sets plus a per-IP rate limit. */
  private addWebAcl(props: IvantiCopilotStackProps, api: apigateway.RestApi): void {
    if (props.enableWaf === false) {
      return;
    }

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      defaultAction: { allow: {} },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `ivanti-copilot-${props.appEnv}-waf`,
        sampledRequestsEnabled: true
      },
      rules: [
        managedRule("AWSManagedRulesCommonRuleSet", 1),
        managedRule("AWSManagedRulesKnownBadInputsRuleSet", 2),
        {
          name: "RateLimitPerIp",
          priority: 3,
          action: { block: {} },
          statement: { rateBasedStatement: { limit: 2000, aggregateKeyType: "IP" } },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimitPerIp",
            sampledRequestsEnabled: true
          }
        }
      ]
    });

    new wafv2.CfnWebACLAssociation(this, "WebAclAssociation", {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn
    });
  }

  /** Core CloudWatch alarms, optionally routed to an email via SNS. */
  private addAlarms(props: IvantiCopilotStackProps, handler: lambda.Function, api: apigateway.RestApi): void {
    const topic = props.alarmEmail
      ? new sns.Topic(this, "AlarmTopic", { displayName: `ivanti-copilot-${props.appEnv} alarms` })
      : undefined;

    if (topic && props.alarmEmail) {
      topic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));
    }

    const action = topic ? new cwActions.SnsAction(topic) : undefined;
    const period = Duration.minutes(5);

    const alarms: cloudwatch.Alarm[] = [
      new cloudwatch.Alarm(this, "LambdaErrorsAlarm", {
        metric: handler.metricErrors({ period }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      new cloudwatch.Alarm(this, "LambdaThrottlesAlarm", {
        metric: handler.metricThrottles({ period }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      new cloudwatch.Alarm(this, "LambdaDurationAlarm", {
        metric: handler.metricDuration({ period, statistic: "p99" }),
        threshold: 10000,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      new cloudwatch.Alarm(this, "ApiServerErrorAlarm", {
        metric: api.metricServerError({ period }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      new cloudwatch.Alarm(this, "ApiLatencyAlarm", {
        metric: api.metricLatency({ period, statistic: "p99" }),
        threshold: 10000,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      })
    ];

    if (action) {
      for (const alarm of alarms) {
        alarm.addAlarmAction(action);
      }
    }
  }
}

function managedRule(ruleSetName: string, priority: number): wafv2.CfnWebACL.RuleProperty {
  return {
    name: ruleSetName,
    priority,
    overrideAction: { none: {} },
    statement: { managedRuleGroupStatement: { vendorName: "AWS", name: ruleSetName } },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: ruleSetName,
      sampledRequestsEnabled: true
    }
  };
}

/** Builds the Lambda environment, omitting keys that should fall back to backend defaults. */
function buildEnvironment(props: IvantiCopilotStackProps, secretArn: string): Record<string, string> {
  const env: Record<string, string> = {
    APP_ENV: props.appEnv,
    IVANTI_SECRET_ARN: secretArn,
    REQUIRE_BEARER_TOKEN: String(props.requireBearerToken ?? false),
    IVANTI_TIMEOUT_MS: String(props.ivantiTimeoutMs ?? 8000)
  };

  setIfPresent(env, "IVANTI_BASE_URL", props.ivantiBaseUrl);
  setIfPresent(env, "IVANTI_ODATA_PATH", props.ivantiOdataPath);
  setIfPresent(env, "IVANTI_KB_OBJECT", props.ivantiKnowledgeObject);
  setIfPresent(env, "IVANTI_INCIDENT_OBJECT", props.ivantiIncidentObject);
  setIfPresent(env, "IVANTI_ARTICLE_URL_TEMPLATE", props.articleUrlTemplate);
  setIfPresent(env, "ALLOWED_ORIGINS", props.allowedOrigins);
  setIfPresent(env, "ENTRA_TENANT_ID", props.entraTenantId);
  setIfPresent(env, "ENTRA_AUDIENCE", props.entraAudience);
  setIfPresent(env, "ENTRA_ISSUER", props.entraIssuer);

  // Pilot-only inline secrets. Prefer Secrets Manager for anything beyond a pilot.
  setIfPresent(env, "IVANTI_AUTH_HEADER_VALUE", props.ivantiAuthHeaderValue);
  setIfPresent(env, "INTERNAL_SHARED_SECRET", props.internalSharedSecret);

  return env;
}

function setIfPresent(env: Record<string, string>, key: string, value?: string): void {
  if (value !== undefined && value !== "") {
    env[key] = value;
  }
}
