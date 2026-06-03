# Deployment & Getting Started Guide

A step-by-step path from a fresh clone to asking questions against Ivanti
knowledge from Microsoft 365 Copilot. It assumes comfort with a terminal, the
AWS console, and editing JSON/YAML — but not prior knowledge of this app or
Ivanti's API internals.

Commands use PowerShell (the repo's primary shell). Run them from the repository
root unless a step says otherwise.

---

## 0. Pick your path first

Two independent choices. For a first run, take the **left** column.

| Decision | Start here (pilot) | Later (production) |
| --- | --- | --- |
| **Auth** | Shared-secret header (`internalSharedSecret`) | Entra ID JWT (`entraTenantId` + `entraAudience`) |
| **Hosting** | AWS Lambda via CDK | Same, or Docker on ECS/Fargate |

The guide is ordered **Ivanti → AWS deploy → validate → Copilot**. Do the phases
in order; each ends with a ✅ checkpoint to pass before moving on.

---

## 1. Prerequisites (install once)

| Tool | Why | Check |
| --- | --- | --- |
| Node.js 20+ | Build/test the backend, run CDK | `node -v` |
| AWS CLI v2 | Deploy + manage the secret | `aws --version` |
| An AWS account + credentials | Target for the stack | `aws sts get-caller-identity` |
| Docker (optional) | Container hosting path | `docker --version` |
| Ivanti Neurons for ITSM tenant | The system of record | REST/OData access (see §2) |
| M365 + Copilot + Entra admin | Publish the agent | Admin or a partner who is |

A global CDK install is not required — `aws-cdk` is a dev dependency, so use
`npx cdk ...` from `infra/cdk`.

✅ **Checkpoint:** `aws sts get-caller-identity` returns the expected account ID.

---

## 2. Confirm the Ivanti side (do not skip)

The backend ships with **default guesses** for object and field names. If they're
wrong, every search returns a 502. Confirm these against the tenant before deploying.

**2a. What to find:**

- Base URL, e.g. `https://yourtenant.ivanticloud.com`
- OData path (default `/api/odata/businessobject`)
- Business object names for knowledge and incidents (defaults `KnowledgeArticles`,
  `Incidents`)
- The auth method and a working **Authorization header value** (often
  `rest_api_key=<key>` or `Bearer <token>` — Ivanti varies by tenant config)

**2b. Prove it with a raw call** (substitute real values):

```powershell
$base = "https://yourtenant.ivanticloud.com"
$auth = "rest_api_key=PUT-YOUR-KEY-HERE"   # or "Bearer ..."
curl.exe -s "$base/api/odata/businessobject/KnowledgeArticles?`$top=1" `
  -H "Authorization: $auth" -H "Accept: application/json"
```

- A JSON object with a `value` array of records → ✅ names + auth are right.
- `401/403` → auth value/method is wrong.
- `404` → object name or OData path is wrong; ask the Ivanti admin for the exact
  business object name.

**2c. Note the field names** from that record (the JSON keys). Map them to the env
vars in [../config/example.env](../config/example.env) if they differ from the
defaults (e.g. `IVANTI_FIELD_TITLE`, `IVANTI_FIELD_BODY`, the
`IVANTI_INCIDENT_FIELD_*` set). Object names are passed via CDK context; field
names, if different, are set via env vars (see §3 note).

✅ **Checkpoint:** the raw `curl` returns a knowledge record from the tenant.

---

## 3. Build, test, and deploy to AWS

**3a. Backend — build the Lambda artifact and run tests:**

```powershell
cd backend
npm install
npm run build      # produces dist/ — this is what the Lambda ships
npm test           # unit tests should all pass
cd ..
```

**3b. Infra — install and bootstrap (first time per account/region):**

```powershell
cd infra/cdk
npm install
npx cdk bootstrap   # one-time per AWS account+region
```

**3c. Deploy the pilot stack.** Pass real Ivanti values as context:

```powershell
npx cdk deploy `
  -c appEnv=pilot `
  -c ivantiBaseUrl=https://yourtenant.ivanticloud.com `
  -c ivantiKnowledgeObject=KnowledgeArticles `
  -c ivantiIncidentObject=Incidents `
  -c allowedOrigins=* `
  -c alarmEmail=you@example.com
```

> **Field-name overrides:** the CDK passes object names and common settings, but
> per-field mappings use backend defaults. If the tenant's field names differ, the
> simplest pilot fix is to set them in the Lambda console (Configuration →
> Environment variables, e.g. `IVANTI_FIELD_BODY=ArticleBody`) after deploy, or
> extend `buildEnvironment` in
> [../infra/cdk/lib/ivanti-copilot-stack.ts](../infra/cdk/lib/ivanti-copilot-stack.ts).

When it finishes, record the outputs:

```
IvantiCopilot-pilot.ApiUrl          = https://<id>.execute-api.<region>.amazonaws.com/pilot/
IvantiCopilot-pilot.IvantiSecretArn = arn:aws:secretsmanager:<region>:<account>:secret:ivanti-copilot/pilot/ivanti-auth
```

✅ **Checkpoint:** `cdk deploy` completes and prints `ApiUrl`.

---

## 4. Put the real credential in Secrets Manager

The stack created the secret with a random placeholder. Replace it with the working
Ivanti auth header (from §2) and a pilot shared secret you generate:

```powershell
aws secretsmanager put-secret-value `
  --secret-id ivanti-copilot/pilot/ivanti-auth `
  --secret-string '{\"ivantiAuthHeaderValue\":\"rest_api_key=PUT-YOUR-KEY\",\"internalSharedSecret\":\"generate-a-long-random-string\"}'
```

The Lambda reads this at cold start (no redeploy needed; allow ~1 minute for the
old container to recycle).

✅ **Checkpoint:** the command returns a `VersionId`.

---

## 5. Validate the API directly (before touching Copilot)

Use the `ApiUrl` from §3. It already includes the `/pilot/` stage.

**5a. Health (no auth):**

```powershell
curl.exe -s "https://<id>.execute-api.<region>.amazonaws.com/pilot/health"
# -> {"status":"ok","environment":"pilot",...}
```

**5b. Knowledge search (with the shared secret):**

```powershell
$api = "https://<id>.execute-api.<region>.amazonaws.com/pilot"
curl.exe -s -X POST "$api/v1/knowledge/search" `
  -H "Content-Type: application/json" `
  -H "x-internal-shared-secret: generate-a-long-random-string" `
  -d '{\"query\":\"vpn password reset\"}'
```

Reading the result:

| Response | Meaning | Fix |
| --- | --- | --- |
| `200` with `results: [...]` | Working end to end | proceed to §6 |
| `200` with `results: []` | Auth + Ivanti fine, no matches | try a query known to exist |
| `401` | Shared secret missing/wrong | check the header value matches §4 |
| `502` "Ivanti API returned 404" | Object/field name wrong | revisit §2 |
| `502` "...returned 401/403" | Stored auth header is wrong | re-run §4 |
| `502` "IVANTI_BASE_URL is not configured" | Base URL context not set | redeploy §3 with `-c ivantiBaseUrl=...` |
| `504` | Ivanti slow/unreachable | raise `-c ivantiTimeoutMs=15000`, check network |

✅ **Checkpoint:** 5b returns `200` with at least one article for a known topic.

---

## 6. Connect Microsoft 365 Copilot

With a working, authenticated API, the last mile is exposing it to Copilot as a
**declarative agent with an OpenAPI action**. Exact menus differ by M365 release,
so this is the conceptual flow — follow the tenant's current Copilot extensibility
documentation for the precise clicks.

**6a. Point the OpenAPI contract at the API.** Edit
[../api/ivanti-copilot-actions.openapi.yaml](../api/ivanti-copilot-actions.openapi.yaml):

```yaml
servers:
  - url: https://<id>.execute-api.<region>.amazonaws.com/pilot   # no trailing slash
```

**6b. Reconcile auth.** The file declares `bearerAuth` (JWT) — that's the
*production* path. For the **pilot shared-secret** path, change the security scheme
to an API key header so Copilot sends `x-internal-shared-secret`:

```yaml
components:
  securitySchemes:
    pilotSecret:
      type: apiKey
      in: header
      name: x-internal-shared-secret
security:
  - pilotSecret: []
```

(Keep a copy of the original if you plan to switch to Entra later.)

**6c. Create the agent.** Using a preferred surface — Copilot Studio (low-code) or
the Microsoft 365 Agents Toolkit (pro-code) — create a **declarative agent** and:

- Paste the instructions from [../copilot/agent-instructions.md](../copilot/agent-instructions.md).
- Add the OpenAPI file from 6a as an **action/plugin**.
- Configure the action's authentication to supply the `x-internal-shared-secret`
  value (store it as a connection secret, not in the manifest).

**6d. Walk the publishing checklist** in
[../copilot/publishing-checklist.md](../copilot/publishing-checklist.md): publish to
yourself first, test with ~20 known KB questions, confirm source links resolve.

✅ **Checkpoint:** in Copilot, ask *"search our KB for VPN password reset"* and get a
cited answer whose links open the real Ivanti articles. The integration is now live.

---

## 7. Hardening to production (once the pilot proves out)

In roughly this order:

1. **Switch to Entra ID auth.** Register an app in Entra ID, set an Application ID
   URI (the audience), and note the directory (tenant) ID. Redeploy:
   ```powershell
   npx cdk deploy -c appEnv=prod `
     -c ivantiBaseUrl=... -c ivantiKnowledgeObject=... -c ivantiIncidentObject=... `
     -c entraTenantId=<tenant-guid> -c entraAudience=api://<app-id-or-uri> `
     -c requireBearerToken=true -c allowedOrigins=https://yourdomain
   ```
   Then revert the OpenAPI security scheme to `bearerAuth` and configure the Copilot
   action to use Entra/OAuth. With `requireBearerToken=true` and Entra set, the API
   rejects any unvalidated token.
2. **Lock CORS** to the real origin instead of `*`.
3. **Confirm alarms.** Accept the SNS subscription email (from the `alarmEmail`
   context in §3) so errors and latency page you.
4. **Rotate the pilot shared secret out** once Entra is live.
5. **Field/visibility review** — ensure the Ivanti service account only sees
   approved/published KB, per [security-model.md](security-model.md).

---

## 8. Docker path (alternative to Lambda)

To run the middleware as a container (ECS/Fargate, Kubernetes, or local):

```powershell
cd backend
docker build -t ivanti-copilot .
docker run --rm -p 8080:8080 `
  -e IVANTI_BASE_URL=https://yourtenant.ivanticloud.com `
  -e IVANTI_AUTH_HEADER_VALUE="rest_api_key=PUT-YOUR-KEY" `
  -e INTERNAL_SHARED_SECRET="generate-a-long-random-string" `
  ivanti-copilot
curl.exe -s http://localhost:8080/health
```

In a container, credentials are injected as env vars (or the platform's secret
mechanism). The Secrets Manager path is used only when `IVANTI_SECRET_ARN` is set
and no env credential is present. Put the container behind HTTPS + the same auth,
then point the OpenAPI `servers` url at it instead of the API Gateway URL.

---

## 9. Day-2 operations

- **Logs:** CloudWatch log group `/aws/lambda/ivanti-copilot-<env>` (correlation IDs
  included; bodies/tokens deliberately are not).
- **Alarms:** Lambda errors/throttles/p99 duration and API 5xx/p99 latency.
- **Update + redeploy:** `cd backend; npm run build` then
  `cd infra/cdk; npx cdk deploy -c appEnv=<env> ...`.
- **Preview changes first:** `npx cdk diff -c appEnv=<env> ...`.
- **Tear down:** `npx cdk destroy -c appEnv=pilot`. The credential secret is
  **retained** on purpose — delete it manually if it should be removed.

---

## Quick troubleshooting index

| Symptom | Most likely cause | Section |
| --- | --- | --- |
| Raw Ivanti curl 404 | Wrong object name / OData path | §2 |
| Search 502 (Ivanti 404) | Field/object mapping | §2, §3 note |
| Search 502 (Ivanti 401/403) | Stored auth header wrong | §4 |
| Search 401 | Shared secret mismatch | §4, §5 |
| Search 504 | Ivanti slow/unreachable | raise `ivantiTimeoutMs` |
| Copilot can't reach API | `servers` url or action auth | §6a, §6b |
| Token rejected in prod | Entra tenant/audience mismatch | §7 |
