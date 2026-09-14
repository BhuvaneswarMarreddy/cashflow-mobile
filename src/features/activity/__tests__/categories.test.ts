import { CATEGORIES, resolveCategories, selectableCategories, slugForCategoryLabel } from '../categories';

/**
 * cashflow-mobile#24. `resolveCategories`/`selectableCategories`/
 * `slugForCategoryLabel` are the client-side half of the owner's own category
 * set — `slugForCategoryLabel` is ported VERBATIM from cashflow-forecast's
 * `src/types/index.ts` and these tests pin the same behaviour that file's own
 * suite pins, so a future edit here can't silently drift from the server.
 */
describe('resolveCategories', () => {
  it('falls back to the 13 defaults when the store has nothing yet', () => {
    expect(resolveCategories([])).toEqual(CATEGORIES);
  });

  it('passes the store set through unchanged once one has landed', () => {
    const fromStore = [...CATEGORIES, { value: 'vacations', label: 'Vacations', icon: '🏖️' }];
    expect(resolveCategories(fromStore)).toEqual(fromStore);
  });
});

describe('selectableCategories', () => {
  const withCustomAndArchived = [
    ...CATEGORIES,
    { value: 'vacations', label: 'Vacations', icon: '🏖️' },
    { value: 'old-hobby', label: 'Old Hobby', icon: '🎨', archived: true },
  ];

  it('offers every default plus non-archived custom categories for a NEW selection', () => {
    const result = selectableCategories(withCustomAndArchived);
    expect(result.map((c) => c.value)).toEqual([...CATEGORIES.map((c) => c.value), 'vacations']);
  });

  it('excludes an archived category entirely when it is not the current value', () => {
    const result = selectableCategories(withCustomAndArchived, 'food');
    expect(result.some((c) => c.value === 'old-hobby')).toBe(false);
  });

  it('still includes the archived category when it IS the current value, so a picker never renders "nothing chosen"', () => {
    const result = selectableCategories(withCustomAndArchived, 'old-hobby');
    expect(result.some((c) => c.value === 'old-hobby')).toBe(true);
    // Every assignable category is still there too — the archived one is added, not swapped in.
    expect(result.length).toBe(CATEGORIES.length + 2);
  });

  it('is a no-op when currentValue is already assignable', () => {
    const result = selectableCategories(withCustomAndArchived, 'vacations');
    expect(result.map((c) => c.value)).toEqual([...CATEGORIES.map((c) => c.value), 'vacations']);
  });
});

describe('slugForCategoryLabel', () => {
  it('lowercases and hyphenates', () => {
    expect(slugForCategoryLabel('Vacations', new Set())).toBe('vacations');
    expect(slugForCategoryLabel('Home Repairs', new Set())).toBe('home-repairs');
  });

  it('strips non-alphanumeric characters and collapses runs of separators', () => {
    expect(slugForCategoryLabel('Vacations!!', new Set())).toBe('vacations');
    expect(slugForCategoryLabel('  Coffee & Tea  ', new Set())).toBe('coffee-tea');
  });

  it('falls back to "category" when the label has no alphanumeric content', () => {
    expect(slugForCategoryLabel('!!!', new Set())).toBe('category');
  });

  it('caps at 32 characters', () => {
    const slug = slugForCategoryLabel('A'.repeat(50), new Set());
    expect(slug.length).toBe(32);
    expect(slug).toBe('a'.repeat(32));
  });

  it('suffixes on collision, trying -2 then -3', () => {
    expect(slugForCategoryLabel('Vacations', new Set(['vacations']))).toBe('vacations-2');
    expect(slugForCategoryLabel('Vacations', new Set(['vacations', 'vacations-2']))).toBe(
      'vacations-3',
    );
  });

  it('keeps the suffixed candidate within the 32-char cap', () => {
    const base = 'a'.repeat(32);
    const slug = slugForCategoryLabel('A'.repeat(50), new Set([base]));
    expect(slug.length).toBeLessThanOrEqual(32);
    expect(slug).toBe(`${'a'.repeat(30)}-2`);
  });
});
