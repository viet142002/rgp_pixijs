/**
 * Dexie schema for IndexedDB-backed save storage (spec/03).
 *
 * Tables:
 *   saves       — keyed by [slot+kind], holds payload + metadata + checksum.
 *   meta        — key/value store for app-level flags (lastSlot, schemaVersion).
 *
 * The Dexie wrapper auto-imports lazily so the module is safe to load
 * in non-browser environments (tests inject `fake-indexeddb/auto`).
 */

import type { Table } from "dexie";
import { SAVE_SCHEMA_VERSION } from "../types.js";

export interface SaveRow {
  /** Composite key: slot index + kind ("manual" | "auto"). */
  key: string;
  slot: number;
  kind: "manual" | "auto";
  /** The serialized GameSave object. */
  payload: Record<string, unknown>;
  /** SHA-256 of canonical JSON of payload. */
  checksum: string;
  /** Wall-clock ms when save was written. */
  savedAt: number;
  /** Engine schema version at time of save. */
  schemaVersion: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Build the Dexie database schema. Lazy import of Dexie so test env
 * can install `fake-indexeddb` before first use.
 */
export async function openGameDb(name = "rpg-game"): Promise<unknown> {
  const { Dexie } = await import("dexie");
  class GameDb extends (Dexie as unknown as { new (n: string): { version: (n: number) => unknown; table: (n: string) => Table } }) {
    saves!: Table<SaveRow, string>;
    meta!: Table<MetaRow, string>;
  }
  const db = new GameDb(name);
  (db as unknown as { version: (n: number) => { stores: (s: Record<string, string>) => unknown } })
    .version(1).stores({
      saves: "key, slot, kind, savedAt",
      meta: "key",
    });
  // Track schema version in meta so loaders can warn.
  await db.table("meta").put({ key: "schemaVersion", value: SAVE_SCHEMA_VERSION });
  return db;
}

/**
 * Compose the primary key for a save slot.
 */
export function saveKey(slot: number, kind: "manual" | "auto" = "manual"): string {
  return `${kind}:${slot}`;
}

/** Maximum manual slots per spec/03. */
export const MAX_MANUAL_SLOTS = 3;
/** Single auto slot. */
export const AUTO_SLOT = 1;
