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

