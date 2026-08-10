import { apiClient, type ApiClient } from '@/api';

import type { Repositories, SnapshotBundle } from './types';
import type { Account, Paycheck, SavingsGoal, Transaction, UpcomingPayment } from '@/types';

/**
 * The real thing, waiting for a backend.
 *
 * These are written out rather than stubbed so that flipping
 * `ENABLE_MOCK_API` off is a real switch and not a promise. The endpoint shapes
 * are the contract this client expects; when the backend lands, either it
 * matches or this file is where the translation goes.
 */
export const createHttpRepositories = (client: ApiClient = apiClient): Repositories => ({
  accounts: {
    list: async () => (await client.get<Account[]>('/accounts')).data,
    byId: async (id) => (await client.get<Account | null>(`/accounts/${id}`)).data,
  },

  activity: {
    list: async (options = {}) =>
      (
        await client.get<Transaction[]>('/transactions', {
          query: { accountId: options.accountId, limit: options.limit },
        })
      ).data,
  },

  snapshot: {
    current: async () => (await client.get<SnapshotBundle>('/snapshot')).data,
  },

  plan: {
    upcoming: async () => (await client.get<UpcomingPayment[]>('/plan/upcoming')).data,
    goals: async () => (await client.get<SavingsGoal[]>('/plan/goals')).data,
    nextPaycheck: async () => (await client.get<Paycheck | null>('/plan/paycheck')).data,
  },
});
