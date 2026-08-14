/**
 * Save schema migration chain (spec/03 "Version migration").
 *
 * Each entry migrates from version N to version N+1.
 * Migrations transform the raw JSON payload (object) in place.
 *
 * To bump SAVE_SCHEMA_VERSION:
 *   1. Increment in engine/types.ts.
 *   2. Push a new entry below.
 *   3. Cover the new field with backward-compat logic.
 */

export interface MigrationStep {
  from: number;
  to: number;
  apply: (payload: Record<string, unknown>) => Record<string, unknown>;
}

export const MIGRATIONS: MigrationStep[] = [
  // Schema v1 → v2: spec/03 "Version migration" example.
  // Adds factionWars as empty array when missing (older saves omitted it).
  {
    from: 1,
    to: 2,
    apply: (p) => ({
      ...p,
      factionWars: Array.isArray(p.factionWars) ? p.factionWars : [],
      schemaVersion: 2,
    }),
  },
];

/**
 * Apply migrations sequentially until payload.schemaVersion reaches target.
 * Returns the migrated payload and final version.
 */
export function migrate(
  payload: Record<string, unknown>,
  target: number
): { payload: Record<string, unknown>; reached: number } {
  let current = Number(payload.schemaVersion ?? 0);
  let working = payload;
  while (current < target) {
    const step = MIGRATIONS.find((m) => m.from === current);
    if (!step) {
      throw new Error(
        `No migration from schema v${current} → next; cannot reach v${target}`
      );
    }
    working = step.apply(working);
    current = step.to;
  }
  return { payload: working, reached: current };
}
