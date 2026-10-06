import { startIndexBuild } from '#modules/search/code-index/codeindex';
import type { Runtime } from '#types/composition';
import type { RouteContextPort } from '#types/harness';

export interface ApplyDeps { runtime: Runtime; session: string | null; context: RouteContextPort | null; doctor?: DoctorOptions }

export interface DoctorOptions {
  project?: string;
  /** Inside `init --apply` only: start step 05's detached build. Otherwise the index state is read, nothing written. */
  buildIndex?: boolean;
  /** Step 05's detached build; injected by tests. */
  startIndex?: typeof startIndexBuild;
}
