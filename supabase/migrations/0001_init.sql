-- Sign KB serving surface — Phase 1 schema.
-- Derived, rebuildable projection of the source-of-truth records. DDL per serving-surface-spec.md.
-- (kb_chunks + vector(N) are Phase 2 and intentionally not created here.)

-- one row per record; structured fields promoted for filtering, full record kept in raw
create table if not exists signs (
  record_id           text primary key,
  record_type         text not null,
  sign_category       text,
  sub_type            text,
  fabrication_family  text,
  illumination_method text,
  illuminated         boolean,
  mounting            text,
  sides               int,
  digital_integration boolean,
  doc_type            text,
  industry_vertical   text,
  design_status       text,
  option_set_id       text,
  quality_grade       text,
  width_in            numeric,
  height_in           numeric,
  area_sqft           numeric,
  ada_tactile         boolean,
  ada_braille         boolean,
  title_24            boolean,
  is_program          boolean,
  raw                 jsonb not null,
  content_hash        text not null,
  schema_version      text
);

-- the manufacturer/material reference (its own source-of-truth file); FK target for materials
create table if not exists reference (
  normalized_id    text primary key,
  company          text,
  category         text,
  product          text,
  knowledge        text,
  optical_behavior jsonb,
  depth            text   -- stub | researched
);

create table if not exists sign_components (
  id                 bigserial primary key,
  record_id          text references signs(record_id) on delete cascade,
  component          text,
  fabrication_method text,
  illumination       text,
  material_refs      text[],
  mounted_to         text
);

create table if not exists sign_materials (
  id                         bigserial primary key,
  record_id                  text references signs(record_id) on delete cascade,
  material_ref               text,
  category                   text,
  product                    text,
  application                text,
  manufacturer_normalized_id text references reference(normalized_id)
);

-- btree on the hot filter columns
create index if not exists idx_signs_sign_category       on signs(sign_category);
create index if not exists idx_signs_fabrication_family  on signs(fabrication_family);
create index if not exists idx_signs_illumination_method on signs(illumination_method);
create index if not exists idx_signs_record_type         on signs(record_type);
create index if not exists idx_signs_mounting            on signs(mounting);

-- GIN on raw for ad-hoc jsonb queries on un-promoted fields
create index if not exists idx_signs_raw_gin on signs using gin (raw);

-- join paths
create index if not exists idx_sign_components_record_id on sign_components(record_id);
create index if not exists idx_sign_materials_record_id  on sign_materials(record_id);
create index if not exists idx_sign_materials_mfr        on sign_materials(manufacturer_normalized_id);
