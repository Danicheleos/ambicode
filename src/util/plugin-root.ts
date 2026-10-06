import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmbicodeError } from './errors.ts';
import type { FileSystem } from '#types/ports';

/**
 * `CLAUDE_PLUGIN_ROOT` when Claude Code exports it, else an upward search, so the
 * same code runs from `src/` and from `scripts/`.
 */
export async function resolvePluginRoot(
  fs: FileSystem,
  env: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const declared = env['CLAUDE_PLUGIN_ROOT'];
  if (declared !== undefined && declared.trim() !== '') return path.resolve(declared);

  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (await fs.exists(path.join(directory, '.claude-plugin', 'plugin.json'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new AmbicodeError(
    'plugin-root-unresolved',
    'Could not locate the AMBICODE plugin directory.',
    { details: ['Set CLAUDE_PLUGIN_ROOT, or run the helper from inside the installed plugin.'] },
  );
}

export function builtinPoliciesDirectory(pluginRoot: string): string {
  return path.join(pluginRoot, 'policies');
}

/** The review page's Eta templates and stylesheet; the build copies them from `src/modules/review/page/templates`. */
export function pageTemplatesDirectory(pluginRoot: string): string {
  return path.join(pluginRoot, 'scripts', 'templates');
}

export function promptsDirectory(pluginRoot: string): string {
  return path.join(pluginRoot, 'prompts');
}
