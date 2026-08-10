import { isEnabled } from '@/config/featureFlags';

import { createFirebaseRepositories } from './firebaseRepositories';
import { mockRepositories } from './mockRepositories';
import type { Repositories } from './types';

/**
 * The one place that decides where data comes from.
 *
 * `ENABLE_MOCK_API` is read per call rather than captured once, so the
 * developer panel can flip between mock and real data without a reload.
 *
 * Real data is the `homeSnapshot` callable, never direct Firestore reads —
 * see `firebaseRepositories.ts` for why (balances are not stored).
 */
const live = createFirebaseRepositories();

export const repositories: Repositories = {
  get accounts() {
    return isEnabled('ENABLE_MOCK_API') ? mockRepositories.accounts : live.accounts;
  },
  get activity() {
    return isEnabled('ENABLE_MOCK_API') ? mockRepositories.activity : live.activity;
  },
  get snapshot() {
    return isEnabled('ENABLE_MOCK_API') ? mockRepositories.snapshot : live.snapshot;
  },
  get plan() {
    return isEnabled('ENABLE_MOCK_API') ? mockRepositories.plan : live.plan;
  },
};

export { createFirebaseRepositories } from './firebaseRepositories';
export { createHttpRepositories } from './httpRepositories';
export { mockRepositories } from './mockRepositories';
export type {
  AccountsRepository,
  ActivityRepository,
  PlanRepository,
  Repositories,
  SnapshotBundle,
  SnapshotRepository,
} from './types';
