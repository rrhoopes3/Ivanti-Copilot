# Ivanti Base vs. Enterprise Premium — AI Cost Decision

*A short, slide-style brief. The real question isn't "Ivanti AI vs. our repo" —
it's: **do we upgrade every analyst's Ivanti license to get native AI, or stay on
our current tier and ground Microsoft Copilot in Ivanti with this middleware?***

> **All dollar figures are estimates.** Ivanti does not publish AI/tier pricing —
> it's quote-only, per-analyst. Numbers below are planning anchors, labeled
> **(est.)**, meant to get you to a defensible range. Replace the two starred
> inputs with your real Ivanti quote and seat count and the answer falls out.

---

## Slide 1 — The decision in one line

You are choosing between **paying per analyst seat (flat)** and **paying per query
(usage)**:

| | **Upgrade Ivanti → Enterprise Premium** | **Stay on base tier + this repo** |
|---|---|---|
| You get | Native AI *inside Ivanti* (KB gen, summarize, virtual agent, agentic) | AI grounding *inside M365 / Teams Copilot* |
| You pay for | A **tier upgrade × every analyst**, forever | **LLM usage + ~$30/mo AWS infra** |
| Cost shape | **Flat, predictable, per-seat** | **Variable, scales with query volume** |
| Pay for idle? | Yes — every seat, used or not | No — only metered queries |
| FedRAMP / pre-2024.2 SaaS | **Not available at any price** | Works |

---

## Slide 2 — Estimated unit prices

Per **analyst** (the person working tickets), per month:

| Ivanti tier | Est. $/analyst/mo | Notes |
|---|---|---|
| **Base (Professional-class)** | **~$75–95 (est.)** | No generative AI |
| **Premium** | ~$110–140 (est.) | Adds AI + self-healing |
| **Enterprise Premium** | **~$130–165 (est.)** | All packages + AI |
| **AI upgrade delta (base → Ent. Prem.)** | **~$55–75/analyst/mo (est.)** | This is the number that matters |

> **★ Input 1 — your real Enterprise-Premium-minus-base delta.** Ask Ivanti sales.
> We use **$60/analyst/mo** as the planning midpoint below.

Our side, per month (from `cost-and-licensing.md`):

| Component | Est. $/mo | Notes |
|---|---|---|
| AWS infra (Lambda + API GW + WAF + Secrets) | **~$15–40** | Fixed, ~flat to volume |
| LLM — **M365 Copilot seats already owned** | **~$0 incremental** | Cost is sunk |
| LLM — **Azure OpenAI via Lambda** | ~$200–700 | Token-billed; cheapest at volume |
| LLM — **metered Copilot Chat** | ~$1,300–5,100 | The expensive, usage-linked band |

---

## Slide 3 — Worked annual cost (the number you wanted)

**Enterprise Premium upgrade** = `delta × analysts × 12`, at **$60/analyst/mo (est.)**.
**This repo** = AWS infra + your chosen LLM path, annualized.

| Analyst seats | **Upgrade to Ent. Premium /yr (est.)** | Repo: Copilot seats owned /yr | Repo: Azure OpenAI /yr |
|---|---|---|---|
| **10** | **~$7,200** | ~$400 | ~$8,400 |
| **25** | **~$18,000** | ~$400 | ~$8,400 |
| **50** | **~$36,000** | ~$500 | ~$8,400 |
| **100** | **~$72,000** | ~$500 | ~$8,400 |

> Repo LLM cost is driven by **query volume, not seat count**, so its columns stay
> ~flat as analysts grow. Ivanti's upgrade grows **linearly with every seat**.
> Azure-OpenAI column assumed at the ~$660/mo realistic band, ~80k queries/mo.

**Read-off:**
- If **Copilot seats are already owned**, the repo is **~$400–500/yr** — cheaper than
  the Ivanti upgrade at *every* seat count above.
- If you fund **Azure OpenAI** (~$8.4k/yr), the upgrade is cheaper only **below ~12
  analysts**; above that, staying on base + repo wins.
- The repo only loses on cost if you land in the **metered Copilot Chat** band
  (~$60k/yr) *and* have few analysts — the one outcome to validate with real traffic.

---

## Slide 4 — But cost isn't the only axis

Cheaper ≠ better fit. What the upgrade buys that the repo does **not** (today):

| Capability | Ent. Premium (native) | This repo |
|---|---|---|
| Answer/grounding from Ivanti KB & incidents | ✅ | ✅ |
| Lives in **Teams / M365 Copilot** | ❌ (lives in Ivanti) | ✅ |
| **Write-back** — resolve/route/update tickets | ✅ (agentic, GA later 2026) | ❌ (read-only) |
| **Auto KB authoring + ticket summarization** | ✅ | ❌ (roadmap) |
| Zero infrastructure to run | ✅ | ❌ (you operate AWS) |
| Works on **FedRAMP / on-prem / pre-2024.2** | ❌ | ✅ |
| Tight data-egress control + field allowlists | partial | ✅ |

---

## Slide 5 — Recommendation

1. **Already paying for Enterprise Premium (or will, for other reasons)?**
   Native AI is effectively **sunk cost** — use it inside Ivanti, don't build.
2. **On a base tier and want AI in Teams/Copilot, or on FedRAMP/on-prem?**
   **Stay on base + this repo.** At ~$400–700/yr (Copilot owned) it's far below a
   fleet-wide upgrade, and it's the only option where Ivanti AI isn't purchasable.
3. **Want native write-back + auto-KB and have many seats?**
   The upgrade earns its cost — the repo can't do those yet.

**The trap on both sides is paying for capacity you don't use:** Ivanti's is **per
idle seat**, ours is **per metered query**. Size whichever you pick to *actual* use.

---

## To turn these estimates into your numbers

- [ ] **★ Input 1:** Ivanti **Enterprise-Premium-minus-base $/analyst/mo** (sales quote).
- [ ] **★ Input 2:** your **analyst seat count**.
- [ ] Which **LLM path** (Copilot seats owned / Azure OpenAI / metered Chat)?
- [ ] Real **query volume/mo** (replaces the ~80k assumption).
- [ ] Then: `Upgrade/yr = Input1 × Input2 × 12` vs. `Repo/yr = infra + LLM path`.

---

*Independent integration scaffold; not affiliated with or endorsed by Ivanti, Inc.
or Microsoft Corporation. All pricing is estimated and unofficial — verify against
vendor quotes before budgeting.*
