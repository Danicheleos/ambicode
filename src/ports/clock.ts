export interface Clock {
  now(): Date;
  elapsed(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  elapsed: () => performance.now(),
};
