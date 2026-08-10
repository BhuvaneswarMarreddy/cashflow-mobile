import { respond } from '@/mocks/mockBackend';

import type { Repositories } from './types';

const byDateDescending = <T extends { date: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => b.date.localeCompare(a.date));

/** Repositories backed by the scenario dataset. The default in every build today. */
export const mockRepositories: Repositories = {
  accounts: {
    list: () => respond('accounts', (data) => data.accounts),
    byId: (id) => respond('accounts', (data) => data.accounts.find((a) => a.id === id) ?? null),
  },

  activity: {
    list: (options = {}) =>
      respond('activity', (data) => {
        const filtered = options.accountId
          ? data.transactions.filter((t) => t.accountId === options.accountId)
          : data.transactions;
        const ordered = byDateDescending(filtered);
        return options.limit ? ordered.slice(0, options.limit) : ordered;
      }),
  },

  snapshot: {
    current: () =>
      respond('snapshot', (data) => ({ snapshot: data.snapshot, previous: data.previousSnapshot })),
  },

  plan: {
    upcoming: () =>
      respond('plan', (data) =>
        [...data.upcoming].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      ),
    goals: () => respond('plan', (data) => data.goals),
    nextPaycheck: () => respond('plan', (data) => data.paycheck),
  },
};
