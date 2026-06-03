# Security Model

## Security Objectives

- Keep Ivanti credentials out of Microsoft agent configuration.
- Avoid sending unrestricted ticket data to Copilot.
- Return only the fields needed for grounded ITSM assistance.
- Preserve auditability for every Copilot-triggered lookup.
- Start read-only and require human approval for any write workflow.

## Authentication

Recommended production path:

- Microsoft 365 Copilot action authenticates through Entra ID.
- API Gateway validates caller tokens with a JWT authorizer.
- Lambda receives verified claims and applies endpoint-level authorization.
- Lambda authenticates to Ivanti with a least-privilege service credential stored in Secrets Manager.

Pilot fallback:

- API Gateway key or shared internal secret for a narrow IT-only pilot.
- Explicit expiration date and migration plan to Entra-backed auth.

## Authorization

Initial allowlist:

- IT service desk agents can call search and article retrieval.
- Platform admins can view operational health.
- No public employee self-service until answer quality and visibility controls are validated.

Field allowlist:

- Article ID
- Title
- Summary
- Excerpt
- Category
- Status
- Last reviewed or modified date
- Source URL

Excluded by default:

- Private ticket notes
- Customer/personally identifiable details
- Credentials, secrets, tokens, passwords
- Unapproved draft knowledge
- Attachments unless explicitly reviewed

## Data Retention

CloudWatch logs should capture:

- Timestamp
- Request path and operation
- Correlation ID
- Caller tenant/user/group claim where available
- Result count
- Latency
- Error class

CloudWatch logs should not capture:

- Full article bodies
- Full ticket descriptions
- Access tokens
- Ivanti API keys
- Secrets or generated answers

## AI Safety Guardrails

The Copilot agent instructions should require:

- Source citations for procedural IT guidance.
- Refusal or escalation when no matching source exists.
- No credential disclosure.
- No destructive or state-changing action during the initial rollout.
- Clear separation between retrieved source facts and inferred recommendations.

## Production Readiness Checklist

- Entra ID auth configured and tested.
- Ivanti service account has least-privilege permissions.
- Secrets stored in Secrets Manager, not environment variables.
- API Gateway throttling enabled.
- WAF rules applied to public endpoints.
- CloudWatch alarms configured for 4xx, 5xx, latency, and Ivanti API failures.
- Incident response owner identified.
- Data classification review complete.
- Pilot acceptance criteria approved.

