import { appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const DEFAULT_ROOTS = [...new Set(['/tmp', tmpdir()])];

const sandboxes = (roots) => {
  const found = new Set();
  for (const root of roots) {
    try {
      for (const name of readdirSync(root)) if (name.startsWith('e-')) found.add(name);
    } catch {
      // A root that is missing or unreadable holds no sandboxes.
    }
  }
  return found;
};

/** Reports each agent run's start and end by watching the sandbox directories the harness creates and removes. */
export function trackSweep({ total = null, roots = DEFAULT_ROOTS, file = null, log = () => {}, now = () => new Date() } = {}) {
  const before = sandboxes(roots);
  const live = new Set();
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
        if (!current.has(name)) {
          live.delete(name);
          ended += 1;
          emit('run-end', { sandbox: name, ended, running: live.size });
        }
      }
      for (const name of current) {
        if (!before.has(name) && !live.has(name)) {
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
