# Sign KB Extraction Contract — v1.2

Governing spec for turning sign drawings into knowledge-base records. Both the Tradecraft portal agent and Substrate build against this. The machine-enforceable version is `sign-record.schema.json` (now v1.2); this document is the readable source of intent.

Status: **fabricated_sign record shape LOCKED (v1.0).** `flat_graphic` sibling specified (v1.1). v1.2 refines `fabrication_family` to a closed archetype set, adds `doc_type: design_intent`, `sign_category: digital_display`, and the `option_set_id` / `design_status` fields. The record shape is unchanged; v1.2 is vocabulary + optional-field refinement only (see `calibration-resolutions-v1.2.md`).

---

## 1. Record types (discriminated union)

Every record has a top-level `record_type`. The schema branches on it. This is what lets new shapes be added later without reopening v1.

- **`fabricated_sign`** — LOCKED. A built sign with a structure of components, a mounting, and optional illumination. Covers monuments, pylons, wayfinding, directional, cabinets, channel/dimensional letters, plaques.
- **`vehicle_wrap`** — DEFERRED SIBLING. No structure/mounting/illumination; instead vehicle, coverage, panels-across-seams, print method, film + laminate, install difficulty. Schema to be specified on first wrap encountered.
- **`flat_graphic`** — DEFERRED SIBLING. Banners, decals, window/wall graphics. Specified on first encounter.

Adding a sibling = a new branch in the union, not a change to `fabricated_sign`.

---

## 2. fabricated_sign structure

Required: `record_id`, `schema_version`, `record_type`, `source.doc_type`, `classification` (with `sign_category`, `illuminated`), `structure` (≥1 component).

Optional but standard: `context`, `knowledge`, `materials_manifest`, `dimensions`, `messaging_pattern`, `program_model`, `finish_patterns`, `utilities`, `design_assessment`, `open_items`, `extraction_meta`.

`structure[]` is an array of components, each with at minimum `component` and `provenance`. Components may carry construction, face, finish_refs, material_refs, illumination, fabrication_method, rationale, status, and mounting relationships (see R5).

---

## 3. Controlled vocabularies

Strict enums on the fields that determine queryability. Every enum has a `proposed_new_term` escape hatch: a genuinely novel value is flagged for review, never silently invented.

- **record_type**: fabricated_sign, flat_graphic (v1.1), vehicle_wrap (specified v1.4)
- **sign_category**: monument, pylon, wayfinding, directional, plaque, channel_letter, cabinet, digital_display (v1.2), blade + awning (v1.3), **feature_wall** (v1.5), _proposed_new_term_
- **illumination_method**: internal_led, external_uplight, external_downlight (v1.3), combination_face_and_halo, halo_illuminated (v1.3), neon, exposed_lamp (v1.3), non_illuminated, non_illuminated_reflective, mixed, _proposed_new_term_
- **fabrication_family** (v1.2 CLOSED archetype set — specificity moves to `sub_type`): cabinet, channel_letter, dimensional_letter_or_logo, panel, blade, composite_structure, digital_display_assembly, _proposed_new_term_
  - Selection rule: pick the **dominant construction archetype**. Secondary constructions (e.g. an accessory cabinet on a dimensional-letter treatment) live in `structure[]`, not the family.
- **mounting**: ground_mounted_footing, ground_mounted_pedestal, ground_mounted_masonry_columns, wall_mounted, ceiling_suspended, breakaway_slipbase_post, **band_clamp_to_pole_or_column** (v1.5), _proposed_new_term_
- **material_category**: face_substrate, letter_face, cladding, cladding_stone, structural_timber, structural_concrete_masonry (v1.3), structure_skin, substrate, paint, coating, vinyl, graphic, awning_fabric + digital_display_module + adhesive (v1.3), _proposed_new_term_
- **application_method** (from the AGS finish key): paint, digital_print, silkscreen_print, hot_stamp, vinyl, special_material, material_finish, sprayed, _proposed_new_term_
- **doc_type**: design_conceptual, **design_intent** (v1.2), permit, shop, as_built, survey
- **vehicle_wrap classification** (v1.4): vehicle_class (cargo_van/box_truck/pickup/sedan/suv/trailer/bus/specialty), coverage (full_wrap/partial_wrap/lettering_decals/spot_graphics), finish (gloss/matte/satin/textured)
- **design_status** (v1.2, for competing options): proposed_option, selected, built, unbuilt_concept

