# Copilot Publishing Checklist

## Before Pilot

- Confirm target Copilot surface and licensing.
- Register the AWS API as an approved enterprise app or action endpoint.
- Configure authentication for the action endpoint.
- Review OpenAPI operation descriptions for least privilege.
- Validate agent instructions with the security and ITSM owners.
- Test with 20-30 known KB questions.
- Confirm source links open for the intended pilot users.

## Pilot Controls

- IT-agent-only audience.
- Read-only actions.
- Low-risk KB categories first.
- Daily review of errors and unsupported questions.
- Feedback path for bad results or missing KBs.

## Production Controls

- Entra-backed authentication.
- API Gateway throttling and WAF.
- Monitoring dashboard.
- KB ownership and stale-article reporting.
- Change-management process for new actions.

