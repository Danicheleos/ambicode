# Layer boundaries (final state)

Enforced by `src/architecture.test.ts`, which reads every non-test `.ts` file under `src/` with the TypeScript AST (static imports, re-exports, `import x = require()`, dynamic imports).
An import across areas must point to a strictly lower rank; imports inside one area are not checked, and `types` and `util` (both -1) may import each other. `types` may name a platform type but never import a value.

## Ranks

| Area | Rank | Role |
|---|---|---|
| `types`, `util` | -1 | usable from anywhere, import nothing above them |
| `platform` | 0 | git, ports, providers, ledger schema |
| `modules` | 1 | capabilities, one folder each |
| `harness` | 2 | route engine, DSL, gates, session |
| `skills` | 3 | per-skill handlers, steps and guarded commands |
| `composition` | 4 | runtime and app wiring (`createApp`) |
| `hook` | 5 | Claude Code hook adapters and the guard bundle |
| `cli` | 6 | bin entry and commands |
| `testing` | 7 | fakes and fixtures |

Test files (`*.test.ts`) are not scanned. The guard bundle is capped at 70 KiB, measured in bytes by the same test.

## ALLOWLIST

`ALLOWLIST` is empty. An entry would name a known crossing; an entry that no longer occurs fails the test, so the list can only shrink. None may be added.

## The seam

L1 modules cannot import the harness, so anything that needs the route goes through a seam:

- Each skill declares its guarded commands in `COMMAND_SPECS` (`GuardedCommand {name, skill, route: optional|owned}`) in `skills/<skill>/commands.ts`.
- The CLI calls `Engine.command(spec, {task}, body)` (`harness/engine/command.ts`). The engine resolves whom the call speaks for, refuses an `owned` command without exactly one live route, opens the route view and passes `body` a `CommandScope {task, session, binding, view, context}`.
- `CommandContext` (`types/harness.ts`) is the only route access a module gets: `resolve`, `open`, `assertOwner`, `window`, `object`, `consent`, `entries`, `raise`. It replaced `RouteContextPort`.
- `composition/app.ts` `createApp(runtime)` wires the route registry, the active-route pointer and the engine over the skills' handlers, so the engine does not import skills.
- Pure ledger helpers (`buildChain`, `liveHeads`, `exitOf`, `cycleEntries`, `ownerOf`, in `modules/evidence`) let L1 read the fold without the engine. Session rebind lives in `harness/session/rebind.ts`; `startTarget` in `composition/start.ts`; argument parsing in `util/args.ts`.

## Orchestration in modules (accepted)

The imports point down; orchestration still runs inside L1 module code through the injected `CommandContext`: owner re-check under the ledger lock, consent evaluation and gate raising. The seam inverts the import, not the control flow. The user accepted this as meeting A1 (2026-10-07).
