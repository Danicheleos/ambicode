// The ambicode CLI. main.ts is the bin entry and runs on import, so it is deliberately not re-exported.

// ./: argument parsing.
/** parseArgs(command, argv, spec) — parses a command's argv against its OptionSpec into ParsedArgs; throws bad-argument on unknown options. */
export { parseArgs } from '#util/args';

// commands/<group>/<name>.ts: each exports its *_OPTIONS and a CliCommand record ({ name, options, validate?, run }); main.ts looks commands up by name.
// The commands other areas call directly:
/** startTarget(skill, args) — the review target a `route start` names (--mr/--base/--branch), or undefined for uncommitted work. */
export { startTarget } from './commands/route/route.ts';
