import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Git } from '../git/git.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import type { ProcessRunner } from '../ports/process.ts';

/**
 * A real git repository in a temporary directory. Exercising the actual git
 * output format is the point: a fake would only re-state the parser's
 * assumptions about it.
 */
export class TempRepo {
  readonly root: string;
  readonly runner: ProcessRunner;
  readonly git: Git;

  private constructor(root: string, runner: ProcessRunner) {
    this.root = root;
    this.runner = runner;
    this.git = new Git({ runner, repositoryRoot: root });
  }

  static async create(): Promise<TempRepo> {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-test-'));
    const runner = new NodeProcessRunner();
    const repo = new TempRepo(root, runner);
    await repo.run(['git', 'init', '-q', '--initial-branch=main', '.']);
    await repo.run(['git', 'config', 'user.email', 'test@example.invalid']);
    await repo.run(['git', 'config', 'user.name', 'AMBICODE Test']);
    await repo.run(['git', 'config', 'commit.gpgsign', 'false']);
    return repo;
  }

  async run(argv: readonly string[], stdin?: string): Promise<string> {
    const outcome = await this.runner.run({
      argv,
      cwd: this.root,
      timeoutMs: 30_000,
      maxOutputBytes: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' } as Record<string, string>,
      ...(stdin === undefined ? {} : { stdin }),
    });
    if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
      throw new Error(`command failed: ${argv.join(' ')}\n${outcome.stderr}${outcome.failure ?? ''}`);
    }
    return outcome.stdout;
  }

  async write(relativePath: string, contents: string): Promise<void> {
    const absolute = path.join(this.root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, 'utf8');
  }

  async commitAll(message: string): Promise<void> {
    await this.run(['git', 'add', '-A']);
    await this.run(['git', 'commit', '-qm', message]);
  }

  /** Writes a conflicted index entry without depending on merge behaviour. */
  async makeUnmerged(relativePath: string): Promise<void> {
    const blob = async (contents: string): Promise<string> =>
      (await this.run(['git', 'hash-object', '-w', '--stdin'], contents)).trim();
    const [base, ours, theirs] = await Promise.all([
      blob('base\n'),
      blob('ours\n'),
      blob('theirs\n'),
    ]);
    const zero = '0'.repeat(40);
    const lines = [
      `0 ${zero}\t${relativePath}`,
      `100644 ${base} 1\t${relativePath}`,
      `100644 ${ours} 2\t${relativePath}`,
      `100644 ${theirs} 3\t${relativePath}`,
      '',
    ].join('\n');
    await this.run(['git', 'update-index', '--index-info'], lines);
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
