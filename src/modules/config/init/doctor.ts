import path from 'node:path';
import { checkApprovalKey, authorizeCommand } from '#modules/checks/selection/authorize';
import type { AmbicodeConfig, ProjectConfig, DoctorRow, DoctorTable, DoctorOptions } from '#types/modules/config';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { resolvePolicy } from '#modules/policy/packs/resolve';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import type { Runtime } from '#types/composition';

const PROBE_TIMEOUT_MS = 15_000;

/** Executables whose `--version` does not follow a subcommand (`ruff check --version` is not a version probe). */
const PROBE_OVERRIDES: Readonly<Record<string, readonly string[]>> = { ruff: ['--version'], 'ruff.exe': ['--version'] };

/** The command's `--version` form: its tokens before the first `--` or `{files}`, then `--version` (D5). */
export function probeArgv(argv: readonly string[]): string[] {
  const executable = argv[0] ?? '';
  const override = PROBE_OVERRIDES[path.basename(executable)];
  if (override !== undefined) return [executable, ...override];
  const end = argv.findIndex((token) => token === '--' || token === '{files}');
  return [...argv.slice(0, end === -1 ? argv.length : end), '--version'];
}

async function resolveExecutable(runtime: Runtime, cwd: string, executable: string): Promise<string | null> {
  if (executable.includes('/') || executable.includes('\\')) {
    const absolute = path.resolve(cwd, executable);
    return (await runtime.fs.exists(absolute)) ? absolute : null;
  }
  for (const directory of (runtime.env['PATH'] ?? '').split(path.delimiter).filter((entry) => entry !== '')) {
    const candidate = path.join(directory, executable);
    if (await runtime.fs.isExecutable(candidate).catch(() => false)) return candidate;
  }
  return null;
}

async function rowsFor(runtime: Runtime, repositoryRoot: string, project: ProjectConfig): Promise<DoctorRow[]> {
  const loaded = await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot });
  const policy = resolvePolicy({ activity: 'task', project, packs: loaded.packs, paths: [], diagnostics: loaded.diagnostics });
  const rows: DoctorRow[] = [];
  for (const [slot, command] of Object.entries(project.commands)) {
    const row = { project: project.id, slot, argv0: command?.argv[0] ?? '', resolved: null, probe: null };
    if (command === null) {
      rows.push({ ...row, result: 'null', detail: 'no command configured' });
      continue;
    }
    const cwd = path.resolve(repositoryRoot, project.root, command.cwd ?? '.');
    const resolved = await resolveExecutable(runtime, cwd, command.argv[0]!);
    if (resolved === null) {
      rows.push({ ...row, result: 'not-found', detail: `${command.argv[0]} does not exist` });
      continue;
    }
    const decision = authorizeCommand({ policy, commandId: slot, approvalKey: checkApprovalKey(project.id, slot), approvals: new Set() });
    const probe = probeArgv(command.argv);
    if (decision.kind !== 'allowed') {
      rows.push({ ...row, resolved, probe, result: 'not-run', detail: decision.reason });
      continue;
    }
    const outcome = await runtime.runner.run({ argv: probe, cwd, timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: 65_536, env: { kind: 'inherited' } });
    const firstLine = (text: string): string => text.split('\n').find((line) => line.trim() !== '')?.trim().slice(0, 160) ?? '';
    if (outcome.kind === 'timed-out') rows.push({ ...row, resolved, probe, result: 'timeout', detail: `no answer within ${PROBE_TIMEOUT_MS / 1000} s` });
    else if (outcome.kind === 'exited' && outcome.exitCode === 0) rows.push({ ...row, resolved, probe, result: 'ok', detail: firstLine(outcome.stdout) });
    else rows.push({ ...row, resolved, probe, result: 'failed', detail: `exit ${outcome.exitCode ?? firstLine(String(outcome.failure ?? 'none'))}${firstLine(outcome.stderr) === '' ? '' : `: ${firstLine(outcome.stderr)}`}` });
  }
  return rows;
}

function render(rows: readonly DoctorRow[]): string {
  const header = ['project', 'slot', 'command', 'result', 'detail'];
  const cells = rows.map((row) => [row.project, row.slot, row.probe === null ? row.argv0 || '-' : row.probe.join(' '), row.result, row.detail]);
  const widths = header.map((title, column) => Math.max(title.length, ...cells.map((cell) => cell[column]!.length)));
  const line = (cell: readonly string[]): string => cell.map((value, column) => (column === cell.length - 1 ? value : value.padEnd(widths[column]!))).join('  ').trimEnd();
  return [line(header), ...cells.map(line)].join('\n');
}

/** One row per command slot; a failing command is reported, never nulled (09-D1…D4). */
export async function runDoctor(runtime: Runtime, repositoryRoot: string, config: AmbicodeConfig, options: DoctorOptions = {}): Promise<DoctorTable> {
  const projects = options.project === undefined ? config.projects : config.projects.filter((project) => project.id === options.project);
  if (projects.length === 0) throw new AmbicodeError('unknown-project', `No project "${options.project}" is configured.`, { field: '--project' });
  const rows: DoctorRow[] = [];
  for (const project of projects) rows.push(...(await rowsFor(runtime, repositoryRoot, project)));
  const table = render(rows);
  const hash = contentHash(table);
  return { rows, text: `${table}\n<!-- ambicode doctor ${hash} -->\n`, hash };
}
