import { describe, it, expect, beforeEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import {
  SaveManager, createSaveManager,
} from "../engine/persistence/saveManager.js";
import { MAX_MANUAL_SLOTS, AUTO_SLOT } from "../engine/persistence/db.js";
import type { GameSave } from "../engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

async function freshSave(): Promise<GameSave> {
  const data = await loadStaticData(DATA_DIR);
  const engine = createEngine({ seed: 12345, data });
  for (let i = 0; i < 25; i++) engine.tickWorld();
  engine.state.player.stats.hp = 73;
  return engine.save();
}

describe("SaveManager — IndexedDB persistence (spec E1)", () => {
  let mgr: SaveManager;

  beforeEach(() => {
    mgr = createSaveManager();
  });

  it("save then load returns equivalent payload", async () => {
    const payload = await freshSave();
    const meta = await mgr.save(1, payload);
    expect(meta.slot).toBe(1);
    expect(meta.schemaVersion).toBe(payload.schemaVersion);
    expect(meta.checksum).toMatch(/^[a-f0-9]{64}$/);

    const loaded = await mgr.load(1);
    expect(loaded).not.toBeNull();
    expect(loaded!.player.stats.hp).toBe(73);
    expect(loaded!.worldTime).toBeDefined();
  });

  it("auto save uses slot 1 only", async () => {
    const payload = await freshSave();
    await mgr.save(AUTO_SLOT, payload, "auto");
    await expect(mgr.save(2, payload, "auto")).rejects.toThrow(/Auto save uses slot/);
  });

  it("manual slot max enforced", async () => {
    const payload = await freshSave();
    await mgr.save(MAX_MANUAL_SLOTS, payload);
    await expect(mgr.save(MAX_MANUAL_SLOTS + 1, payload)).rejects.toThrow(/max/);
  });

  it("separate slots are isolated", async () => {
    const payload = await freshSave();
    await mgr.save(1, payload);
    payload.player.stats.hp = 99;
    await mgr.save(2, payload);

    const a = await mgr.load(1);
    const b = await mgr.load(2);
    expect(a!.player.stats.hp).toBe(73);
    expect(b!.player.stats.hp).toBe(99);
  });

  it("manual and auto slots independent", async () => {
    const payload = await freshSave();
    payload.player.stats.hp = 50;
    await mgr.save(1, payload, "manual");
    payload.player.stats.hp = 11;
    await mgr.save(1, payload, "auto");

    const manual = await mgr.load(1, "manual");
    const auto = await mgr.load(1, "auto");
    expect(manual!.player.stats.hp).toBe(50);
    expect(auto!.player.stats.hp).toBe(11);
  });

  it("list returns metadata for all saves", async () => {
    const payload = await freshSave();
    await mgr.save(1, payload);
    await mgr.save(2, payload);
    await mgr.save(AUTO_SLOT, payload, "auto");
    const list = await mgr.list();
    expect(list.length).toBe(3);
    expect(list.every((m) => typeof m.savedAt === "number")).toBe(true);
    expect(list.every((m) => /^[a-f0-9]{64}$/.test(m.checksum))).toBe(true);
  });

  it("delete removes a slot", async () => {
    const payload = await freshSave();
    await mgr.save(1, payload);
    await mgr.save(2, payload);
    await mgr.delete(1);
    expect(await mgr.load(1)).toBeNull();
    expect(await mgr.load(2)).not.toBeNull();
  });

  it("load on empty slot returns null", async () => {
    expect(await mgr.load(1)).toBeNull();
  });
});

describe("SaveManager — checksum integrity (spec E1)", () => {
  it("detects tampered payload", async () => {
    const mgr = createSaveManager();
    const payload = await freshSave();
    const meta = await mgr.save(1, payload);

    // Tamper: rewrite payload in memory map directly via internal db.
    // For IDB path, simulate by rewriting the row through Dexie table API.
    // (Cheat: use the memory fallback by deleting IDB and re-saving.)
    // Easier: just corrupt the checksum — loader reads the same payload so
    // checksum is recomputed and still matches. To force mismatch, we
    // override the row's checksum with wrong value via raw db access.
    const db = await (mgr as unknown as { readyDb: () => Promise<{ table: (n: string) => { put: (r: unknown) => Promise<unknown>; get: (k: string) => Promise<{ checksum: string } | undefined> } }> }).readyDb();
    const key = "manual:1";
    const row = await db.table("saves").get(key);
    if (row) {
      await db.table("saves").put({ ...row, checksum: "0".repeat(64) });
    }
    void meta;
    await expect(mgr.load(1)).rejects.toThrow(/checksum mismatch/);
  });
});

describe("SaveManager — quota (spec E5)", () => {
  it("returns null when no quota configured", async () => {
    const mgr = createSaveManager();
    const payload = await freshSave();
    await mgr.save(1, payload);
    expect(await mgr.quotaCheck()).toBeNull();
  });

  it("computes usage ratio when quota set", async () => {
    const mgr = createSaveManager({ quotaBytes: 100_000 });
    const payload = await freshSave();
    await mgr.save(1, payload);
    const q = await mgr.quotaCheck();
    expect(q).not.toBeNull();
    expect(q!.ratio).toBeGreaterThan(0);
    expect(q!.ratio).toBeLessThan(1);
  });
});

describe("SaveManager — migration chain (spec E4)", () => {
  it("no migrations: payload loads unchanged", async () => {
    const mgr = createSaveManager();
    const payload = await freshSave();
    await mgr.save(1, payload);
    const loaded = await mgr.load(1);
    expect(loaded!.schemaVersion).toBe(payload.schemaVersion);
  });
});
