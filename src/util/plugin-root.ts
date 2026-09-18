import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmbicodeError } from './errors.ts';

/**
 * Where the installed plugin's content lives. Claude Code exports
 * `CLAUDE_PLUGIN_ROOT`; the upward search is the fallback that lets the same
 * code run from `src/` during development and from `scripts/` once bundled.
 * Nothing resolves content through a developer-specific absolute path.
 */
export async function resolvePluginRoot(): Promise<string> {
  const declared = process.env['CLAUDE_PLUGIN_ROOT'];
  if (declared !== undefined && declared.trim() !== '') return path.resolve(declared);

  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      await access(path.join(directory, '.claude-plugin', 'plugin.json'));
      return directory;
    } catch {
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
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

export function promptsDirectory(pluginRoot: string): string {
  return path.join(pluginRoot, 'prompts');
}
