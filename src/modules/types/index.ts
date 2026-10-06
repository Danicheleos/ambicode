// Shared types and constants for the modules area.

// checks.ts: changed-path shape for module check runs.
export type { ChangedPath } from './checks.ts';

// config.ts: dependencies and options for config apply and doctor.
export type { ApplyDeps, DoctorOptions } from './config.ts';

// ecosystems.ts: declaration patterns for ecosystem detection.
export { DECLARATION_PATTERNS } from './ecosystems.ts';

// search.ts: search limits and the generic profile.
export { MAX_DEPENDENTS, GENERIC_PROFILE } from './search.ts';

// workers.ts: worker environment allowlist and structured-output retry count.
export { WORKER_ENV_ALLOWLIST, STRUCTURED_OUTPUT_ATTEMPTS } from './workers.ts';
