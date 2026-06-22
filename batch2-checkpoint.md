# Batch 2 Checkpoint

**Run:** 28 drawings → 89 records, all v1.2-valid, 0 PII. Routed 74 → `records/`, 15 → `review-queue/`.
**KB now:** records/ 85 · review-queue/ 19 · reference 40 entries.
**Status:** STOPPED for light sign-off before Batch 3.

---

## Health read

Batch 2 got quiet, exactly as the bar predicted.

- **Review queue dropped from ~62% (Batch 1) to ~17% (Batch 2).**
- **`fabrication_family` held — zero new candidates across 89 records.** The v1.2 closed set (cabinet / channel_letter / dimensional_letter_or_logo / panel / blade / composite_structure / digital_display_assembly) absorbed every sign. This was the whole point of the v1.2 redesign, and it worked.
- **No new `record_type` needed.** No vehicle wraps. Everything fit `fabricated_sign` or `flat_graphic`.

The queue is no longer noise — it's a short, recurring, legible set of `sign_category` / `illumination_method` gaps.

## Phase 0 (reconcile) — done

6 of 8 Batch-1 queued records cleared to `records/`; Athens re-modeled into 3 option records (`option_set_id` + `design_status`); Cornell→`design_intent`; Delta→`digital_display`; 3M VHB split to `mfr-3m-industrial`. The 2 that remained (Village Camp halo+concrete, Athens blade) are genuine edge cases — folded into the Batch-2 decisions below.

## Decisions for v1.3 (recommended — approve as a block)

Everything in the queue reduces to a handful of enum additions. None touches the record shape.

| Add to enum | Value | Evidence | Rec |
|---|---|---|---|
| `sign_category` | `blade` | 8 records, 2 batches (Athens, Gables, Zo's, United Bank, Next Health, DSN) | **Add** — settles the open Phase-0 question |
| `sign_category` | `awning` | 2 (Zo's, United Bank); recurs restaurant + bank | **Add** |
| `sign_category` | `atm_surround_kiosk` | 1 (United Bank), refaces elsewhere | **Decide** — add, or treat as `cabinet`+sub_type |
| `illumination_method` | `halo_illuminated` | 3 (Village Camp, Gables, Next Health) — halo-only, not face+halo | **Add** |
| `illumination_method` | `exposed_lamp` / `downlight` | Athens 2-3, Zo's + ATM canopies | **Add** (or one `exposed_or_indirect` value) |
| `mounting` | `tensioned_cable_rail` | 1 (AHRI workstation pockets) | **Decide** — niche; could stay `proposed_new_term` |
| `material_category` | `awning_fabric`, `digital_display_module`, `adhesive` | recurring consumable/component gaps | **Add** (closes the last material flags) |

Two non-vocab notes:
- **`feature_wall` / `dimensional_feature_display`** (moss wall, artifact-mount steel) — genuinely between signage and millwork. Recommend leaving as `proposed_new_term` for now; not worth an enum value yet.
- **Reference enrichment is queued, not done.** 22 new manufacturers were stubbed at extraction per Ruling 6. The seeded datasheets (LED power supplies, SignComp profiles, TMT module, insert-panel systems) are the inputs for a dedicated enrichment pass — recommend running that as its own batch before Batch 3 so mockup-critical optical behavior gets researched.

## What ships next

Approve the v1.3 vocab block → I clear the 19 queued records (most go straight to `records/`), then either (a) run the reference-enrichment pass on the datasheets, or (b) continue to Batch 3 with the remaining drawings. 

**One question to start: approve the v1.3 `sign_category` + `illumination_method` additions (the "Add" rows) — yes/no?**
