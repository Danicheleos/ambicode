import type { Clock } from '#types/platform/ports';

export const systemClock: Clock = {
  now: () => new Date(),
  elapsed: () => performance.now(),
};
