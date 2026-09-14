/**
 * cashflow-mobile#24. Category set — DEFAULTS ONLY.
 *
 * The server treats the category set as the OWNER'S OWN: the 13 defaults
 * below, plus whatever custom ones they've added from chat
 * (`add_category`/`rename_category`/`remove_category`, cashflow-forecast's
 * `resolveCategories()`). `homeSnapshot`'s payload carries that resolved set
 * on every refresh (`snapshot.categories`) into `useFinanceStore`.
 *
 * `CATEGORIES` here is now only the FALLBACK a screen shows before the first
 * snapshot has landed — never hardcode it as "the" category set again, or it
 * goes stale the moment the owner adds one from chat. `resolveCategories`
 * below is the one place that fallback happens; every consumer (the picker,
 * the chat parser) reads through it, never `CATEGORIES` directly.
 */
export interface CategoryOption {
  value: string;
  label: string;
  /** Optional, matching the wire (`icon?: string`) — every DEFAULT sets one;
   *  a custom entry may not. Render through `iconFor()` below, never this
   *  field directly, so a missing icon never shows as blank. */
  icon?: string;
  /** A removed category — never offered for a NEW selection, still resolvable
   *  for a row that already carries it. Absent (not just `false`) on every
   *  default and on a custom entry the owner hasn't removed. */
  archived?: boolean;
}

/** No custom entry has set an icon of its own — matches the server's own
 *  fallback (`CUSTOM_CATEGORY_FALLBACK_ICON`, cashflow-forecast
 *  `src/types/index.ts`). Render through `iconFor()`, never this constant
 *  directly. */
export const FALLBACK_CATEGORY_ICON = '🏷️';

/** What to actually render for a category's icon — never `category.icon` raw. */
export const iconFor = (category: Pick<CategoryOption, 'icon'>): string =>
  category.icon || FALLBACK_CATEGORY_ICON;

export const CATEGORIES: readonly CategoryOption[] = [
  { value: 'food', label: 'Food & Dining', icon: '🍽️' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'utilities', label: 'Utilities', icon: '💡' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'shopping', label: 'Shopping', icon: '🛍️' },
  { value: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { value: 'education', label: 'Education', icon: '📚' },
  { value: 'travel', label: 'Travel', icon: '✈️' },
  { value: 'subscriptions', label: 'Subscriptions', icon: '📱' },
  { value: 'rent', label: 'Rent & Housing', icon: '🏠' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'investments', label: 'Investments', icon: '📈' },
  { value: 'other', label: 'Other', icon: '📋' },
];

/**
 * The owner's effective set: whatever the store has from the last snapshot,
 * or the 13 defaults when there is nothing yet (cold start, or a refresh that
 * hasn't landed). The server does the actual defaults+custom MERGE
 * (`resolveCategories()`, cashflow-forecast `src/types/index.ts`) — this is
 * only the client-side "or defaults" half, never a second merge.
 */
export const resolveCategories = (
  fromStore: readonly CategoryOption[],
): readonly CategoryOption[] => (fromStore.length > 0 ? fromStore : CATEGORIES);

/**
 * What a NEW-selection picker offers: every ASSIGNABLE category (defaults +
 * non-archived custom), plus `currentValue` even if it is archived — mirrors
 * the web's `selectableCategories` (cashflow-forecast `src/types/index.ts`).
 * Without the `currentValue` carve-out, opening the picker on a row already
 * filed under a just-removed category would show no option matching its own
 * value, which reads as "nothing chosen" rather than the truth.
 */
export const selectableCategories = (
  categories: readonly CategoryOption[],
  currentValue?: string,
): readonly CategoryOption[] => {
  const assignable = categories.filter((category) => !category.archived);
  if (!currentValue || assignable.some((category) => isCategory(category, currentValue))) {
    return assignable;
  }
  const current = categories.find((category) => isCategory(category, currentValue));
  return current ? [...assignable, current] : assignable;
};

/**
 * Does this option describe the row's current category?
 *
 * The server collapses two fields into ONE wire string — `sourceCategory ??
 * category` (functions/src/snapshot.ts) — so the phone receives either a slug
 * ("food") or a provider label ("Food & Dining") and cannot tell which.
 * Matching on `value` alone was never true for an imported row, which silently
 * killed the archived-category carve-out above: a row filed under a
 * just-removed category showed no option matching its own value, reading as
 * "nothing chosen" rather than the truth.
 */
export const isCategory = (option: CategoryOption, wireCategory: string): boolean =>
  option.value === wireCategory || option.label === wireCategory;

/**
 * label -> a slug (`[a-z0-9-]{1,32}`), collision-safe against `taken` (the
 * owner's current default + custom values). Ported VERBATIM from
 * cashflow-forecast's `slugForCategoryLabel` (`src/types/index.ts`) — this is
 * what turns "Vacations" into `vacations` on `add_category`'s Apply. A slug
 * mismatch between the two clients would create duplicate-looking categories.
 */
export const slugForCategoryLabel = (label: string, taken: ReadonlySet<string>): string => {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'category';
  if (!taken.has(base)) return base;
  // ponytail: linear collision probe — fine at personal-app scale (a handful
  // of categories), mirrors the server's own note on this exact function.
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, 32 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 26)}-${Date.now().toString(36).slice(-5)}`;
};
