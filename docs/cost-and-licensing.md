# Cost & Licensing

How to decide *which Microsoft path* runs this agent, and what each one
actually costs. This app is vendor-neutral middleware (AWS Lambda → Ivanti
REST); the LLM and the chat surface live **outside** this repo. That means the
licensing choice is largely independent of the code — but it dominates total
cost, so confirm it before you size anything.

> **Every dollar figure below is illustrative, pending verification.** Microsoft's
> per-seat prices, metered credit rates, and message-consumption tables change,
> and the names overlap confusingly. Treat the numbers as *shapes of the
> tradeoff*, not quotes. The "Verify before budgeting" checklist lists exactly
> what to confirm with your M365 admin and against Microsoft's live pricing.

---

## TL;DR

- This repo does **not** call any LLM. No OpenAI/Anthropic/Azure OpenAI/Copilot
  SDK — two runtime deps total (`@aws-sdk/client-secrets-manager`, `jose`). The
  "intelligence" is whatever surface calls your OpenAPI actions.
- The expensive variable is **which Microsoft Copilot SKU** you use, not the code.
- If you already pay for Copilot seats, the "save $4,500/mo" framing evaporates —
  that cost is already sunk.
- **The bundled-Chat path (most likely for us) is great for a pilot and can get
  expensive at full volume**, because metered credits scale linearly per query.
  Start metered, measure real credits/query, then decide whether to build.

---

## The three SKU scenarios

"Copilot" means three different products. The one you hold decides the architecture.

| Scenario | What it is | Cost shape for this tool |
| --- | --- | --- |
| **A. Microsoft 365 Copilot add-on** (~$30/user/mo) | Full Copilot in Teams/Office; runs declarative agents natively | Seats are **sunk** if already owned → incremental cost ≈ Copilot Studio action credits + AWS. **Go native, don't build.** |
| **B. Microsoft 365 Copilot *Chat*** (bundled with M365) | Web-grounded chat + **pay-as-you-go agents** via Copilot Studio; **no $30 seat** | **Consumption-priced, Microsoft-native, legal-clean.** Cheap at pilot volume; can exceed seat licensing at high volume — see below. |
| **C. Consumer / Bing-style Copilot** | Bundled consumer chat | No enterprise agent extensibility — would need to license A or B. |

> **Our working assumption: Scenario B** (bundled Copilot Chat). Confirm the exact
> SKU in the M365 admin center before committing — it's the single fact that
> decides everything that follows.

---

## Scenario B in detail: Copilot Chat + a Copilot Studio agent

### What you get

- Publish a **Copilot Studio agent** to Copilot Chat **without buying the $30
  add-on**. Billed **pay-as-you-go (metered)** to a linked Azure subscription,
  or via prepaid message packs (historically ~$200 / 25,000 messages ≈
  $0.008/message — *verify*).
- **The repo already supports this.** `copilot/agent-instructions.md` is written
  for "declarative agent *or* Copilot Studio agent," and the action plugin
  (`api/ivanti-copilot-actions.openapi.yaml` → API Gateway → Lambda → Ivanti) is
  exactly what a Studio agent calls. **Little to no new code** — you point a
  Studio agent at the existing endpoint.

### The trap: metered credits scale linearly

"No seats, pay only for use" sounds cheaper than licensing — but cost is
*messages-per-query × query volume*, and our volume is high (60–100k/mo). The
message count per query depends heavily on operation type.

Illustrative brackets at ~$0.008/message, **80,000 queries/mo**. The
messages-per-query column is a **placeholder to show sensitivity — not
Microsoft's published rates**:

| Messages per query | Monthly messages | Est. monthly cost |
| --- | --- | --- |
| Low (~2 — simple generative answer) | 160k | **~$1,300** |
| Mid (~8 — answer + action calls) | 640k | **~$5,100** |
| High (~30 — if expensive grounding triggers) | 2.4M | **~$19,200** |

For comparison, the **Azure-OpenAI-via-Lambda** build runs **~$200–700/mo** at the
same volume (token-billed; see below). So at full volume the "free, no-seats"
Chat path can cost *more* than the seat licensing it avoids, and 10–30× the
build-your-own path. Metered convenience isn't free at scale — you rent the whole
packaged experience (UI, identity, orchestration, answer composition) on every query.

### Our one architectural advantage

