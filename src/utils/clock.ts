/**
 * Time, injected.
 *
 * Every timestamp in the app comes from a Clock rather than `Date.now()`
 * directly, so tests can pin "now" and financial reasoning ("bill due in 3
 * days", "next paycheck Friday") stays deterministic.
 */
export interface Clock {
  now(): number;
  iso(): string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  iso: () => new Date().toISOString(),
};

/** Test helper: a clock that starts at `startMs` and only moves when told to. */
export const createFixedClock = (startMs: number): Clock & { advance: (ms: number) => void } => {
  let current = startMs;
  return {
    now: () => current,
    iso: () => new Date(current).toISOString(),
    advance: (ms: number) => {
      current += ms;
    },
  };
};
