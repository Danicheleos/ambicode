export interface Clock {
  now(): Date;
  /** Monotonic-ish millisecond counter for durations. */
  elapsed(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  elapsed: () => performance.now(),
};