The most expensive consumption rate is **grounding responses in Microsoft 365
Graph / tenant data**. We **don't** do that — we ground in **Ivanti via our own
OpenAPI action**, not Graph. That should keep us in the cheaper "generative answer
+ agent action" band rather than the high-grounding band — the difference between
the bottom and top rows above. **Confirm this**; it's the biggest single lever on
this path's cost.

---

## The alternative: Azure OpenAI via your Lambda

If Scenario B's metered cost turns ugly at volume, the fallback **stays Microsoft**
(no new vendor, no new legal review) but swaps billing from credits to tokens.

- **Same backend.** Lambda → Ivanti is unchanged. You add a thin client that uses
  function/tool calling against the *same* OpenAPI contract, with
  `copilot/agent-instructions.md` as the system prompt.
- **You now own** the chat front-end (web app or Teams bot), identity/SSO (today
  `backend/src/security.ts` just validates Entra JWTs Copilot mints), and the
  tool-calling loop. That's the price of the cheaper tokens.
- **Token cost (illustrative)**, 80k queries/mo — sensitive to how much KB text you
  inject per query:

| Scenario | Input/query | Monthly tokens | Est. cost (~$1.25/M in, $2.50/M out) |
| --- | --- | --- | --- |
| Light (snippets) | ~1,400 + 200 out | 112M in + 16M out | **~$180** |
| Realistic (3–5 full KB articles) | ~6,000 + 300 out | 480M in + 24M out | **~$660** |

> A note on the "Grok path" that kicked off this analysis: xAI is a **new vendor**,
> which triggers procurement/security/DPA review — the opposite of staying within
> existing relationships. If you want cheap tokens *and* legal continuity, **Azure
> OpenAI** gives the same economics under your existing Microsoft MSA/DPA, with data
> in your Azure tenant.

---

## Native vs. build: the real comparison (Scenarios A/B)

Once you have a usable Copilot/agent SKU, both realistic paths are Microsoft and
consumption-priced, so it's a plain build-vs-buy:

| | Copilot Studio agent (native) | Azure OpenAI via Lambda |
| --- | --- | --- |
| LLM billing | Copilot Studio **credits** (per message) | **tokens** (per query) |
| Chat UI / Teams surface | **Free — Microsoft hosts it** | You build + host |
| Identity / SSO | **Free** (Entra, wired in `security.ts`) | You own it |
| Orchestration loop | **Free** | You build it |
| New vendor / legal review | **None** | **None** (still Microsoft) |
| Per-interaction cost | Higher per credit | Lower per token |
| Best when | Low/pilot volume; minimize eng | High volume; willing to own a front-end |

---

## Recommended plan: pilot metered, then gate on real data

Scenario B is **ideal for a pilot and possibly wrong for full rollout** — and that
sequencing is the point.

1. **Pilot (phase 1).** Ship the Copilot Studio agent on metered pay-as-you-go.
   Zero new seats, zero new vendor, ~zero new code (repo works as-is). **Set a
   billing cap** so a runaway can't hurt you. Measure **actual credits-per-query**
   on real traffic instead of guessing.
2. **Decision gate.** Project real consumption to 60–100k/mo:
   - **Low band (~$1–2k/mo):** stay native — not worth building anything.
   - **Mid/high band:** that's exactly when the **Azure-OpenAI-via-Lambda** build
     pays for itself (~$200–700/mo, same vendor, same legal posture, in exchange
     for owning a chat front-end).

The repo supports both endpoints, so you are not locked in either way.

---

## Verify before budgeting

- [ ] **Exact SKU** in the M365 admin center: *Microsoft 365 Copilot* add-on,
      *Microsoft 365 Copilot Chat*, or consumer Copilot?
- [ ] **Current metered rate** and the **message-consumption table** for Copilot
      Studio agents in Copilot Chat — specifically messages consumed by a
      *generative answer* vs. an *agent/connector action* in 2026.
- [ ] **Included/free agent capacity**, if any, vs. every action-grounded query
      being fully metered.
- [ ] **Grounding classification:** confirm Ivanti-via-OpenAPI-action does **not**
      bill at the expensive Microsoft Graph grounding rate.
- [ ] **Billing owner:** who links the Azure subscription as the pay-as-you-go
      meter, and what cap is set.
- [ ] **Real assumptions:** active users, queries/user/day, and avg KB text
      injected per query — to replace the illustrative volumes above.

---

*Independent integration scaffold; not affiliated with or endorsed by Ivanti, Inc.
or Microsoft Corporation. Product names are trademarks of their respective owners.*
