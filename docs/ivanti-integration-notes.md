# Ivanti Integration Notes

Ivanti Neurons for ITSM tenants can differ in business object names, field names, and API exposure. Treat the values in this scaffold as defaults to confirm, not as guaranteed production names.

## Values To Confirm

- Base URL for the Ivanti tenant.
- REST API authentication method.
- Knowledge article business object name.
- Incident business object name.
- Field names for title, summary, body, status, category, owner, review date, modified date, and article number.
- URL pattern for deep-linking back to a knowledge article.
- Whether API responses enforce article visibility rules for the authenticated user or only the service account.

## Suggested Knowledge Article Mapping

| App Field | Ivanti Field To Confirm |
| --- | --- |
| `id` | `RecId` or article number |
| `title` | `Title` |
| `summary` | `Summary` |
| `body` | `Body` or rich text body field |
| `category` | `Category` |
| `status` | `Status` |
| `updatedAt` | `LastModDateTime` |
| `reviewDate` | Review date field |

## Suggested Incident Mapping

| App Field | Ivanti Field To Confirm |
| --- | --- |
| `id` | `RecId` |
| `incidentNumber` | `IncidentNumber` |
| `subject` | `Subject` |
| `description` | `Symptom` or description field |
| `resolution` | `Resolution` |
| `status` | `Status` |
| `category` | `Category` |
| `closedAt` | Closed date field |

## Search Strategy

Start with simple live API search:

- Search title and summary first.
- Include body excerpts only after validating response size and sensitivity.
- Filter to approved/published knowledge statuses.
- Limit results to 5-10 records per Copilot request.

Then add semantic indexing if needed:

- Export approved KB content.
- Convert rich text to clean Markdown.
- Chunk by article sections.
- Store source metadata and Ivanti links.
- Index through Microsoft Graph connector, OpenSearch, Kendra, or another approved search layer.

