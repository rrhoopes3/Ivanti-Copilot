import * as path from "path";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

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
  requireBearerToken?: boolean;

  // Pilot-only inline secrets. These land in the Lambda environment, which the
  // security model reserves for a narrow IT-only pilot. For production, leave
  // them unset and source credentials from the Secrets Manager secret instead.
  ivantiAuthHeaderValue?: string;
  internalSharedSecret?: string;

  // API Gateway stage throttling.
  throttleRateLimit?: number;
  throttleBurstLimit?: number;
}

/**
 * Minimal AWS deployment for the Ivanti Copilot middleware:
 *   API Gateway (REST, proxy) -> Lambda -> Ivanti REST API
 *                                   |-> Secrets Manager (Ivanti credentials)
 *                                   |-> CloudWatch Logs
 *
 * This is a starting point. Wire it to your account/bootstrap pattern and add
 * WAF, an Entra JWT authorizer, and CloudWatch alarms before production.
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

    // Lambda may read the credential secret (used once the handler is extended
    // to resolve IVANTI_SECRET_ARN at cold start).
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
}

/** Builds the Lambda environment, omitting keys that should fall back to backend defaults. */
function buildEnvironment(props: IvantiCopilotStackProps, secretArn: string): Record<string, string> {
  const env: Record<string, string> = {
    APP_ENV: props.appEnv,
    IVANTI_SECRET_ARN: secretArn,
    REQUIRE_BEARER_TOKEN: String(props.requireBearerToken ?? false)
  };

  setIfPresent(env, "IVANTI_BASE_URL", props.ivantiBaseUrl);
  setIfPresent(env, "IVANTI_ODATA_PATH", props.ivantiOdataPath);
  setIfPresent(env, "IVANTI_KB_OBJECT", props.ivantiKnowledgeObject);
  setIfPresent(env, "IVANTI_INCIDENT_OBJECT", props.ivantiIncidentObject);
  setIfPresent(env, "IVANTI_ARTICLE_URL_TEMPLATE", props.articleUrlTemplate);

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
