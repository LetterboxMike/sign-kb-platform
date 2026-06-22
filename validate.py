#!/usr/bin/env python3
"""
Sign KB validation gate.
Validates a record (or a directory of records) against sign-record.schema.json
and runs a lightweight PII heuristic scan.

Usage:
    python validate.py <record.json>
    python validate.py <records_dir>/

Exit code 0 = all pass (schema). Non-zero = at least one schema failure.
PII hits are warnings (a record can be schema-valid but still need a human look).
"""
import sys, os, re, json, glob

try:
    import jsonschema
except ImportError:
    sys.exit("jsonschema not installed: pip install jsonschema")

HERE = os.path.dirname(os.path.abspath(__file__))
# schema expected one level up under /schema; fall back to alongside this script
SCHEMA_CANDIDATES = [
    os.path.join(HERE, "..", "schema", "sign-record.schema.json"),
    os.path.join(HERE, "sign-record.schema.json"),
]

PII_PATTERNS = {
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "street": re.compile(r"\b\d{1,6}\s+[A-Za-z0-9.\s]{3,40}\b(?:St|Ave|Rd|Blvd|Dr|Ln|Ct|Hwy|Way|Pkwy)\b", re.I),
}

def load_schema():
    for p in SCHEMA_CANDIDATES:
        if os.path.exists(p):
            return json.load(open(p))
    sys.exit("schema not found in: " + ", ".join(SCHEMA_CANDIDATES))

def pii_scan(record):
    blob = json.dumps(record)
    return [name for name, rx in PII_PATTERNS.items() if rx.search(blob)]

def validate_one(path, validator):
    try:
        rec = json.load(open(path))
    except Exception as e:
        return False, [f"unreadable JSON: {e}"], []
    errs = sorted(validator.iter_errors(rec), key=lambda e: list(e.path))
    errlines = [f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in errs]
    return (len(errs) == 0), errlines, pii_scan(rec)

def main(target):
    schema = load_schema()
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema)

    files = sorted(glob.glob(os.path.join(target, "*.json"))) if os.path.isdir(target) else [target]
    if not files:
        sys.exit("no .json records found at: " + target)

    failures = 0
    for f in files:
        ok, errs, pii = validate_one(f, validator)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {os.path.basename(f)}")
        for e in errs:
            print(f"    schema: {e}")
            failures += 1 if ok is False else 0
        if pii:
            print(f"    ⚠ PII heuristic hit ({', '.join(pii)}) — route to review")
        if not ok:
            failures = max(failures, 1)
    print(f"\n{len(files)} record(s) checked, {'all schema-valid' if not failures else 'schema failures present'}.")
    return 1 if failures else 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
