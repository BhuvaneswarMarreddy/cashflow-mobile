import { AppError } from '@/errors';
import { useDevStore } from '@/store/devStore';

import type { MockDataset } from './dataset';
import { SCENARIOS, type Scenario } from './scenarios';

/**
 * A fake backend with a real backend's manners.
 *
 * It takes time, it sometimes fails, and it fails in ways the UI has to handle
 * — which is the point. A mock layer that always resolves instantly hides every
 * loading and error state until the day the real API arrives.
 */

/** Feels like a real request without making development tedious. */
const BASE_LATENCY_MS = 320;
const JITTER_MS = 180;
const SLOW_EXTRA_MS = 2_600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const currentScenario = (): Scenario => SCENARIOS[useDevStore.getState().scenario];

export type MockResource = 'accounts' | 'activity' | 'snapshot' | 'plan';

const shouldFail = (resource: MockResource, scenario: Scenario): boolean => {
  const dev = useDevStore.getState();
  if (dev.simulateFailure || dev.simulateOffline) return true;
  if (scenario.behaviour.failAll) return true;
  if (scenario.behaviour.failActivity && resource === 'activity') return true;
  return false;
};

const failureFor = (resource: MockResource): AppError => {
  const dev = useDevStore.getState();
  const offline = dev.simulateOffline || currentScenario().behaviour.offline === true;
  return new AppError({
    category: offline ? 'network' : 'service-unavailable',
    code: offline ? 'OFFLINE' : 'MOCK_FAILURE',
    technicalMessage: `Simulated failure fetching ${resource}`,
    metadata: { resource, simulated: true },
  });
};

const latency = (scenario: Scenario): number => {
  const dev = useDevStore.getState();
  const slow = dev.simulateSlowNetwork ? SLOW_EXTRA_MS : 0;
  return (
    BASE_LATENCY_MS + Math.random() * JITTER_MS + slow + (scenario.behaviour.extraLatencyMs ?? 0)
  );
};

/**
 * Resolve a value the way the network would: after a delay, or not at all.
 * `select` runs after the delay so the data reflects the scenario in force when
 * the response lands, not when the call started.
 */
export const respond = async <T>(
  resource: MockResource,
  select: (data: MockDataset) => T,
): Promise<T> => {
  const scenario = currentScenario();
  await sleep(latency(scenario));
  if (shouldFail(resource, scenario)) throw failureFor(resource);
  return select(scenario.build(Date.now()));
};

/** Synchronous read, for tests and for seeding. Bypasses latency and failure. */
export const readDataset = (now: number = Date.now()): MockDataset => currentScenario().build(now);
