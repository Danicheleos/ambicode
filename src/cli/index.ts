// The ambicode CLI. main.ts is the bin entry and runs on import, so it is deliberately not re-exported.

// ./: argument parsing.
/** parseArgs(command, argv, spec) — parses a command's argv against its OptionSpec into ParsedArgs; throws bad-argument on unknown options. */
export { parseArgs } from './args.ts';

// commands/<group>/<name>.ts: each exports its *_OPTIONS and a CliCommand record ({ name, options, validate?, run }); main.ts looks commands up by name.
// The commands other areas call directly:
/** runPrepare(runtime, args, options?) — runs `prepare`: resolves policy for the request and returns the rendered result; call with parsed args. */
export { runPrepare } from './commands/prepare/prepare.ts';
/** startTarget(skill, args) — the review target a `route start` names (--mr/--base/--branch), or undefined for uncommitted work. */
export { startTarget } from './commands/route/route.ts';
