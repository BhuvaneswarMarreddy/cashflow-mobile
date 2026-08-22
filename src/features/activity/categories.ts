/**
 * The 13 expense categories a merchant rule can set.
 *
 * Mirrored VERBATIM from the server's enum (cashflow-forecast `src/types`
 * `EXPENSE_CATEGORIES`) — the server is authoritative for this list and
 * rejects anything else with invalid-argument "Malformed category." A value
 * added here that drifts from the server fails loudly at the callable, the
 * first time someone picks it, never silently.
 */
export interface CategoryOption {
  value: string;
  label: string;
  emoji: string;
}

export const CATEGORIES: readonly CategoryOption[] = [
  { value: 'food', label: 'Food & Dining', emoji: '🍽️' },
  { value: 'transportation', label: 'Transportation', emoji: '🚗' },
  { value: 'utilities', label: 'Utilities', emoji: '💡' },
  { value: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'healthcare', label: 'Healthcare', emoji: '🏥' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'travel', label: 'Travel', emoji: '✈️' },
  { value: 'subscriptions', label: 'Subscriptions', emoji: '📱' },
  { value: 'rent', label: 'Rent & Housing', emoji: '🏠' },
  { value: 'insurance', label: 'Insurance', emoji: '🛡️' },
  { value: 'investments', label: 'Investments', emoji: '📈' },
  { value: 'other', label: 'Other', emoji: '📋' },
];
