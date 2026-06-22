# Skill: sign-drawing-extraction

Turn a sign drawing (PDF, image, or multi-sign package) into validated knowledge-base record(s) conforming to contract v1.1. This is the repeatable procedure the corpus runs through. It does not re-explain the contract; it executes it.

## When to use

Any time a sign drawing needs to become KB data: conceptuals, permit sets, shop drawings, as-builts, surveys, wraps, flat graphics.

## Inputs and layout

```
/schema/sign-record.schema.json        # the validation gate's rules (v1.1)
/contract/extraction-contract.md        # vocab + ruleset (human reference)
/reference/manufacturer-reference.json  # normalized manufacturer/component knowledge
/reference/design-canon-seed.json       # principles to ground design_assessment
/records/                               # source of truth, one file per record
/review-queue/                          # flagged records + proposed_new_term candidates
/scripts/validate.py                    # the gate
```

## Procedure

**1. Read the drawing fully.**
- PDF: extract text (`pdftotext -layout`) AND render the key spec/elevation pages to image and view them. Drawings carry critical data visually (callouts, schedules, dimensions) that text extraction misses.
- Image: view directly.
- Capture every construction note, color/finish schedule, dimension, and illumination spec.

**2. Determine `record_type`.** `fabricated_sign` (built sign with structure/mounting), `flat_graphic` (graphic applied to a surface, no structure), or `vehicle_wrap` (deferred — emit the marker and queue for sibling spec).

**3. Package check.** One file often contains many signs. Emit one record per distinct sign type (rule R2, multi-record-per-file). Collapse trivial variants (level letter, donor copy, room number) into ONE design record plus `program_model` or, for wayfinding, `message_schedule`. Never mint near-duplicate records.

**4. Populate the record** per the schema: `classification`, `structure[]`, `materials_manifest[]`, `dimensions`, `knowledge`, `messaging_pattern`, `design_assessment`, `compliance` (only if regulated), `open_items`.

**5. Apply the ruleset (R1–R7).**
- **R1 PII**: strip vendor, client, human names, contacts, addresses, donor/personal copy. Keep industry vertical and copy *structure*. Set `copy_content: excluded_pii`.
- **R2**: variants collapse (step 3).
- **R3**: completeness varies by `doc_type`. A conceptual with brand colors and no product codes is complete, not a gap.
- **R4**: manufacturer normalization (step 6).
- **R5**: express intra-sign mounting (`mounted_via`, `mounted_to`, `mounting_relationship`).
- **R6**: ambiguous → flag in `extraction_meta`, never guess. Note spec/rendering conflicts.
- **R7**: layered constructions → ordered `material_buildup`.

**6. Normalize manufacturers and techniques.** For each named manufacturer, component, or distinctive technique (SignComp, Indect, neon, etc.): look it up in `manufacturer-reference.json` by id. If present, link via `manufacturer_normalized_id` / `component_ref`. If absent, research it once (corpus-relevant depth, not catalog-cloning), add an entry (company + component + `optical_behavior` where it matters for the mockup tool), then link. Research is bounded and happens once per product, ever.

**7. Tag provenance** on every field group: `drawing`, `inferred`, `researched`, or `opinion`.

**8. Controlled vocabulary.** Use existing enum values. For a genuinely new value, set `proposed_new_term` and record the candidate in `/review-queue/` with context. Do not silently invent a synonym.

**9. design_assessment.** Fill `rules_observations` and `craft_observations`, grounded in `design-canon-seed.json` principles. Leave `quality_grade: null` with `grade_provenance: ungraded_pending_review` — grading is a human pass.

**10. Validate.** Run `python scripts/validate.py <record.json>`. Pass and no flags → write to `/records/`. Schema failure or any flag → write to `/review-queue/` with the error.

## Naming

`rec-<sign_category>-<descriptor>-<NNN>.json` (e.g. `rec-pylon-multitenant-001.json`).

## Self-check before emitting

- No PII anywhere (names, vendor, client, contacts, addresses, donor copy).
- Every field group carries provenance.
- All enum fields conform or carry `proposed_new_term`.
- Manufacturers linked by id, never re-described inline.
- Variants collapsed, not duplicated.
- Record validates against schema v1.1.

## Outputs

- Validated JSON record(s) → `/records/`
- New manufacturer/technique knowledge → `/reference/manufacturer-reference.json`
- Flags and new-term candidates → `/review-queue/`
