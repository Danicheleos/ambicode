# Reviewer envelopes

Captured shapes of what `claude --print --output-format json --json-schema …`
writes to stdout, used by `src/review/review.test.ts`. Field names and the error
subtype are the ones the shipped CLI emits; see `docs/compatibility.md` for how
each was established.

| File | Case |
| --- | --- |
| `success-structured-output.json` | Schema-constrained answer in `structured_output`, with `result` holding the model's closing prose. |
| `success-legacy-result-string.json` | No `structured_output`; the answer arrives as a JSON string in `result`. |
| `missing-structured-output.json` | A success envelope carrying neither field: no answer to validate. |
| `malformed-structured-output.json` | `structured_output` present but not matching the reviewer schema. |
| `error-retry-exhausted.json` | `is_error` with `subtype: error_max_structured_output_retries`. |
| `error-during-execution.json` | `is_error` from the run itself, not from schema validation. |
| `truncated.txt` | A prefix of a success envelope, as a capture ceiling produces. |
