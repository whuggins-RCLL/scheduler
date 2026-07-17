/**
 * Merge two id-keyed lists: items from `override` win, and any `base` items with
 * an id not present in `override` are kept. Used so a live Firestore snapshot
 * never wipes seeded defaults (schedule types) or optimistic local records that
 * have not yet round-tripped — the cause of records "vanishing" after a reload.
 */
export function unionById<T extends { id: string }>(base: T[], override: T[]): T[] {
  const overrideIds = new Set(override.map((item) => item.id));
  return [...override, ...base.filter((item) => !overrideIds.has(item.id))];
}
