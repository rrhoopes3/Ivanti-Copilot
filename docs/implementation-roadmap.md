# Implementation Roadmap

## Phase 0: Discovery

Duration: 2-5 business days.

Deliverables:

- Confirm Microsoft licensing and target Copilot surface.
- Confirm Ivanti REST API auth method.
- Identify knowledge article and incident business object names.
- Identify pilot article categories and agent pilot group.
- Decide whether Phase 1 uses live search only, Graph connector indexing, or both.

## Phase 1: Read-Only Knowledge Search

Duration: 1-2 weeks.

Deliverables:

- AWS API endpoint for `searchKnowledge`.
- Configurable Ivanti object and field mappings.
- Copilot action OpenAPI contract.
- Pilot agent instructions.
- CloudWatch request logging.

Acceptance criteria:

- Agents can ask Copilot a KB-style question and receive top matching articles.
- Responses include article title, source link, article ID, and excerpt.
- No ticket write operations exist.
- No secrets appear in logs.

## Phase 2: Article Retrieval and Similar Incidents

Duration: 2-4 weeks.

Deliverables:

- `getKnowledgeArticle` action.
- `findSimilarIncidents` action using resolved incidents and allowlisted fields.
- Improved result ranking and confidence scoring.
- Feedback capture for useful/not useful results.

Acceptance criteria:

- Copilot can ground a response in a specific Ivanti article.
- Similar incident lookup excludes private notes and sensitive requester details.
- Pilot agents report measurable search-time reduction.

## Phase 3: Indexed Knowledge Grounding

Duration: 3-6 weeks, dependent on licensing and governance.

Deliverables:

- Scheduled Ivanti KB export or connector sync.
- RTF/HTML cleanup to structured Markdown.
- Graph connector indexing for approved KB content.
- Search quality and citation validation.

Acceptance criteria:

- Indexed content respects approved visibility boundaries.
- Removed or retired KB articles age out according to policy.
- Search results are materially better than manual Ivanti search for pilot categories.

## Phase 4: Knowledge Retention Workflows

Duration: 4-8 weeks.

Deliverables:

- Repeated-incident detection.
- Draft KB article suggestion workflow.
- Human approval queue.
- Article review-date and ownership hygiene report.

Acceptance criteria:

- Copilot can suggest a draft article from repeated resolved tickets.
- No article is published without owner review.
- ITSM leadership can see knowledge gaps by category and volume.

## Closing the functionality gap vs. Ivanti native AI

A recurring question: *can this repo replicate what Ivanti's native AI tiers
(Premium / Enterprise Premium) do — KB authoring, summarization, agentic
resolution — so we avoid a per-analyst tier upgrade?* Mostly yes, but the effort
is **not uniform**. The gap splits into four tiers. Today this repo is read-only:
the OpenAPI contract exposes only search/retrieval actions and **no write
endpoints**, by design (Ivanti stays the system of record).

| Tier | Capability | Closeable? | Cost to close |
| --- | --- | --- | --- |
| **1** | Ticket summarization; KB **draft text** generation | **Today** | ~zero — pure LLM, prompt/agent config, no middleware change |
| **2** | Persist drafts/feedback into Ivanti + approval queue | **Yes** | Phase 4: ~4–8 wks + ongoing ownership |
| **3** | Per-user write authorization (act *on behalf of* caller) | **Yes, carefully** | Design change + security review |
| **4** | Autonomous **end-to-end** resolution (route/update/close) | **Not worth it** | Re-building a workflow engine on the REST API |

**Tier 1 — pure LLM, no write.** Summarization and draft KB *text* are things any
LLM already does; feed the existing read endpoints (incident + resolution text) to
the agent and it produces them now. Not really a missing feature — just configuration.

**Tier 2 — needs write endpoints.** *Persisting* a draft (create KB article,
capture feedback) requires new POST/PATCH actions, **write scopes on the Ivanti
service account** (currently read-only), and the Phase 4 **human approval queue** —
nothing publishes without owner review.

**Tier 3 — the quiet hard part.** Once the agent writes, the security model flips
from "bounded, cited, read-only" to "mutates the system of record." You must answer
*on whose behalf* it acts — propagating caller identity into Ivanti write authz,
not a single service credential. Design work, not a toggle.

**Tier 4 — the actual moat.** Ivanti's agentic AI resolves incidents end-to-end via
its native **workflow/business-rule engine**. Matching that means re-implementing
orchestration, escalation, rollback, and guardrails against an LLM mis-resolving a
real ticket — on an API not designed to be a workflow engine. **Do not replicate
this.** This is the capability the Enterprise Premium upgrade actually buys.

**Governance caveat.** Every tier past read-only erodes the security simplicity that
is this design's strongest selling point. "Read-only, cited, system-of-record
preserved" is easy to get signed off; "the agent writes and closes tickets" is a
much heavier review. That alone is a reason to stop at Tier 2 even if Tier 4 were free.

**Decision framing.** Tiers 1–2 capture ~80% of practical value (search + summarize
+ assisted KB authoring, in Teams/M365) **without an Ivanti tier upgrade**. The
upgrade is really paying a fleet-wide per-seat price for **Tier 4** (true autonomy)
plus native in-console UX and vendor support. Weigh that against the per-analyst
delta in [`cost-and-licensing.md`](./cost-and-licensing.md) and
[`ivanti-tier-vs-custom-cost.md`](./ivanti-tier-vs-custom-cost.md).

