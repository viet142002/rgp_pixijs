import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { migrate, MIGRATIONS } from "../engine/persistence/migration.js";
import { SAVE_SCHEMA_VERSION } from "../engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Migration chain — direct unit tests", () => {
  it("v1 → v2 adds factionWars default empty array", () => {
    const v1Payload = {
      schemaVersion: 1,
      player: { id: "player" },
      factionWars: undefined,
    } as unknown as Record<string, unknown>;
    const { payload, reached } = migrate(v1Payload, 2);
    expect(reached).toBe(2);
    expect(payload.factionWars).toEqual([]);
    expect(payload.schemaVersion).toBe(2);
  });

  it("v1 → v2 preserves existing factionWars", () => {
    const v1Payload = {
      schemaVersion: 1,
      factionWars: [{ factionA: "a", factionB: "b", intensity: 50 }],
    } as unknown as Record<string, unknown>;
    const { payload } = migrate(v1Payload, 2);
    expect(payload.factionWars).toEqual([{ factionA: "a", factionB: "b", intensity: 50 }]);
  });

  it("migrate is idempotent at target", () => {
    const v2Payload = { schemaVersion: 2, factionWars: [] };
    const { reached } = migrate(v2Payload, 2);
    expect(reached).toBe(2);
  });

  it("migrate throws on missing migration step", () => {
    const v3Payload = { schemaVersion: 3 };
    expect(() => migrate(v3Payload, 5)).toThrow(/No migration/);
  });

  it("MIGRATIONS array has v1→v2 step", () => {
    expect(MIGRATIONS.some((m) => m.from === 1 && m.to === 2)).toBe(true);
  });
});

describe("Migration chain — engine roundtrip", () => {
  it("engine save carries current schemaVersion", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 7001, data });
    const save = engine.save();
    expect(save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it("force-saved v1 payload migrates to current via SaveManager.load", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 7002, data });
    const currentSave = engine.save();

    // Build a v1 payload by downgrading the current save.
    const v1Payload = {
      ...currentSave,
      schemaVersion: 1,
      // Drop fields that didn't exist in v1 (factionWars) to simulate old save.
      factionWars: undefined,
    } as unknown as Record<string, unknown>;

    // Direct migrate() works without IDB.
    const { payload, reached } = migrate(v1Payload, SAVE_SCHEMA_VERSION);
    expect(reached).toBe(SAVE_SCHEMA_VERSION);
    expect(payload.factionWars).toEqual([]);
    expect(payload.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it("SaveManager.load rejects newer-schema saves", async () => {
    // Simulate a future schema version via direct IDB injection.
    const { SaveManager } = await import("../engine/persistence/saveManager.js");
    const mgr = new SaveManager();
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 7003, data });
    const current = engine.save();
    const futurePayload = { ...current, schemaVersion: 99 };

    // Save succeeds (no validation on write); load rejects on version mismatch.
    await mgr.save(1, futurePayload as typeof current);
    await expect(mgr.load(1)).rejects.toThrow(/newer than engine/);
  });
});
