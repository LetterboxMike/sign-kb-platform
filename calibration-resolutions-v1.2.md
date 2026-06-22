# Calibration Rulings → Contract v1.2

Resolves the Batch 1 review queue. The record shape (v1.0 lock) is unchanged. These are vocabulary and optional-field refinements, exactly what the calibration checkpoint exists to catch before scaling. Apply them, re-process the 13 calibration records, then proceed to Batch 2.

---

## Ruling 1 — `fabrication_family` redesign (clears 6 of 8 queued)

**Diagnosis.** The seeded `fabrication_family` values were too granular. They fused construction + illumination + form into one string (e.g. `extruded_aluminum_cabinet_push_thru_facelit`), so almost any new drawing trips `proposed_new_term`. A family that doesn't generalize isn't a family.

**Fix.** `fabrication_family` becomes a small CLOSED set of broad construction archetypes. Specificity moves to `sub_type` (open) and component-level `fabrication_method` (open). Category, illumination, and mounting are already separate fields and carry their own meaning.

**New closed set:**
- `cabinet` — fabricated/extruded box with one or more faces (lit or unlit)
- `channel_letter` — fabricated individual letterforms with returns
- `dimensional_letter_or_logo` — solid cut/fabricated letters, logos, flat-cut-out (FCO), non-channel
- `panel` — flat fabricated sign panel (room ID, directional, plaque, fascia band)
- `blade` — projecting or suspended double-sided sign
- `composite_structure` — multi-system built structures (pylons, trellis/masonry monuments)
- `digital_display_assembly` — sign whose face is a direct-view/modular electronic display (EMC)
- `proposed_new_term` — escape hatch (should now fire rarely)

**Selection rule.** Pick the **dominant construction archetype**. Secondary constructions (e.g. an accessory cabinet on a dimensional-letter wall treatment) are captured in `structure[]` components, not in the family.

**Remap table** (apply to all 13 calibration records and the example records):

| Old value | New `fabrication_family` |
|---|---|
| extruded_aluminum_cabinet_facelit / _backlit / _push_thru_facelit | `cabinet` |
| post_and_panel | `panel` (mounting: post) |
| post_mounted_plaque | `panel` (mounting: footer/post) |
| dimensional_letters_plus_cabinet | `dimensional_letter_or_logo` (cabinet as component) |
| suspended_hatbox_cabinet | `blade` |
| fabricated_aluminum_pylon_spine | `composite_structure` |
| composite_timber_masonry | `composite_structure` |
| channel_letter (Tin Building) | `channel_letter` |
| (Delta EMC) | `digital_display_assembly` |

Most of the 6 queued records clear once remapped, assuming no other flag.

---

## Ruling 2 — Competing design options (Athens blade)

**Ruling: one record per substantive option, not one record with alternatives buried in `extraction_meta`.** Competing options are distinct designs and distinct design knowledge; collapsing two of three throws away buildable detail and exemplar value. They are NOT variants (variants = same design, trivial copy difference).

**New optional fields** (additive):
- `option_set_id` — links options from the same drawing
- `design_status` — enum: `proposed_option`, `selected`, `built`, `unbuilt_concept`

Tag each option record with the shared `option_set_id` and the right `design_status` (default `proposed_option` for conceptuals). This lets the pricing/spec side filter out unbuilt concepts while the design/taste side still learns from them. Re-model Athens as 3 records.

---

## Ruling 3 — `doc_type` += `design_intent`

"Design intent" is a real stage between conceptual and shop: full design, some specs still TBD. Add `design_intent` to the `doc_type` enum. R3 (completeness varies by doc_type) applies — do not flag a design-intent drawing's missing fabrication specs as a gap. Re-tag Cornell.

---

## Ruling 4 — Digital display / EMC (Delta)

Add `digital_display` to `sign_category` and `digital_display_assembly` to `fabrication_family` (Ruling 1). An EMC's primary nature is the screen. `digital_integration: true` still applies. NanoLumens is already researched with `optical_behavior` — correct, keep it.

---

## Ruling 5 — 3M VHB is not the films entry (confirm agent)

Correct call. 3M VHB is 3M Industrial (structural bonding), a different knowledge domain than 3M Commercial Graphics (films). Create a separate reference entry (`mfr-3m-industrial` / `comp-3m-vhb`) in the `structural_adhesive` category alongside Parker Lord. Do not link adhesives to the films entry.

---

## Ruling 6 — Reference research policy (formalize)

The agent stubbed 4 entries and fully researched only the mockup-critical display. That's the right instinct; make it policy:
- **At extraction:** capture every new manufacturer/component as an identified stub (name, category, what it is from context). Keeps batches fast.
- **Inline-research only** the mockup-critical ones (displays, and any material/finish whose `optical_behavior` the mockup tool needs).
- **Run a dedicated reference-enrichment pass** afterward that researches all stubs in one bounded batch. Decouples manufacturer research from per-drawing extraction, as designed.

This prevents accumulating 100 stubs and prevents research rabbit-holes slowing the batches.

---

## Ruling 7 — Environment

Pin `jsonschema>=4.18` (Draft 2020-12) in the repo/skill so the gate's `Draft202012Validator` is always available. Bundled 3.2.0 lacks it.

---

## How to continue

1. Apply v1.2 to the contract and schema (the schema is already updated; mirror the vocab in `extraction-contract.md`).
2. Remap `fabrication_family` on all 13 calibration records via the Ruling 1 table; re-run `validate.py`; re-route now-clean records from `review-queue/` to `records/`.
3. Re-model Athens as 3 option records (Ruling 2). Re-tag Cornell `design_intent` (Ruling 3). Re-tag Delta (Ruling 4). Split the 3M VHB reference entry (Ruling 5).
4. Confirm the queue is clear or down to genuine edge cases, then proceed to **Batch 2** (~25–30 drawings) under the same skill and stop-and-log discipline.
