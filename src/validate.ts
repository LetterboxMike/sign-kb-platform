import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
// Bundle the schema as a module (not a runtime fs read) so the gate works in any runtime,
// including serverless where cwd/paths differ. This is the same sign-record.schema.json contract.
import schema from '../sign-record.schema.json';

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