### v1.5 vocab-pass notes
- `feature_wall` is a sign_category for illuminated/decorative branded wall features (moss walls, magnetic story walls, artifact mounts) — put the treatment in `sub_type` (`moss_wall`, `magnetic_story_wall`, `artifact_mount`).
- `band_clamp_to_pole_or_column` consolidates non-penetrating band-clamp mounts to existing poles/columns.
- **Supergraphic** is a scale/treatment descriptor, not a category: applied → `flat_graphic`; framed → `fabricated_sign` + `fabrication_family: panel`; tag `sub_type: supergraphic` either way.
- Other one-offs model onto existing types via `sub_type`: framed display case → `cabinet`/`framed_display_case`; sculptural brand icon → `dimensional_letter_or_logo`/`sculptural_icon`; ATM surround → `cabinet`/`atm_surround`.
- **component** and **sub_type**: OPEN controlled vocabulary. `sub_type` now carries the construction/illumination specifics that used to live in `fabrication_family` (e.g. `push_thru_facelit`, `suspended_hatbox`, `reskin_over_existing_concrete_monument`). Preferred values reused; new values allowed and logged, not blocked.

### v1.2 modeling notes
- **Competing design options** (Ruling 2): one record per substantive option, NOT one record with alternatives buried in `extraction_meta`. Link siblings with `option_set_id`; tag each with `design_status` (default `proposed_option` for conceptuals). Distinct from variants (variants = same design, trivial copy difference → collapse via `program_model` / `message_schedule`).
- **Adhesives / fastening consumables** (Ruling 5/6): not listed in `materials_manifest` (no category enum value); captured as construction notes in `structure[]`. Normalize the manufacturer by id when it recurs (e.g. `mfr-lord`, `mfr-3m-industrial`).
- **Reference research policy** (Ruling 6): stub every new manufacturer at extraction; inline-research only mockup-critical ones (displays, optically-relevant finishes); batch-research the rest in a dedicated enrichment pass.

---

## 4. Provenance model

The hardening mechanism is trust-tracking, not volume. Canonical values:

- **drawing** — read directly off the drawing. Highest trust.
- **inferred** — Claude reasoned it from the drawing. Medium trust.
- **researched** — pulled from external research (manufacturer sites, etc.). Verify before high-stakes use.
- **opinion** — subjective design judgment. Never presented to a client as fact.

`grade_provenance` is separate: `ungraded_pending_review` until Michael grades it.

---

## 5. The ruleset

**R1 — PII exclusion (hard).** Strip at extraction: vendor/sign-company identity, end-client name, human names, contacts, addresses, and donor/personal copy content. Keep: industry vertical, technical spec, and copy *structure* as a pattern (`messaging_pattern`, with `copy_content: excluded_pii`).

**R2 — Variant/copy-instance collapsing.** Signs differing only by trivial swap (level letter, donor copy) are ONE design record plus `program_model` instance data, never N records. Prevents duplicate bloat that would mislead the agents.

**R3 — doc_type completeness.** Completeness varies by doc_type. Conceptuals specify brand colors without product codes; shop/permit drawings carry exact codes. A missing paint code on a conceptual is NOT a data gap. Validation must not reject on it.

**R4 — Manufacturer normalization.** Manufacturers and components are researched once into `manufacturer-reference.json` and referenced by id (`manufacturer_normalized_id`, `component_ref`). No inline duplication. Research scope is corpus-complete, not catalog-cloning.

**R5 — Intra-sign mounting relationships.** A component can be mounted to or suspended from another component, not just the ground (`mounting_relationship`, `mounted_via`, `mounted_to`). The structure array expresses these dependencies.

**R6 — Flag, don't guess.** Ambiguous values are flagged in `extraction_meta`, never invented. Minor spec conflicts (e.g. a finish callout that contradicts the rendering) are noted, not silently resolved.

**R7 — Material buildup.** Layered constructions (aluminum frame → backer board → stone veneer) are captured as an ordered `material_buildup`, not flattened to one material.

---

## 6. Validation gate

Between extraction and the store: validate each record against `sign-record.schema.json`.
- Passes + no flags → enters the source-of-truth file set.
- Fails schema, or carries unresolved `proposed_new_term` / ambiguity flags → review queue.

The gate is the entire build-time "database management" layer. No record enters the KB unvalidated.

---

## 7. Versioning

- `schema_version` on every record.
- New enum values: added to vocab, do not bump the record shape; old records stay valid.
- New `record_type` siblings: new union branch; existing consumers unaffected.
- Consumers (Tradecraft, Substrate) code against `record_type` + the schema, never against each other.
