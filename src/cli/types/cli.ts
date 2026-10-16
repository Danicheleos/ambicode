import type { Runtime } from '#types/composition';
import type { Engine, RouteRegistry, SessionBinding } from '#types/harness';
import type { JsonFormat } from '#types/util';

export type { OptionSpec, ParsedArgs } from '#types/cli';
import type { OptionSpec, ParsedArgs } from '#types/cli';

export interface Rendered {
  text: string;
  data: unknown;
  /** How `--json` serializes `data`; pretty unless the command says otherwise. */
  json?: JsonFormat;
  /**
   * Nonzero when the *finding* is the outcome (e.g. `policy check` reported an
   * error) rather than a failure to run; an operator error still throws and exits 2.
   */
  exitCode?: number;
  /** Printed to standard error, so a `--json` reader of stdout still receives one document. */
  warnings?: string[];
}

/** One CLI command: the options it declares, a check before any runtime exists, and its run. */
export interface CliCommand {
  name: string;
  /** One line for the generated usage text. */
  summary: string;
  options: OptionSpec;
  validate?: (args: ParsedArgs) => void;
  run(runtime: Runtime, args: ParsedArgs): Promise<Rendered>;
}

export interface RouteTools { engine: Engine; routes: RouteRegistry; binding: SessionBinding }
