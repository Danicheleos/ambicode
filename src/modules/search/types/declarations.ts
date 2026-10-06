/** Names that mean nothing on their own: matching them finds the whole project. */
export const COMMON_NAMES = new Set(['constructor', 'index', 'default', 'main', 'get', 'set', 'run', 'init', 'test', 'it', 'describe', 'props', 'state']);

export interface Declaration {
  name: string;
  kind: string;
  path: string;
  line: number;
  /** Files, among those harvested, that declare this name. */
  declarations: number;
}
