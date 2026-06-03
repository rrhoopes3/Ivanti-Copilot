#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { IvantiCopilotStack } from "../lib/ivanti-copilot-stack";

const app = new App();

const appEnv = str(app.node.tryGetContext("appEnv")) ?? process.env.APP_ENV ?? "dev";

new IvantiCopilotStack(app, `IvantiCopilot-${appEnv}`, {
  appEnv,
  ivantiBaseUrl: str(app.node.tryGetContext("ivantiBaseUrl")),
  ivantiOdataPath: str(app.node.tryGetContext("ivantiOdataPath")),
  ivantiKnowledgeObject: str(app.node.tryGetContext("ivantiKnowledgeObject")),
  ivantiIncidentObject: str(app.node.tryGetContext("ivantiIncidentObject")),
  articleUrlTemplate: str(app.node.tryGetContext("articleUrlTemplate")),
  requireBearerToken: bool(app.node.tryGetContext("requireBearerToken")),
  ivantiAuthHeaderValue: str(app.node.tryGetContext("ivantiAuthHeaderValue")),
  internalSharedSecret: str(app.node.tryGetContext("internalSharedSecret")),
  throttleRateLimit: num(app.node.tryGetContext("throttleRateLimit")),
  throttleBurstLimit: num(app.node.tryGetContext("throttleBurstLimit")),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function num(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
