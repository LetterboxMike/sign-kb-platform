# Sign KB Extraction — Run Log

## Batch 1 — Calibration (2026-06-19)

Status: **COMPLETE — STOPPED for human sign-off.** Do not proceed to full volume until vocabulary and modeling flags below are resolved.

### Drawings processed (7 of 38)
Selected for maximum variety: sign category, doc_type, multi-sign package, flat graphics, digital.

| # | Drawing | doc_type | Records | → records/ | → review-queue/ |
|---|---------|----------|---------|-----------|-----------------|
| 1 | Work Steer – Channel Letters | shop | 1 | 0 | 1 |
| 2 | The Athens – Blade Sign | design_conceptual | 1 | 0 | 1 |
| 3 | Cornell Law School AllSigns | shop (labeled "design intent") | 4 | 1 | 3 |
| 4 | Woodhaven Warriors Interior Graphics | shop | 3 | 3 | 0 |
| 5 | Delta LGA EMC Signs | shop | 1 | 0 | 1 |
| 6 | Village Camp Truckee – Monument | design_conceptual | 1 | 0 | 1 |
| 7 | Safari Business Center – Permit | permit | 2 | 1 | 1 |
| | **Total** | | **13** | **5** | **8** |

### Validation
13/13 schema-valid against `sign-record.schema.json` (v1.1). 0 PII heuristic hits in outputs.
Routing rule applied: schema-valid + no `proposed_new_term` + no unresolved ambiguity → `records/`; any `proposed_new_term` or substantive flag → `review-queue/`.

### Record types exercised
- `fabricated_sign`: 9 records (channel letter, blade, headers, room-ID, directory, digital display, 2 monuments, post-and-panel directional).
- `flat_graphic` (v1.1 sibling): 4 records (vinyl-on-glass, contour-cut wall, full-coverage mural, perforated window). Validated cleanly — first real exercise of the sibling.
- `vehicle_wrap`: none encountered.

