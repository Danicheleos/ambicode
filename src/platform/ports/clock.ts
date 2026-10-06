import type { Clock } from '#types/ports';

export const systemClock: Clock = {
  now: () => new Date(),
  elapsed: () => performance.now(),
};
