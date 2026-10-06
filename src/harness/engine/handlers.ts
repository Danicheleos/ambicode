import type { Call } from '../definition/routes.ts';
import type { Handler, HandlerRegistry } from '#types/harness';

export function handlerRegistry(handlers: Readonly<Record<string, Handler>>): HandlerRegistry {
  return { get: (name) => handlers[name] ?? null, names: () => Object.keys(handlers) };
}

/** The key a step's `payload` list names a call's output by. */
export function payloadKey(call: Call): string {
  switch (call.name) {
    case 'search.map': return 'map';
    case 'policy.stage': return `policy:${call.params[0] ?? ''}`;
    case 'requirements.acs': return 'acs';
    case 'requirements.template': return 'template';
    case 'requirements.normalize': return 'envelope';
    case 'evidence.navigationLine': return 'navigation';
    case 'task.start': return 'brief';
    case 'task.inventory': return 'callers';
    case 'checks.baseline': return 'baseline';
    case 'task.report': return 'report';
    default: return call.name;
  }
}
