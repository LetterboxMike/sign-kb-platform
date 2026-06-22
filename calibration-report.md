# Calibration Report — Batch 1

**Run:** 7 drawings → 13 records, all schema-valid, 0 PII hits in output.
**Status:** STOPPED for sign-off. Full-volume run is blocked until the vocabulary and modeling decisions below are made. Each decision has a recommended default so you can approve fast.

---

## 1. The headline finding

The schema and PII rules held up. **The controlled vocabulary did not.** 8 of 13 records went to the review queue, and almost all for the same reason: the enums were seeded from exterior/cabinet monument-and-pylon work, and this batch hit categories they don't cover — channel letters, blade signs, interior architectural signage, digital displays, board-formed concrete, and re-skins.

This is the expected job of calibration. None of it is a schema-shape failure. It's a vocabulary-coverage gap, and it's concentrated in **`fabrication_family`** (flagged by 6 of 8 queued records).

---

## 2. Vocabulary decisions you need to make

Approve these as a block, or edit inline. After sign-off I add the approved values to `extraction-contract.md` + `sign-record.schema.json` enums and the queued records stop being flagged.

### `fabrication_family` — needs the most new values
| Proposed value | From | Recommended |
|---|---|---|
| `internally_illuminated_channel_letters` | Work Steer | **Add** |
| `fabricated_aluminum_blade` (projecting) | Athens | **Add** |
| `built_up_laminated_acrylic_interior` | Cornell (×3) | **Add** |
| `stainless_clad_direct_view_led_display` | Delta | **Add** |
| `board_formed_concrete_monument` | Village Camp | **Add** |
| `fabricated_aluminum_reskin_over_existing_monument` | Safari | **Add** |

> Note: `channel_letter` is already a valid `sign_category`, but there was no `fabrication_family` for it. That inconsistency is the tell that the family enum was under-built.

### `sign_category`
| Proposed value | From | Recommended |
|---|---|---|
| `blade` (projecting sign) | Athens | **Add** — it's a primary commercial category |
| `digital_display` / `emc` | Delta | **Add** (see §3, digital question) |
| `identification` (distinct from wayfinding/directional) | Cornell room-ID | **Decide** — I used `wayfinding` as the umbrella; default = leave as-is unless you want ADA room-ID broken out |

### `illumination_method`
| Proposed value | From | Recommended |
|---|---|---|
| `halo_illuminated` (reverse-pan, halo only) | Village Camp | **Add** — `combination_face_and_halo` is wrong (no face lighting) |
| `direct_view_led_display` | Delta | **Add** — optically distinct from `internal_led`; matters for the mockup tool |

### `material_category`
| Proposed value | From | Recommended |
|---|---|---|
| `structural_concrete_masonry` (concrete, CMU) | Village Camp | **Add** — parallels the existing `structural_timber` |
| `adhesive` (Lord, 3M VHB) | Delta (also DFW) | **Decide** — see §4 |

### `doc_type`
| Proposed value | From | Recommended |
|---|---|---|
| `design_intent` | Cornell ("Design Intent Documentation") | **Decide** — I mapped it to `shop`. Default = add `design_intent` (it's a real, distinct deliverable stage) |

---

## 3. Modeling decisions (not vocabulary — these are rulings on *how to shape records*)

**A. Competing design options.** The Athens blade came as 3 mutually-exclusive design options for one sign. The contract handles trivial variants (collapse) and distinct sign types (separate records) but is silent on "options where one gets built." I modeled **one record on the most-developed option + the others in `extraction_meta.alternative_design_options`.**
→ *Recommended default: keep this rule. Add it to the contract as R8.* Alternative: one record per option (risks near-duplicate bloat the contract warns against).

**B. Digital displays / EMC.** The Delta sign *is* a screen, not a static sign with an embedded counter (which is how DFW handled digital, via `digital_integration: true`). It fit neither `flat_graphic` nor cleanly into `fabricated_sign`'s enums.
→ *Decision needed:* (1) extend `fabricated_sign` enums to cover direct-view LED (my current approach), or (2) spin up a **`digital_display` sibling record_type** like `vehicle_wrap`. Recommended: option 1 now, revisit a sibling if digital volume grows.

**C. Same construction, different mounting.** Cornell had wall-mounted directories and a freestanding directional of essentially the same build. I kept them as one record (wall) and flagged the freestanding variant rather than splitting.
→ *Decision needed:* does a mounting change alone force a separate record, or can it be a `program_model` variant axis? Recommended: **mounting change = separate record** (it changes `classification.mounting`, a core field).

---

## 4. Manufacturer normalization — one judgment call

R4 says normalize every named manufacturer/component. Two of this batch's names are **fastening consumables**, not optically-relevant components: Lord adhesive and 3M VHB tape.
- I **added `mfr-lord`** (it recurs: DFW + Delta) but kept it a stub.
- I **left 3M VHB unlinked** — linking it to `mfr-3m-graphics` would be wrong (that entry is 3M *Commercial Graphics* films; VHB is 3M *Industrial*). Created no new entry for a single tape mention.

→ *Decision needed:* how deep does R4 go for consumables? Recommended: **normalize structural/optical components always; treat adhesives/tapes/fasteners as inline notes unless they recur 3+ times.** If you want them all normalized, I'll add `material_category: adhesive` and entries for VHB etc.

---

## 5. PII

**0 heuristic hits in the 13 outputs.** Stripped at source across the batch: vendor identities (4 sign companies), client/owner names, ~6 human names, 6 phone numbers (incl. the Cornell ADA-assistance line, which would have tripped the validator's phone regex), 3 emails, and multiple street addresses. Industry vertical and copy *structure* retained per R1. The strip is working.

One note worth your eye: **Safari was designed by you** (your name was in the title block). It was stripped like any other designer name — correct under R1, but flagging it so you know the rule doesn't make exceptions for you.

---

## 6. Schema strain — did the shape break?

No. `fabricated_sign` and the new `flat_graphic` sibling both held across a 4in window graphic up to a 100ft mural and a ceiling LED display. The strain is entirely in the **enums** (§2) and a few **modeling rulings** (§3), not the record shape. `vehicle_wrap` was not encountered, so its deferred shape is still untested.

---

## 7. What ships next (after your sign-off)

1. You approve §2 vocab + §3/§4 rulings (inline edits fine).
2. I fold approved enums into the contract + schema, clear the 8 review-queue flags, and move the now-valid records to `records/`.
3. Full volume in batches of ~25–30 (31 drawings remain; DFW is already done as the seed example). `run-log.md` appended per batch.

**One question to start:** Approve the §2 vocabulary additions as recommended (all "Add" rows), yes/no? Everything else can follow from that.
