// Pure decision rules for the campaign guard hook and the supervisor loop.
// No I/O here, so every rule is unit-tested without a model (policy.test.mjs).
import path from 'node:path';

export const LEVEL = { allow: 'allow', deny: 'deny', kill: 'kill' };

// Defaults requested by the owner (2026-09-29): wrap up from ~300k, hard stop of new work at 500k.
// Measured for scale: one 3-iteration task session reached 313,178 tokens with no compaction.
export const DEFAULTS = {
  softTokens: 300_000,
  hardTokens: 500_000,
  // Advice is re-sent each time context grows this much past a threshold, not on every tool call.
  adviceStepTokens: 25_000,
  // Persistent probing of denied actions is treated as an escape attempt.
  maxDenialsPerSession: 5,
};

export const SAFE_PHASES = new Set(['idle', 'handoff', 'blocked']);

const ALL_ARGS_WRITE = new Set(['rm', 'rmdir', 'unlink', 'chmod', 'chown', 'touch', 'truncate', 'tee', 'mkdir']);
const LAST_ARG_WRITE = new Set(['cp', 'mv', 'ln', 'install', 'rsync']);
const NOT_A_FILE = /^(\/dev\/(null|stdout|stderr|tty)|&\d)$/;

function unquote(t) {
  return t.replace(/^["']|["']$/g, '');
}

/** Paths a command writes: redirect targets, and the file arguments of known writing verbs. Variables are not resolved. */
export function writeTargets(command) {
  const targets = [];
  for (const m of command.matchAll(/(?:^|[^<0-9&>])>{1,2}\s*([^\s;&|<>]+)/g)) targets.push(unquote(m[1]));
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.trim().split(/\s+/).map(unquote).filter(Boolean);
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) tokens.shift();
    if (tokens[0] === 'env' || tokens[0] === 'command' || tokens[0] === 'nohup') tokens.shift();
    const verb = tokens[0];
    const args = tokens.slice(1).filter((t) => !t.startsWith('-') && !t.includes('>') && !t.startsWith('<'));
    if (ALL_ARGS_WRITE.has(verb)) targets.push(...args);
    else if (LAST_ARG_WRITE.has(verb) && args.length >= 2) targets.push(args[args.length - 1]);
    else if (verb === 'sed' && tokens.some((t) => /^-[a-zA-Z]*i/.test(t) || t === '--in-place')) targets.push(...args.slice(1));
    else if (verb === 'perl' && tokens.some((t) => /^-[a-zA-Z]*i/.test(t))) targets.push(...args.slice(1));
    else if (verb === 'dd') for (const t of tokens) if (t.startsWith('of=')) targets.push(t.slice(3));
  }
  return targets.filter((t) => t && !NOT_A_FILE.test(t) && !/^\$|\$\(|`/.test(t));
}

const SECRET_PATH = /(^|[\s"'=:/~])(\.ssh\/|\.aws\/|\.gnupg\/|\.netrc\b|\.npmrc\b|\.docker\/config\.json|\.config\/gh\/|\.config\/gcloud\/|\.kube\/|Keychains\/|id_rsa|id_ed25519|id_ecdsa|[\w.-]*\.pem\b|[\w.-]*\.p12\b|[\w.-]*\.pfx\b|[\w.-]*\.keystore\b|\.env(\.[\w-]+)?(?![\w/-])|\.claude\.json\b|service-account[\w-]*\.json)/;

const CREDENTIALS_FILE = /[/.]credentials(\.json)?\b|(^|[\s"'=])credentials\.json\b/;
const isSecretPath = (s) => SECRET_PATH.test(s) || CREDENTIALS_FILE.test(s);

const SECRET_TEXT = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /CLAUDE_CODE_OAUTH_TOKEN\s*=\s*\S{10,}/,
  /ANTHROPIC_API_KEY\s*=\s*\S{10,}/,
  /"accessToken"\s*:\s*"[^"]{20,}"/,
];

const HEAVY_BASH = /evals-bench\.mjs\s+run|npm\s+run\s+evals(\s|$|:full|:record|:archived|:triggers|:preflight|:reviewer)|evals-record-core|evals-reviewer\.mjs|evals-preflight\.mjs|(^|[;&|(])\s*claude\s+plugin\s+eval/;

function expandHome(p, home) {
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return p.replace(/\$HOME|\$\{HOME\}/g, home);
}

function within(p, root) {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** ctx: { repoRoot, home, tmpRoots: string[], forbiddenRoots: string[], allowPlanEdit: boolean } */
export function protectedRoots(ctx) {
  return {
    guard: path.join(ctx.repoRoot, 'gym', 'plan', 'supervisor'),
    claudeHome: path.join(ctx.home, '.claude'),
    repoClaude: path.join(ctx.repoRoot, '.claude'),
    gitDir: path.join(ctx.repoRoot, '.git'),
    plan: path.join(ctx.repoRoot, 'gym', 'plan'),
    benchmarks: path.join(ctx.repoRoot, 'benchmarks'),
  };
}

function writeRoots(ctx) {
  return [ctx.repoRoot, ...(ctx.tmpRoots ?? [])];
}

function isWorkerWorktree(p, ctx) {
  const parent = path.dirname(ctx.repoRoot);
  return within(p, parent) && /^ambicode-it-\d+/.test(path.relative(parent, p).split(path.sep)[0] ?? '');
}

export function classifyPathWrite(rawPath, ctx) {
  const p = path.resolve(ctx.repoRoot, expandHome(rawPath, ctx.home));
  const roots = protectedRoots(ctx);
  if (within(p, roots.guard)) return kill('guard-tamper', `writes the campaign guard or supervisor (${rawPath})`);
  if (within(p, roots.claudeHome)) return kill('claude-config-tamper', `writes Claude Code's own configuration (${rawPath})`);
  if (within(p, roots.repoClaude) && /settings/.test(p)) return kill('claude-config-tamper', `writes project Claude settings (${rawPath})`);
  if (within(p, path.join(roots.gitDir, 'hooks')) || p === path.join(roots.gitDir, 'config')) {
    return kill('git-config-tamper', `writes git hooks or git config (${rawPath})`);
  }
  if (isSecretPath(p)) return kill('secret-path', `writes a credential-shaped path (${rawPath})`);
  for (const f of ctx.forbiddenRoots ?? []) if (within(p, f)) return deny('forbidden-repo', `writes inside a repository agents may not touch (${rawPath})`);
  if (within(p, roots.benchmarks)) return deny('nda-data', `writes the NDA benchmark data (${rawPath})`);
  if (within(p, roots.plan) && !within(p, path.join(roots.plan, 'rev')) && !/^rev-/.test(path.relative(roots.plan, p)) && !ctx.allowPlanEdit) {
    return deny('plan-read-only', `gym/plan is read-only during a campaign; draft a revision under gym/plan/rev-<n>/ (09 §2)`);
  }
  if (writeRoots(ctx).some((r) => within(p, r)) || isWorkerWorktree(p, ctx)) return allow();
  return deny('write-outside-roots', `writes outside the repository, worker worktrees and temp (${rawPath})`);
}

export function classifyPathRead(rawPath, ctx) {
  const p = path.resolve(ctx.repoRoot, expandHome(rawPath, ctx.home));
  if (isSecretPath(p)) return kill('secret-path', `reads a credential-shaped path (${rawPath})`);
  const roots = protectedRoots(ctx);
  if (within(p, roots.claudeHome)) return deny('claude-home', `reads ~/.claude; use the archive copies (06 §5)`);
  for (const f of ctx.forbiddenRoots ?? []) if (within(p, f)) return deny('forbidden-repo', `reads a repository agents may not touch (${rawPath})`);
  return allow();
}

function allow() {
  return { level: LEVEL.allow, rule: null, reason: null };
}
function deny(rule, reason) {
  return { level: LEVEL.deny, rule, reason };
}
function kill(rule, reason) {
  return { level: LEVEL.kill, rule, reason };
}

/** Bash rules. Regex tripwires, not a sandbox: an obfuscated command can evade them, so obfuscation itself is a kill. */
export function classifyBash(command, ctx) {
  const c = command.replace(/\\\n/g, ' ');
  const home = ctx.home;
  const mentions = (root) => c.includes(root) || (root.startsWith(home) && c.includes('~' + root.slice(home.length)));
  const roots = protectedRoots(ctx);

  const killRules = [
    [/(^|[\s;&|(])(sudo|doas)\s|(^|[\s;&|(])su\s+-?\w*/, 'privilege-escalation', 'runs sudo/su'],
    [/--dangerously-skip-permissions|bypassPermissions|disableAllHooks|--permission-mode|--setting-sources|--settings\b|(^|\s)claude\s+[^|;&]*--bare/, 'agent-escape', 'starts Claude with weaker permissions or without hooks'],
    [/\b(pkill|killall|kill)\b[^;&|]*(supervise|guard\.mjs|caffeinate|\bclaude\b(?![^;&|]*plugin eval))/, 'agent-escape', 'kills the supervisor, guard or Claude process'],
    [/(^|[\s;&|(])(launchctl|crontab|osascript|diskutil|mkfs\S*|csrutil|spctl|nvram|systemsetup|pmset|shutdown|reboot|halt|chflags)\b|defaults\s+write|\bdd\b[^;&|]*of=\/dev/, 'system-change', 'changes the operating system or schedules work outside the session'],
    [/base64\s+(-d|-D|--decode)[^;&]*\|\s*\w*sh\b|\|\s*(ba|z|da|k)?sh(\s|$)|(^|[;&|(])\s*eval\s|(^|[\s;&|(])(ba|z)?sh\s+-c\s+["']?\$\(|\bsource\s+<\(/, 'obfuscation', 'executes generated or piped shell code'],
    [/(python3?|node|ruby|perl)\s+-[a-zA-Z]*[ec]\s[^;&]*(socket|urllib|requests\.|http\.client|https?:\/\/|net\.connect|fetch\()/, 'network-exfiltration', 'opens a network connection from inline code'],
    [/(^|[\s;&|(])(nc|ncat|netcat|socat|ssh|scp|sftp|telnet|ftp)\s|rsync\s[^;&|]*\S+:/, 'network-exfiltration', 'opens a remote shell or copies to a remote host'],
    [/(curl|wget)\b[^;&|]*\s(-d|--data[\w-]*|-F|--form|-T|--upload-file|--post-file|-X\s*(POST|PUT|PATCH))(\s|=|$)/, 'network-exfiltration', 'uploads data over HTTP'],
    [/(^|[\s;&|(])(printenv|env)\s*($|[|;&>])|(^|[\s;&|(])(set|export\s+-p|declare\s+-x)\s*($|[|;&>])/, 'secret-dump', 'dumps the environment, which carries credentials'],
    [/\bsecurity\s+(find|dump|export)-/, 'secret-dump', 'reads the macOS keychain'],
    [/git\s+config\s+[^;&|]*(--global|--system|credential|core\.hookspath|core\.sshcommand|core\.fsmonitor)/i, 'git-config-tamper', 'changes global git configuration or git hooks'],
    [/git\s+(filter-branch|filter-repo|update-ref\s+-d|reflog\s+expire|gc\s+--prune=now)/, 'history-destruction', 'rewrites or prunes git history'],
    [/(unset|export)\s+[^;&|]*GYM_/, 'agent-escape', 'changes the supervisor environment'],
  ];
  for (const [re, rule, reason] of killRules) if (re.test(c)) return kill(rule, reason);

  if (isSecretPath(c)) return kill('secret-path', 'touches a credential-shaped path');
  if (/git\s+(checkout|restore|rm|mv|apply|stash\s+push)\b[^;&|]*gym\/plan\/supervisor/.test(c)) return kill('guard-tamper', 'rewrites the campaign guard or supervisor through git');
  const rmRf = /(^|[\s;&|(])rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r|--recursive\s+--force|--force\s+--recursive)[a-zA-Z]*\s+([^;&|]+)/.exec(c);
  if (rmRf) {
    for (const target of rmRf[3].trim().split(/\s+/)) {
      const t = target.replace(/^["']|["']$/g, '');
      if (/^(\/|\/\*|~|~\/|~\/\*|\$HOME\/?|\/Users\/?[^/]*\/?|\.\.?\/?|\*)$/.test(t)) return kill('mass-delete', `rm -rf ${t}`);
      const abs = path.resolve(ctx.repoRoot, expandHome(t, home));
      if (abs === ctx.repoRoot || within(ctx.repoRoot, abs)) return kill('mass-delete', `rm -rf of the repository or a parent (${t})`);
      if (within(abs, roots.gitDir) || within(abs, roots.benchmarks)) return kill('mass-delete', `rm -rf of git history or NDA data (${t})`);
      if (/^(evals|dist|archive|\.ambicode|node_modules|src|skills|policies|prompts)\/?$/.test(path.relative(ctx.repoRoot, abs))) {
        return deny('protected-delete', `rm -rf of a protected directory (${t}); reinstall or rebuild instead`);
      }
      if (!writeRoots(ctx).some((r) => within(abs, r)) && !isWorkerWorktree(abs, ctx)) return deny('write-outside-roots', `rm -rf outside the allowed roots (${t})`);
    }
  }

  for (const target of writeTargets(c)) {
    const verdict = classifyPathWrite(target, ctx);
    if (verdict.level !== LEVEL.allow) return verdict;
  }

  const denyRules = [
    [/git\s+push\b/, 'push', 'git push is not allowed (08 §4)'],
    [/git\s+remote\s+(add|set-url|remove|rm)\b/, 'push', 'changes git remotes'],
    [/git\s+stash\s+(drop|clear)\b/, 'stash-destroy', 'the stash is the rollback safety net'],
    [/git\s+branch\s+[^;&|]*-D\s+(main|master|tuning|eval)\b/, 'branch-destroy', 'deletes a protected branch'],
    [/git\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*d|git\s+clean\s+-[a-zA-Z]*d[a-zA-Z]*f/, 'protected-delete', 'git clean -fd removes untracked campaign state'],
    [/--publish-report/, 'publish', 'publishing an eval report is not allowed'],
    [/(^|[\s;&|(])(npm|pnpm|yarn)\s+publish\b|(^|[\s;&|(])gh\s|glab\s+(mr|issue)\s+(note|create|close|merge|approve|update)|glab\s+api\s[^;&|]*-X\s*(POST|PUT|PATCH|DELETE)/i, 'publish', 'publishes to a remote service'],
    [/(npm|pnpm)\s+(i|install)\s+[^;&|]*(-g\b|--global)|brew\s+install|pip3?\s+install|pipx\s+install/, 'system-install', 'installs software outside the repository'],
    [/(^|[\s;&|(])(curl|wget)\s/, 'network', 'no network access beyond model calls and npm ci (08 §4)'],
  ];
  for (const [re, rule, reason] of denyRules) if (re.test(c)) return deny(rule, reason);

  if (/(^|[;&|(])\s*claude\s+plugin\s+eval\b/.test(c) && !/--no-publish/.test(c)) return deny('publish', 'claude plugin eval without --no-publish publishes the report');
  const reset = /git\s+reset\s+[^;&|]*--hard\s+(\S+)?/.exec(c);
  if (reset && !(reset[1] ?? '').startsWith('gym/')) return deny('reset-outside-campaign', 'git reset --hard only to a gym/<campaign>/ tag (08 §3)');
  const claudeCall = /(^|[;&|(])\s*claude\s+(\S+)/.exec(c);
  if (claudeCall && !/^(plugin|--version|-v|auth)$/.test(claudeCall[2])) return deny('nested-agent', 'the lead may not start other Claude sessions; spawn helpers with the Agent tool');
  for (const f of ctx.forbiddenRoots ?? []) if (mentions(f)) return deny('forbidden-repo', 'touches a repository agents may not enter');
  if (mentions(roots.claudeHome)) return deny('claude-home', 'reads ~/.claude; use the archive copies (06 §5)');
  return allow();
}

export function classifyToolUse(toolName, toolInput, ctx) {
  const input = toolInput ?? {};
  if (/^mcp__/.test(toolName)) return deny('mcp', 'MCP tools are not part of the campaign (08 §4)');
  if (toolName === 'WebFetch' || toolName === 'WebSearch') return deny('network', 'no web access in the campaign (08 §4)');
  if (toolName === 'Bash' || toolName === 'PowerShell') return classifyBash(String(input.command ?? ''), ctx);
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
    return classifyPathWrite(String(input.file_path ?? input.notebook_path ?? ''), ctx);
  }
  if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep' || toolName === 'LSP') {
    const target = input.file_path ?? input.path ?? input.filePath ?? null;
    return target ? classifyPathRead(String(target), ctx) : allow();
  }
  return allow();
}

export function isHeavyStart(toolName, toolInput) {
  if (toolName === 'Agent' || toolName === 'Task') return true;
  return (toolName === 'Bash') && HEAVY_BASH.test(String(toolInput?.command ?? ''));
}

export function findSecret(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  for (const re of SECRET_TEXT) {
    const m = re.exec(text);
    if (m) return { pattern: re.source, excerpt: m[0].slice(0, 12) + '…' };
  }
  return null;
}

/** Context size of the latest model call: input + cache read + cache creation of the last assistant row with usage. */
export function contextTokensFromTranscript(tail) {
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    try {
      const row = JSON.parse(line);
      const u = row?.message?.usage;
      if (row?.type !== 'assistant' || !u) continue;
      return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    } catch {
      // A partial first line of the tail; keep looking backwards.
    }
  }
  return null;
}

/** Returns the advice text to inject, or null; `lastAdvised` is the token level of the previous advice. */
export function contextAdvice({ tokens, soft, hard, step, lastAdvised }) {
  if (tokens === null || tokens < soft) return null;
  if (lastAdvised !== null && tokens - lastAdvised < step && !(tokens >= hard && lastAdvised < hard)) return null;
  if (tokens >= hard) {
    return `CAMPAIGN CONTEXT ${tokens} ≥ hard limit ${hard}. New sweeps, recordings and helper spawns are now refused. ` +
      'Finish only the step in progress, record it (decision.md or an in-flight note in STATE.md), set PHASE to handoff, and end your turn. The supervisor starts a fresh session.';
  }
  return `CAMPAIGN CONTEXT ${tokens} ≥ soft limit ${soft}. Do not start a new iteration. ` +
    'Finish the current iteration to its record step, set PHASE to idle then handoff, and end your turn at that safe point. Do not stop mid-step.';
}

/** Stop hook: block a stop that is not at a safe point, and keep the session working while context is cheap. */
export function stopDecision({ phase, tokens, soft, stopHookActive, stopFile, campaignStatus }) {
  if (stopFile || campaignStatus === 'done' || campaignStatus === 'stopped') return null;
  if (stopHookActive) return null;
  const p = phase ?? 'boot';
  if (!SAFE_PHASES.has(p)) {
    return `PHASE is "${p}", not a safe point. Continue the current step to its record (02 §3.7), then set PHASE to idle before stopping. ` +
      'If you are blocked, set PHASE to blocked and write the reason to labels/pending.md or incidents/.';
  }
  if (p === 'idle' && (tokens === null || tokens < soft)) {
    return `Context ${tokens ?? 'unknown'} is below the soft limit ${soft}; continue with the next iteration (02 §3). ` +
      'Set PHASE to blocked if every remaining item waits on the owner.';
  }
  return null;
}

/**
 * Supervisor decision after a lead session ends. Pure: the caller supplies the observed state.
 * Returns { action: 'exit'|'halt'|'fresh'|'resume'|'sleep', reason, rollback?: boolean }.
 */
export function superviseDecision(s) {
  if (s.stopFile) return { action: 'exit', reason: 'STOP file present' };
  if (s.campaignStatus === 'done') return { action: 'exit', reason: 'campaign status done', notify: true };
  if (s.killMarker) {
    const violations = s.violations + 1;
    if (violations >= s.maxViolations) {
      return { action: 'halt', reason: `guard kill #${violations} (${s.killMarker.rule}); limit ${s.maxViolations} reached`, rollback: true, violations };
    }
    return { action: 'fresh', reason: `guard kill #${violations} (${s.killMarker.rule}); rolled back, fresh session`, rollback: true, violations, incident: true };
  }
  if (s.budgetUsd !== null && s.spentUsd >= 0.9 * s.budgetUsd) return { action: 'halt', reason: `spend ${s.spentUsd.toFixed(2)} ≥ 90% of ${s.budgetUsd}` };
  if (s.rateLimited) return { action: 'sleep', reason: 'usage or rate limit' };
  if (s.consecutiveFailures >= s.maxFailures) return { action: 'halt', reason: `${s.consecutiveFailures} consecutive sessions ended without progress` };

  const tokens = s.tokens ?? 0;
  const normal = s.exitCode === 0 && !s.signal && !s.watchdog && !s.resultIsError;
  if (normal) {
    if (s.phase === 'blocked') return { action: 'exit', reason: 'lead is blocked on the owner (PHASE blocked)', notify: true };
    if (s.phase === 'handoff' || (s.phase === 'idle' && tokens >= s.soft)) return { action: 'fresh', reason: `planned rollover at ${tokens} tokens` };
    if (tokens >= s.hard) return { action: 'fresh', reason: `unexpected stop in phase ${s.phase ?? 'unknown'} above the hard limit` };
    return { action: 'resume', reason: `unexpected stop in phase ${s.phase ?? 'unknown'} at ${tokens} tokens` };
  }
  const why = s.watchdog ? 'watchdog: no activity' : s.signal ? `signal ${s.signal}` : s.resultIsError ? 'session reported an error' : `exit ${s.exitCode}`;
  if (tokens < s.hard && s.consecutiveFailures < 2 && s.sessionId) return { action: 'resume', reason: `${why}; resuming` };
  return { action: 'fresh', reason: `${why}; fresh session` };
}
