import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { config } from './config';

// The validation gate. The same sign-record.schema.json that validate.py uses is the
// single contract — an invalid record never enters the index.
const schema = JSON.parse(fs.readFileSync(config.schemaPath, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn: ValidateFunction = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRecord(record: unknown): ValidationResult {
  const valid = validateFn(record) as boolean;
  const errors = (validateFn.errors ?? []).map((e) =>
    `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim(),
  );
  return { valid, errors };
}
