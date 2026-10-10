export const ROUTE_START_OPTIONS = { values: ['task', 'project', 'plan', 'from-draft', 'base', 'mr'], repeated: ['answer', 'requirement'], flags: ['json', 'headless', 'fresh', 'branch'], positionals: true } as const;

/**
 * Accepts only what a command declares. `--` ends option parsing, since paths
 * can start with a dash.
 */
export interface OptionSpec {
  values?: readonly string[];
  flags?: readonly string[];
  repeated?: readonly string[];
  positionals?: boolean;
}

export interface ParsedArgs {
  value(name: string): string | null;
  flag(name: string): boolean;
  all(name: string): string[];
  positionals: string[];
}
