/**
 * SaveManager — atomic CRUD over IndexedDB (spec/03 E1-E5).
 *
 * API:
 *   save(slot, payload, kind?)   — atomic write (tx), checksum computed.
 *   load(slot, kind?)            — read + verify checksum + migrate.
 *   list()                       — slot metadata (no payload).
 *   delete(slot, kind?)          — remove.
 *   quotaCheck()                 — estimate usage + warn near quota.
 *
 * Falls back to in-memory Map when IDB unavailable (Node without polyfill).
 */

import { SAVE_SCHEMA_VERSION, type GameSave } from "../types.js";
import {
  openGameDb, saveKey, MAX_MANUAL_SLOTS, AUTO_SLOT, type SaveRow,
} from "./db.js";
import { migrate } from "./migration.js";
import { sha256Hex } from "./checksum.js";

export interface SaveMeta {
  slot: number;
  kind: "manual" | "auto";
  savedAt: number;
  schemaVersion: number;
  checksum: string;
  size: number;
}

export interface SaveManagerOptions {
  dbName?: string;
  /** Optional quota estimate (bytes). Browser returns navigator.storage.estimate(). */
  quotaBytes?: number;
}

export class SaveManager {
  private db: unknown = null;
  private memory = new Map<string, SaveRow>();
  private options: SaveManagerOptions;
  private ready: Promise<void>;

  constructor(options: SaveManagerOptions = {}) {
    this.options = options;
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      this.db = await openGameDb(this.options.dbName);
    } catch {
      // No IDB available (e.g., Node without polyfill).
      // Fall back to in-memory map for tests / scripts.
      this.db = null;
    }
  }

  private async readyDb(): Promise<unknown> {
    await this.ready;
    return this.db;
  }

  /**
   * Atomic save (spec/03 "Atomic write").
   * Wraps checksum compute + put in single IDB transaction.
   */
  async save(
    slot: number,
    payload: GameSave,
    kind: "manual" | "auto" = "manual"
  ): Promise<SaveMeta> {
    if (!Number.isInteger(slot) || slot < 1) {
      throw new Error(`Invalid slot ${slot}; must be ≥ 1`);
    }
    if (kind === "manual" && slot > MAX_MANUAL_SLOTS) {
      throw new Error(`Manual slot ${slot} exceeds max ${MAX_MANUAL_SLOTS}`);
    }
    if (kind === "auto" && slot !== AUTO_SLOT) {
      throw new Error(`Auto save uses slot ${AUTO_SLOT} only`);
    }
    const db = await this.readyDb();
    const canonical = JSON.stringify(payload);
    const checksum = await sha256Hex(canonical);
    const row: SaveRow = {
      key: saveKey(slot, kind),
      slot,
      kind,
      payload: payload as unknown as Record<string, unknown>,
      checksum,
      savedAt: Date.now(),
      schemaVersion: Number(payload.schemaVersion ?? SAVE_SCHEMA_VERSION),
    };

    if (db) {
      const d = db as { transaction: (m: string, t: string, fn: () => Promise<void>) => unknown };
      await d.transaction("rw", "saves", async () => {
        const t = (db as { table: (n: string) => { put: (r: SaveRow) => Promise<unknown> } }).table("saves");
        await t.put(row);
      });
    } else {
      this.memory.set(row.key, row);
    }

    return {
      slot,
      kind,
      savedAt: row.savedAt,
      schemaVersion: row.schemaVersion,
      checksum,
      size: canonical.length,
    };
  }

  /**
   * Load save + verify checksum + migrate to current schema version.
   */
  async load(
    slot: number,
    kind: "manual" | "auto" = "manual"
  ): Promise<GameSave | null> {
    const db = await this.readyDb();
    const row = db
      ? await (db as { table: (n: string) => { get: (k: string) => Promise<SaveRow | undefined> } })
          .table("saves").get(saveKey(slot, kind))
      : this.memory.get(saveKey(slot, kind));
    if (!row) return null;

    // Verify checksum.
    const canonical = JSON.stringify(row.payload);
    const expected = await sha256Hex(canonical);
    if (expected !== row.checksum) {
      throw new Error(`Save checksum mismatch in slot ${slot} (${kind}); file may be corrupt`);
    }

    // Migrate to current schema if needed.
    let payload = row.payload;
    if (row.schemaVersion < SAVE_SCHEMA_VERSION) {
      const { payload: migrated } = migrate(payload, SAVE_SCHEMA_VERSION);
      payload = migrated;
    } else if (row.schemaVersion > SAVE_SCHEMA_VERSION) {
      throw new Error(
        `Save schema v${row.schemaVersion} is newer than engine v${SAVE_SCHEMA_VERSION}`
      );
    }

    return payload as unknown as GameSave;
  }

  /** List all saves (metadata only — no payload). */
  async list(): Promise<SaveMeta[]> {
    const db = await this.readyDb();
    const rows: SaveRow[] = db
      ? await (db as { table: (n: string) => { toArray: () => Promise<SaveRow[]> } })
          .table("saves").toArray()
      : Array.from(this.memory.values());
    return rows
      .map((r) => ({
        slot: r.slot,
        kind: r.kind,
        savedAt: r.savedAt,
        schemaVersion: r.schemaVersion,
        checksum: r.checksum,
        size: JSON.stringify(r.payload).length,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async delete(slot: number, kind: "manual" | "auto" = "manual"): Promise<void> {
    const db = await this.readyDb();
    if (db) {
      await (db as { table: (n: string) => { delete: (k: string) => Promise<unknown> } })
        .table("saves").delete(saveKey(slot, kind));
    } else {
      this.memory.delete(saveKey(slot, kind));
    }
  }

  /**
   * Quota check (spec/03 E5).
   * Returns usage estimate vs configured quota.
   */
  async quotaCheck(): Promise<{ usedBytes: number; quotaBytes: number; ratio: number } | null> {
    const list = await this.list();
    const usedBytes = list.reduce((s, m) => s + m.size, 0);
    const quotaBytes = this.options.quotaBytes ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(quotaBytes)) return null;
    return { usedBytes, quotaBytes, ratio: usedBytes / quotaBytes };
  }
}

/**
 * Convenience: create a manager for tests with a fresh in-memory DB name.
 */
export function createSaveManager(opts: SaveManagerOptions = {}): SaveManager {
  return new SaveManager({ dbName: `rpg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...opts });
}
