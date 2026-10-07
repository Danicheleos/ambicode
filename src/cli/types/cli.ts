import type { Runtime } from '#types/composition';
import type { Engine, RouteRegistry, SessionBinding } from '#types/harness';
import type { SweepReport } from '#types/modules/review';
import type { JsonFormat } from '#types/util';

export type { OptionSpec, ParsedArgs } from '#types/cli';
import type { OptionSpec, ParsedArgs } from '#types/cli';

export interface Rendered {
  text: string;
  data: unknown;
  /** How `--json` serializes `data`; pretty unless the command says otherwise. */
  json?: JsonFormat;
  /** A command that keeps serving until this settles, e.g. the review page. */
  wait?: { until: Promise<string>; stop: (reason: string) => Promise<void> };
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
  options: OptionSpec;
  validate?: (args: ParsedArgs) => void;
  run(runtime: Runtime, args: ParsedArgs): Promise<Rendered>;
}

export interface RouteTools { engine: Engine; routes: RouteRegistry; binding: SessionBinding }

export interface ViewOutput {
  command: 'view';
  reviewId: string;
  reviewDirectory: string;
  url: string;
  port: number;
  browserOpened: boolean;
  browserDetail: string;
  idleTimeoutSeconds: number;
  publicationAvailable: boolean;
  notes: string[];
  cleanup: SweepReport;
  stopped: Promise<string>;
  stop(reason: string): Promise<void>;
}
