# Contract Stress Test — Three Complex Packages

Run against **locked contract v1.0**. Verdict: **the fabricated_sign shape held on every physical sign.** What fell out was exactly the three categories the contract was designed to absorb after lock. None of them reopen the shape. They become additive **v1.1**.

This is a stress test, not a full extraction. The goal was to find where each package lands and whether anything breaks, not to hand-build ~40 records (that is the pipeline's job).

---

## What was tested

| Package | Pages | Character | Shape verdict |
|---|---|---|---|
| Beach Club F&B | 7 | restaurant interior: dimensional logos, projecting blade, oak letters, wall vinyl | holds (+1 sibling) |
| Tin Building | 28 | exterior food-hall program: channel letters, brass logo, sculptural blades, clock, neon, under-canopy blades, fascia | holds |
| Rancho Los Amigos SSA | 19 | ADA healthcare wayfinding program: sign-type schedule, room/restroom/egress | holds (+compliance gap) |

---

## The three things that fell out

### 1. Escape-hatch vocabulary (zero shape change)

All absorbed by `proposed_new_term`, exactly as designed. The pipeline would log every one of these automatically:

neon illumination, flat-cut-out (FCO) brass decoration, projecting blade, under-canopy blade, fascia band, halo-lit channel letter, epoxy-embedded-LED letterform, waterjet-cut aluminum, HPL / white-oak veneer letters, non-glare (P99) acrylic, brushed-bronze laminate accent, blackened steel, clock mechanism, bilingual (EN/ES) copy, magnetic/changeable inserts.

That is a large vocabulary haul and not one of them required touching the record shape.

### 2. The `flat_graphic` sibling is now real

Declared as a deferred sibling at lock. This batch produced clean examples: Beach Club Sign Type C (digitally printed, heat-applied, contour-cut wall vinyl) and Rancho Sign Type 19 (plotter-cut vinyl on glass). No structure, no mounting, no illumination. It is a graphic applied to a surface. The sibling can now be specified (sketched in the schema v1.1).

### 3. Two additive optional fields

- **`compliance` block** (ADA + California Title 24). Rancho needs it: tactile copy, braille, pictograms, non-glare finish, contrast, and the 60-inch mounting height. Most exterior signs do not carry it, so it is optional, present only where the job is regulated.
- **`message_schedule`** for wayfinding programs. Rancho is not a handful of signs, it is a sign-type schedule deployed across location plans, where each type is instantiated many times with different room numbers and messages. This extends `program_model` from "copy varies per unit" to a structured, location-coded schedule.

---

## Two genuinely novel notes worth flagging

- **Neon is not just a vocabulary value.** It is a whole illumination technology: high-voltage transformer, bent glass tube, electrode boots, safety cage, separate power and control. When the pipeline hits neon, the manufacturer/technique reference entry should capture the neon-specific knowledge the same way SignComp and Indect were captured. Flagged for the reference table, not the record shape.
- **The clock is a sign with a working mechanism.** Rare, but it confirms a `component` can be a functional/kinetic part (clock movement, hands) without any shape impact. Worth remembering when a fountain, kinetic, or motion sign eventually appears.

---

## Amendments → v1.1 (additive, non-breaking)

Per the contract's own versioning rule (§7), these extend the contract without reopening v1.0's locked shape:

1. `illumination_method`: add `neon`.
2. Define the `flat_graphic` sibling branch: `graphic_method` (digital_print, plotter_cut, contour_cut), `applied_to` (wall, glass, window, floor), `film`, `laminate`, `dimensions`.
3. Add optional `compliance` block to `fabricated_sign` and `flat_graphic`: `ada` (tactile, braille, pictogram, non_glare, contrast_compliant, mounting_height_in), `title_24`, `notes`.
4. Add optional `message_schedule` for program/wayfinding records.
5. New vocab values logged (FCO brass, projecting/under-canopy blade, fascia band, clock mechanism, HPL veneer, non-glare acrylic, bilingual).

---

## Bottom line

This is the empirical case for the lock. The most varied batch we have run, including neon, a clock, sculptural steel, and a full ADA program, produced only the three anticipated, additive, non-breaking categories of change. The shape is right. The remaining variety in the corpus will keep producing vocabulary and the occasional optional field, and the escape hatch plus the validation gate will surface every one of them automatically once the pipeline runs.