### Reference table extended (`reference/manufacturer-reference.json`: 9 → 16 entries)
- `mfr-3a-composites` (Dibond ACM) — knowledge stub.
- `mfr-rowmark` + `comp-rowmark-311-101` (clear acrylic 1/32", ADA tactile) — knowledge stub.
- `mfr-nanolumens` + `comp-nanolumens-p187` (direct-view LED, indoor HDS / outdoor OD) — **researched**, with `optical_behavior` for the mockup tool.
- `mfr-lord` (Parker Lord structural adhesive) — knowledge stub.
- `mfr-everbrite` (protective sealer for Corten/metal) — knowledge stub.
- Extended `mfr-3m-graphics` summary to note 3635 dual-color and heat-applied textured wall films seen in the corpus.
- Left **3M VHB foam tape** unlinked (3M Industrial ≠ the 3M Commercial Graphics films entry) — flagged below.

### New-term candidates raised: see `calibration-report.md` and `review-queue/`. fabrication_family is the dominant gap (6 of 8 queued records).

### Notes / decisions taken this batch
- Athens blade: 3 competing design options modeled as ONE record (most-developed option) + alternatives in `extraction_meta`, not 3 near-duplicate records. Flagged for ruling.
- Cornell: one package → 4 archetype records (headers / room-ID / directory / vinyl-on-glass), instances collapsed via `program_model` + `message_schedule`.
- Cornell ADA-assistance phone number stripped (would have tripped the validator's phone regex) — strip worked, 0 hits.
- Delta EMC did not fit any `sign_category` cleanly; flagged `digital_display_emc`.

### Environment note
`validate.py` requires `jsonschema>=4.18` (Draft 2020-12). Installed 4.26.0; the bundled 3.2.0 lacks `Draft202012Validator`.

---

## Phase 0 — Reconcile Batch 1 to v1.2 (2026-06-19)

Applied `calibration-resolutions-v1.2.md`. Outcome matched the predicted "~6 of 8 clear."

**Cleared from review-queue → records/ (6):**
- channel_letter storefront — `fabrication_family` → `channel_letter`
- retrofit header — `fabrication_family` → `panel`; `doc_type` → `design_intent`
- ADA room-ID — `fabrication_family` → `panel`; `doc_type` → `design_intent`; "identification" observation withdrawn
- directory — `fabrication_family` → `panel`; `doc_type` → `design_intent`
- Delta digital display — `sign_category` → `digital_display`; `fabrication_family` → `digital_display_assembly`; `illumination_method` → `internal_led` (coarse bucket; self-emissive optical behavior lives in `comp-nanolumens-p187`); adhesives moved out of `materials_manifest` into structure notes
- Safari reskin — `fabrication_family` → `cabinet` (reskin specificity → `sub_type`)

**Re-modeled:** Athens blade 1 record → 3 option records (`option_set_id: optset-blade-marquee-001`, `design_status: proposed_option`).

**Remain in review-queue (genuine edge cases):**
- `rec-monument-boardformed-concrete-halo-001` (Village Camp) — 2 real enum gaps v1.2 did not close: **halo-only `illumination_method`** (enum has `combination_face_and_halo` but not halo-only) and **structural concrete/CMU `material_category`** (has `structural_timber`, `cladding_stone`, but not concrete/masonry).
- `rec-blade-marquee-projecting-001/002/003` (Athens ×3) — `fabrication_family` is now `blade`, but **`blade` was not added to `sign_category`**, so a projecting marquee ID has no clean category. Options 2/3 also surface an **`exposed_lamp` `illumination_method`** gap (open-faced channel letters lit by exposed E27 lamps). Held as `proposed_new_term` pending a ruling on whether blade signs take an existing `sign_category` (e.g. `cabinet`) or the enum needs a `blade`/`projecting` value.

**Reference:** split 3M VHB out of the films entry → `mfr-3m-industrial` / `comp-3m-vhb` (`structural_adhesive`). Reference now 18 entries.

**Contract:** `extraction-contract.md` updated to mirror v1.2 vocab (closed `fabrication_family`, `design_intent`, `digital_display`, `option_set_id`/`design_status`, adhesive + research-policy notes).

**Counts after Phase 0:** `records/` 11 (all valid), `review-queue/` 4 (all valid, all flagged edge cases). 15 records total (was 13; Athens 1→3).

**Environment:** the bash sandbox's mounted copy of the user-updated `sign-record.schema.json` was stale/truncated at line 200; validated against a verified local copy of the v1.2 schema. Michael's canonical schema file is intact (215 lines, valid).

---

## Batch 2 — Production run (2026-06-19)

**Scope.** 28 sign drawings processed → **89 records, all schema-valid (v1.2), 0 PII hits.** Routed: **74 clean → `records/`, 15 flagged → `review-queue/`.** Read via 6 parallel extraction sub-agents; all records authored and validated centrally.

**Not processed (correctly excluded):**
- Manufacturer datasheets seeded into the folder — LED power supplies (EveryLite JUL/EVE), SignComp profiles (K1592/K1602), TMT LED module, insert-panel systems — these feed the **reference-enrichment pass** (Ruling 6), not record extraction.
- Foundation/structural detail sheets (`GX-*`, `IX-*`, `PX-*` — "sign by others") — supporting details, not standalone signs.
- `Renderings.pdf` — image-only, no construction specs.
- `Safari Business Center - Construction V2` — duplicate of the Safari permit already recorded in Batch 1.

**KB totals now:** `records/` **85**, `review-queue/` **19**, reference **40 entries** (was 18; +22 stubs added at extraction).

**New reference stubs (22)** — all `provenance: knowledge`, `depth: stub_expand_later` for the enrichment pass: Trex, Cirrus, Zip-Change, SloanLED, Jewelite, Spray-Lat, Avery Dennison, Solyx, Principal-Sloan, Tectonics, Tremco, Dunn-Edwards, Canon, Phototex, Tempotest, Sunbrella, Equitone, Acrylite, Raster braille, P99/P95 non-glare acrylic, plus components (SignComp Series 7/12, Cirrus EMC, Zip-Change track, Tectonics SEG).

**New-term candidates raised (review-queue):**
- `sign_category`: **`blade`/projecting** (5 more records — reinforces the open Phase-0 question), **`awning`** (2, recurring), **`atm_surround_kiosk`** (1), **`feature_wall`** (moss wall), **`dimensional_feature_display`** (artifact-mount).
- `illumination_method`: **`halo_illuminated`** (2 more — Gables, Next Health std), **`under_soffit_downlight`** / **`under_canopy_downlight`** (awning, ATM canopy).
- `mounting`: **`tensioned_cable_rail`** (AHRI workstation pocket system).
- `materials_manifest.category`: **`awning_fabric`**, **`digital_display_module`** (consumable/component gaps).
- `flat_graphic.graphic_method`: supergraphic method-TBD (CHS conceptual, R3-acceptable).

**`fabrication_family` held.** ZERO new `fabrication_family` candidates across 28 drawings / 89 records — the v1.2 closed archetype set absorbed every sign (cabinet, channel_letter, dimensional_letter_or_logo, panel, blade, composite_structure, digital_display_assembly). This is the primary success signal for the v1.2 redesign.

**No new `record_type` needed.** No vehicle wraps. Every sign fit `fabricated_sign` or `flat_graphic`. The awning / ATM-kiosk / feature-wall cases fit `fabricated_sign` + `composite_structure` and only strain `sign_category`, not the record shape.

### Health read (one paragraph)
Batch 2 is decisively quieter than the calibration batch, as designed. The review queue fell from **~62% of records (8/13) in Batch 1 to ~17% (15/89) in Batch 2**, and the queue is no longer dominated by `fabrication_family` churn — that enum held completely. What remains is a short, *recurring* and *legible* set of vocabulary gaps, not noise: the still-open **blade `sign_category`** question (now 8 records across two batches), a new but clearly-bounded **`awning`** category (2 records, recurs in restaurant + bank work), an **ATM kiosk/surround** shape, and the **halo-only / exposed-lamp / downlight illumination** gaps. None of these require a new record_type or a shape change — they are `sign_category` and `illumination_method` enum additions plus the consumable-category policy. Recommend a small v1.3 vocab pass (add `blade`, `awning`, `digital_display`-style `atm` handling, and `halo_illuminated` to the enums) and then later batches can run with a longer leash.

---

## Phase 0b — Apply v1.3 to existing queue (2026-06-19)

v1.3 added `sign_category` += `blade`, `awning`; `illumination_method` += `external_downlight`, `halo_illuminated`, `exposed_lamp`; `material_category` += `structural_concrete_masonry`, `awning_fabric`, `digital_display_module`, `adhesive`. Applied to the 19-record review queue: **14 cleared to `records/`** (all blade/awning/halo/exposed-lamp/concrete/EMC-material records, incl. Village Camp and the 3 Athens options). **5 genuine n=1 holds remain** (held per instruction, not re-raised): `atm_surround_kiosk`, `tensioned_cable_rail`, `feature_wall`, `dimensional_feature_display`, and the CHS conceptual supergraphic method-TBD.

## Batch 3 — Production run, continuous (2026-06-19)

**Scope.** 31 smaller/medium remaining drawings → **49 records, all v1.3-valid, 0 PII.** Routed **45 → `records/`, 4 → `review-queue/`.** Read via 6 parallel sub-agents; authored/validated centrally.

**KB totals now:** `records/` **144**, `review-queue/` **9**, reference **52 entries** (+12 stubs: Band-It, Precision Coating, Roland, Minwax, Harristone, Sherwin-Williams, Benjamin Moore, Creative Mines, Watchfire, SignFoam, Lumificient + SignComp #1391 / Band-It / Principal components).

**Queue this batch: 4/49 ≈ 8%** — well under the 30% threshold; noise stayed low.

**Flagged this batch (4):**
- **VEHICLE WRAP — `rec-vehicle_wrap-fleet-van-pikecounty-001`** (Pike County fleet van). This is the **`record_type` exception**: `vehicle_wrap` is a deferred sibling whose detailed field shape is not yet specified. Emitted the deferred marker (`deferred: true`) with captured attributes (high-roof cargo van, full wrap, copy structure) and proposed sibling fields in `extraction_meta`. **Surfaced for a decision: specify the `vehicle_wrap` sibling shape (as `flat_graphic` was specified on first encounter).** Note: the proof carries no print/film/laminate spec (design approval only).
- 3 new low-frequency vocab candidates (proposed_new_term, logged, not forced): `mounting: band_clamp_to_existing_column` (JHU column-clamped panels), `mounting: freestanding_a_frame` (Barre3 sandwich board), `sign_category: supergraphic_panel` (Bell Trucks fabricated-frame wall graphic).

**Held the n=1 set** (`atm_surround_kiosk`, `tensioned_cable_rail`, `feature_wall`) as `proposed_new_term` without re-raising, per instruction.

**`fabrication_family` held again** — zero new family candidates across 49 records. New filename/content mismatches noted and recorded per actual content (JHU "banners" = rigid column panels; Vistana "Parking Signs" = Inspire Downtown blade signs).

**Not records (excluded):** none new this batch were datasheets; the remaining **large multi-sign packages** (ASI 105 82pp, Signage Drawings and Specs 71pp/ACORN, Stanford Maples, Carlsbad ×3, BNY Mellon, Next Health Interior Manual, RTD, The Coloradan, LSO, D1 Capital, C47476, Silos, Ascentria, CMG440, The Tree Farm, Drawing/Drawing-11545/Final-Approved/Image-National/Kaiser/Requirements) are deferred to **Batch 4**.

### Health read
Continuous processing is holding up: queue stayed at ~8% this batch and `fabrication_family` took zero new candidates. The one true exception is the **Pike County van wrap** — the first `vehicle_wrap` in the corpus — which is surfaced (not forced) and needs the deferred sibling specified before wraps can be modeled with real fields. Everything else fit cleanly; the only new flags are three genuinely-novel low-frequency mounting/category values, logged for a future vocab pass. ~23 large packages remain for Batch 4.

---

## v1.4 + Batch 4 — Corpus complete (2026-06-20)

**v1.4 applied.** `vehicle_wrap` sibling now specified (vehicle_class + coverage required; everything else optional per R3). Re-modeled `rec-vehicle_wrap-fleet-van-pikecounty-001` from the deferred marker into a real record (`cargo_van` / `full_wrap` / both sides; film+laminate absent — design-approval proof only, noted in open_items) → moved to `records/`. The wrap exception is resolved.

**Batch 4 — the largest batch.** 23 remaining files = **20 sign-drawing projects** (Carlsbad's 3 phase-files = 1 project) + **1 non-drawing** (`Requirements.pdf` = a Sprint channel-letter spec sheet → reference-enrichment, skipped). Read via 7 parallel sub-agents (one re-run after a network drop). → **78 records, all v1.4-valid, 0 PII.** Routed **72 → `records/`, 6 → `review-queue/` (≈7%)**.

Projects: ASI 105 (corporate-campus EGD, 8 archetypes), the higher-ed interior EGD "Signage Drawings and Specs" (7), Carlsbad retail "sea-glass" EGD (6), Stanford Maples athletics (6), BNY Mellon finance (6), Next Health interior manual (5, deduped against the exterior standards already recorded), ACORN higher-ed (6), RTD transit (5), D1 Capital finance (5), Silos ADA (3), Ascentria office (4), The Coloradan high-rise (6), CMG440 (3), LSO healthcare campus (5), The Tree Farm mixed-use conceptual (3), plus QSR/retail one-offs (Taco Bell reface, Starbucks DRIP drive-thru, Chipotle storefront, a bank channel-letter program, Kaiser replacement insert).

**Reference:** +20 stubs across the batch → **72 entries total** (added e.g. Calsak/ACRYCAST, Chemetal, DesignTex, APCO, 3Form, Colite, Aristech, GKD metal mesh, Daktronics, Brunner, Arlon, Reflectiv; plus back-filled missing parents Band-It, Principal-LED, Tectonics, Zip-Change). **Zero dangling references** — every record/component manufacturer id resolves.

**Vocab discipline.** Sub-agents proposed ~20 new terms; I mapped almost all to existing v1.4 enums (applied graphics/posters/icons → `flat_graphic`; SEG backlit fabric & info-kiosk → `cabinet`/`panel`; dimensional letters/address numerals/flush-cut → `dimensional_letter_or_logo`; edge-lit → `halo_illuminated`; metal mesh → `cladding`; field-weld-to-canopy → `wall_mounted`). Only genuinely-new values were held as `proposed_new_term`.

**Batch 4 flags (6, all recurring held candidates):** `feature_wall` ×2 (Next Health moss, ACORN magnetic story — now 4 corpus-wide), `band_clamp_to_pole_or_column` ×2 (ASI, RTD — now 4 with JHU + the existing column candidate), `framed_display_case` (Stanford), `sculptural_brand_icon` (Taco Bell bell). None forced; all logged for the consolidated vocab pass.

**`fabrication_family` held across the entire corpus** — zero new family candidates in 78 records (and none since v1.2). **No new `record_type`** beyond the three siblings; the van wrap was the only one and is now real.

### Corpus status: COMPLETE
Every sign drawing in `Original Docs/` has been processed across Batches 1–4. Non-drawing inputs (manufacturer datasheets: LED power supplies, SignComp profiles, TMT module, insert-panel systems, the Sprint spec sheet; foundation-detail sheets GX/IX/PX; `Renderings.pdf`; the Safari construction duplicate; and the DSN exploration superseded by its final) were correctly set aside for the reference-enrichment pass or as duplicates/non-records.

**Final KB:** `records/` **217** · `review-queue/` **14** · reference **72 entries** · all schema-valid (v1.4) · 0 PII hits.

**Remaining queue (14)** = the held proposed_new_term set for the consolidated vocab pass: `feature_wall` (4), `band_clamp_to_pole_or_column` (4), `supergraphic_panel` (1), `framed_display_case` (1), `sculptural_brand_icon` (1), `atm_surround_kiosk` (1), `tensioned_cable_rail` (1), `dimensional_feature_display` (1), and the CHS conceptual supergraphic method-TBD (1).

### Next steps (post-corpus, as planned)
1. **Consolidated vocab pass** — decide promote vs hold on the queued candidates. Recommend promoting **`feature_wall`** and **`band_clamp_to_pole_or_column`** (each recurs 4×); decide the home for **`supergraphic_panel`** (spans `fabricated_sign` framed vs `flat_graphic` applied); hold the n=1s. Clearing promotions empties most of the queue.
2. **Reference-enrichment pass** — research the ~40 knowledge-stub manufacturers and the seeded datasheets (power supplies, SignComp/insert-panel profiles, TMT/LED modules, Sprint spec), prioritizing mockup-critical optical behavior.

---

## v1.5 — Consolidated vocab pass (2026-06-20)

Applied v1.5. Two additive promotions; everything else modeled onto existing types via `sub_type`.

**Promotions:** `sign_category += feature_wall` (with `dimensional_feature_display` folded in; treatment → `sub_type`), `mounting += band_clamp_to_pole_or_column` (consolidating both band-clamp labels). Contract doc synced.

**Re-tagged & cleared from queue → `records/` (13):**
- feature_wall (5): moss walls (Glendale, Next Health interior → `sub_type: moss_wall`), magnetic story wall (ACORN → `magnetic_story_wall`), artifact mount (Mortenson, was `dimensional_feature_display` → `artifact_mount`).
- band_clamp (3): JHU (was `band_clamp_to_existing_column`), ASI, RTD → all `band_clamp_to_pole_or_column`.
- supergraphic (2): Bell Trucks framed → `fabricated_sign` `panel` + `sub_type: supergraphic`; CHS applied conceptual → `flat_graphic` + `sub_type: supergraphic` (graphic_method defaulted to `digital_print`, R3 method-TBD noted).
- framed display case (Stanford) → `cabinet` + `framed_display_case`.
- sculptural brand icon (Taco Bell bell) → `plaque` + `dimensional_letter_or_logo` + `sculptural_icon`.
- ATM surround (United Bank) → `cabinet` (+ composite_structure family) + `atm_surround`.

**Queue result: 14 → 2** (not 1).
- `tensioned_cable_rail` (AHRI) — held per ruling.
- **`freestanding_a_frame` (Barre3) — held, and flagged.** The v1.5 rulings did not address it; by the stated n=1 discipline it is identical to `tensioned_cable_rail` (genuinely novel, single occurrence), so it was held rather than silently mis-mapped to a wrong mounting value. **Decision needed: promote `freestanding_a_frame` (a common industry sandwich-board type) or confirm hold.** Either way the corpus stays clean.

**Final KB:** `records/` **229** · `review-queue/` **2** · reference **72 entries** · all schema-valid (v1.5) · 0 PII. Extraction + vocab convergence complete; only the reference-enrichment pass remains on the extraction side.

---

## Reference-enrichment pass — complete (2026-06-20)

Researched the manufacturer reference end-to-end (web + the seeded datasheets), parallelized across 6 clusters. Harvested the seeded datasheets for hard specs: EveryLite JUL-60-12 / EVE-180-12 power supplies, TMT Midi 4 LED module, SignComp Series-7 insert-panel system, and the Sprint channel-letter spec sheet.

**Result:** reference **72 → 80 entries**; **all 59 manufacturers now `provenance: researched`** (zero stubs left). Added 8 entries — 5 makers (SloanLED, Lumificient, US LED, TMT, EveryLite) + 3 datasheet components (TMT Midi 4, EveryLite JUL-60-12 / EVE-180-12). **45 entries carry researched `optical_behavior`** (the mockup-critical priority): how each film/acrylic/resin/mesh/LED/EMC reads lit vs unlit, day vs night, translucent/blockout/diffuser/reflective/dual-color, pixel pitch + nits + viewing angle for displays. Zero dangling references; every record's manufacturer id resolves.

**Verification caveats flagged in the entries (not silently smoothed over):**
- `mfr-reflectiv` — Réflectiv SAS makes architectural solar/mirror glazing film, **not** retroreflective traffic sheeting. If a parking/roadside drawing intends headlight glow-back, the spec'd material is likely a different brand/SKU — confirm.
- `mfr-spraylat` "Starbright" reflective interior coating — brand/role verified, exact product page not independently reachable.
- `mfr-brunner` part **G849S** — H/J molding family verified, exact part number not on the public catalog.
- Colite LP4, Lumificient, US LED — makers/roles confirmed; exact lumen/beam figures sit behind gated spec PDFs (noted as unconfirmed in each `optical_behavior`).

### Extraction side: DONE.
The 229-record corpus + the fully-researched 80-entry reference are the clean source of truth. Open items are downstream, not extraction: (1) the `freestanding_a_frame` vocab decision (queue is 2, not 0, pending it); (2) the serving surface (in build per `BUILD-PLAN-serving-surface.md`); (3) the derivations; (4) the design-taste grading pass (`quality_grade` is null across all records by design).
