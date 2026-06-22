# Platform Architecture — the Knowledge Layer and the Modules Around It

## The central-brain idea, made precise
The KB is the central shared knowledge layer, and it is the moat. That part of the vision is right. What it is not is the brain for everything. It is the sign-domain *knowledge* brain, and several modules need data it does not and should not hold. Three kinds of data keep getting collapsed into one, and keeping them apart is what keeps the KB clean and reusable:

1. **Knowledge layers** — what is true about a domain. The sign KB (built). Later, parallel layers that do not exist yet: a codes/regulatory layer (ADA 2010, ICC A117.1, IBC Ch. 11, local amendments) and a decorated-apparel layer. Each is its own corpus plus serving API plus derivations.
2. **Operational data** — what is happening on a job: jobs, surveys, photos, schedules, machine/department/employee capacity, crews, costs. Per-tenant, transactional. Lives in the modules, never in the KB.
3. **Modules** — the apps that do the work. Each composes knowledge plus operational plus cost data through contracts.

The rule that holds it together is the one we already set: modules bind to knowledge through the serving API and derivations, and hold their own operational data. The KB feeds context. It is not the system of record for jobs, costs, schedules, or other domains.

## The module map
For each: what it pulls from the KB, what else it needs, honest size and dependency.

| Module | From the KB | Also needs | Honest read |
|---|---|---|---|
| **Proof reviewer** | design canon (rules, principles, exemplars), compliance | the proof under review | Small agent/skill. Real value gated on the design-taste grading pass populating the canon. Near-term. |
| **Sign mockup generator** | construction patterns, `optical_behavior`, typology, completeness templates (for the BOM) | a render pipeline, site photo, job geometry | Large standalone app, as you said. Flagship. The KB makes its output buildable and quotable; the renderer and geometry are its own. |
| **Vehicle-wrap mockup + BOM** | wrap records, material behavior | render pipeline, vehicle templates | Same pattern as sign mockup, but the corpus has exactly one wrap today. Blocked on more wrap data before it is real. |
| **ADA / wayfinding takeoff** | sign types, `message_schedule` patterns | a **codes knowledge layer that does not exist yet**, plus floor-plan parsing | Large. This is "build a second domain KB plus a plan parser." Genuinely valuable, genuinely a major effort. Gated on the codes layer. |
| **Site survey tool** | taxonomy for field classification | dispatch, photo, location, job data | Medium app, and a **producer**: writes new records back to the KB. Pairs naturally with ingestion. |
| **Decorated-apparel mockup/BOM** | nothing from the sign KB | a **separate apparel knowledge layer** | This is the entire sign-KB effort repeated for a new domain. A parallel track, not something this KB feeds. Be honest with yourself that it is a second corpus to build. |
| **Vendor/material ingestion** | writes to the reference/material layer | product literature, sites | Small-to-medium. Extends the ingestion side. Part of the platform core. |
| **Pricing / quoting engine** | completeness templates, material crosswalk (derivations) | per-tenant cost catalog | Bryant's workstream. Parallel, not ours to build. |
| **Production / workflow management** | routing templates (the step skeleton per sign type) | jobs, BOM, machine/dept/employee capacity, scheduling, crews | **The biggest one by far.** A real manufacturing-execution-and-scheduling system. The KB supplies a small, valuable input (how a sign type explodes into steps); everything else is a separate large product companies spend years on. Do not let the KB's small contribution disguise the size of the rest. |
| **Self-correcting KB** | the corpus | a change-set + audit store | Medium feature. See below — must be governed, not chat-auto-rewrite. Fits the platform core. |
| **Design-taste ranker** | records to grade | nothing | Small feature, great UX call. See below. Platform core. |

## Two of your ideas deserve specific design notes

**Self-correcting KB.** The instinct is right; the naive version is dangerous. A chat correction cannot be allowed to rewrite the corpus directly — one wrong "correction," or a cascade from "fix everything related to that," could quietly corrupt validated records. The safe shape: a correction *proposes a change set*, shows you the exact diff (which records and fields), re-validates and re-embeds the affected records, runs the eval suite to confirm nothing else regressed, and commits only on your approval, with an audit trail and one-click revert. Propose, verify, approve, commit, audit. This maps cleanly onto the approvals and evals the agent framework already gives you.

**Design-taste ranker.** The swipe interface is the right call, and one upgrade makes it both easier and more reliable: don't grade signs in isolation, compare them in pairs. "Which of these two is better?" produces a far more consistent ranking (Elo-style, from many pairwise choices) than absolute swipe-good/swipe-bad, and the UX is just as simple — two cards, pick one. It is also genuinely shareable: you can crowdsource taste judgments from other designers and average them, which is harder to do credibly with absolute scores. The output still lands as `quality_grade` on the records.

## The scope line
**Buildable now, coherent, and exactly what delivers your two stated needs plus the clean adjacent features — the PLATFORM CORE:**
the KB serving surface (in build), the console (search, browse, verify), the chat agent, the Eve-based multi-agent ingestion, vendor/material ingestion, the design-taste ranker, and governed self-correction. One platform, on one Supabase, on your stack.

**Everything else is a module:** a separate product that binds to the platform's contracts and gets built on its own track. Several are blocked on data or knowledge that does not exist yet — the codes layer, the apparel layer, more wrap records, the operational and cost stores, Bryant's pricing engine. They are not late because of effort; they are late because their inputs are not ready.

## How the build should actually run
The discipline that got the KB to 229 clean records was vertical slices, acceptance gates, and checkpoints. A single swarm told to "build, test, and verify the whole thing and notify me when ready" abandons exactly that discipline, and on the full constellation it produces sprawl, not a testable platform. So:

- **Scope the Claude Code run to the platform core.** Not the modules.
- **Within a phase, swarm freely.** Parallel agents, aggressive building. This is where ultracode earns its keep.
- **Between phases, stop at the acceptance criteria and the eval suite, and surface.** Autonomous within a slice, gated between slices. That is how the run comes back actually ready to test instead of confidently broken.

The modules then attach to the finished core one at a time, each as its own scoped build against the contracts the core exposes.
