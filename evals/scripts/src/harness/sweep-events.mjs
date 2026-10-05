import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_ROOTS = [...new Set(['/tmp', tmpdir()])];

const sandboxes = (roots) => {
  const found = new Map();
  for (const root of roots) {
    try {
      for (const name of readdirSync(root)) if (name.startsWith('e-')) found.set(name, path.join(root, name));
    } catch {
      // A root that is missing or unreadable holds no sandboxes.
    }
  }
  return found;
};

/**
 * Reports each agent run's start and end by watching the sandbox directories the harness creates and removes. Under
 * `--keep-temp` a finished sandbox stays, with a `sealed/` directory added at its end.
 */
export function trackSweep({ total = null, roots = DEFAULT_ROOTS, file = null, log = () => {}, now = () => new Date() } = {}) {
  const before = sandboxes(roots);
  const live = new Set();
  const finished = new Set();
  let ended = 0;
  const emit = (event, fields) => {
    const entry = { at: now().toISOString(), event, ...fields };
    if (file !== null) appendFileSync(file, `${JSON.stringify(entry)}\n`);
    log(`sweep ${event}${fields.sandbox === undefined ? '' : ` ${fields.sandbox}`} ${ended}/${total ?? '?'} done, ${live.size} running`);
  };
  emit('start', { total });
  return {
    tick() {
      const current = sandboxes(roots);
      for (const name of [...live]) {
        if (!current.has(name) || existsSync(path.join(current.get(name), 'sealed'))) {
          live.delete(name);
          finished.add(name);
          ended += 1;
          emit('run-end', { sandbox: name, ended, running: live.size });
        }
      }
      for (const [name, dir] of current) {
        if (!before.has(name) && !live.has(name) && !finished.has(name) && !existsSync(path.join(dir, 'sealed'))) {
          live.add(name);
          emit('run-start', { sandbox: name, ended, running: live.size });
        }
      }
    },
    finish(status) {
      this.tick();
      emit('end', { status, ended });
    },
  };
}
