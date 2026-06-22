# Design Taste Model

How "taste" is encoded in the sign knowledge base so agents can use it. Taste is not one field. It is three strata, each stored and consumed differently.

---

## The three strata

### 1. Rules (semi-objective, machine-checkable)
Things that are close to objective and can be violated. A proofing agent can literally test these.

Examples: letter height vs. viewing distance, contrast thresholds for legibility, stroke-width ratios, mounting heights, ADA tactile specs, illumination evenness, copy-to-cabinet whitespace ratios.

- Source: codes, standards, physics, and a small set of established legibility formulas.
- Storage: a rules library, each rule with a check definition and a citation.
- Built by: Claude, mostly autonomous. These do not need Michael's eye.

### 2. Principles (craft heuristics, fuzzy but teachable)
The difference between a pro sign and an amateur one. Not pass/fail, but strongly directional.

Examples: optical overshoot on rounded letterforms, reveal consistency, baseline alignment across tenant panels, return treatment, negative-space balance, restraint in accent color, material pairing.

- Source: extracted from the drawing corpus (`design_assessment.craft_observations` is the seed) plus established sign-craft knowledge.
- Storage: a principles library, each entry as principle + rationale + example record IDs.
- Built by: Claude mostly, with Michael spot-correcting where the corpus is wrong.

### 3. Exemplars (graded reference cases, subjective)
The genuinely aesthetic layer. No rules. Stored as judged examples; agents reason by analogy and visual similarity, not by lookup.

- Source: the corpus itself, graded for quality.
- Storage: every record's `design_assessment.quality_grade`.
- Built by: **Michael.** This is the irreplaceable input.

---

## The honest constraint: whose taste

A KB of the corpus is not a KB of *good* taste. Some drawings are mediocre. Indiscriminate extraction averages toward the industry mean, which is forgettable, and a mockup or proofing tool trained on the mean produces mean-looking work.

Encoding *good* taste requires a quality signal. The rules and principles layers can be built without it. The exemplar layer cannot. The signal is Michael's grade, calibrated to Tradecraft's standard rather than generic competence.

The rubric below exists so grading a batch takes minutes, not hours.

---

## Grading rubric (5-point, applied per record)

Grade the **execution**, not the brand or the budget. A simple sign can be exemplary; an expensive one can be poor.

| Grade | Meaning | Test |
|---|---|---|
| exemplary | reference-quality, would show a client as best-in-class | nothing to fix; others should copy this |
| strong | clearly good, minor nits only | would ship proudly |
| competent | correct and clean, unremarkable | would ship, would not feature |
| weak | functional but with real craft or composition problems | needs rework before proud delivery |
| poor | violates rules or reads amateur | do not learn taste from this |

Score against four axes, let the lowest dominate:
1. **Legibility & hierarchy** — does the eye land in the right order at the right distance.
2. **Craft** — reveals, alignment, proportion, optical adjustments, finish discipline.
3. **Restraint** — color, type, and material choices earning their place vs. noise.
4. **Site fit** — does it belong where it sits, day and night.

Records graded `competent` or below are excluded from the exemplar set the design features learn from. They stay in the KB for construction knowledge; they just do not teach taste.

---

## How the two features consume this

### Proofing review
- **Rules**: hard flags. "Letter height below legibility for stated setback." Defensible, automatic.
- **Principles**: soft flags. "Tenant baselines inconsistent." "Accent color competing with itself."
- **Exemplars**: comparison. "Strong comparable monuments in this vertical handle the base differently."
- Aesthetic flags are always tagged opinion, never presented as error.

### Mockup generator
- **Construction KB**: makes the generated sign buildable, not fantasy.
- **Material optical_behavior**: makes it photograph real — translucent faces glow evenly at night, brushed aluminum reads as metal, faux brick recedes in shadow. This is the photorealism layer.
- **Principles + exemplars**: composition, scale against the building, mounting realism.
- The `tradecraft-sign-render` skill is already the prompt-translation core. The KB generalizes and deepens it.

**Sequencing note:** the mockup tool's critical path is construction realism + material optical behavior, both already in the KB build. Subjective taste is the later polish layer. Do not block the tool on solving aesthetics.
