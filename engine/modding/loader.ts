/**
 * Mod loader — load JSON mods from data/mods/ folder and merge into StaticData.
 *
 * Mod format:
 *   mod_folder/
 *     mod.json            # manifest
 *     npcs/*.json         # NPC definitions (override or add)
 *     items/*.json        # items
 *     factions/*.json     # factions
 *     quests/*.json       # quests
 *     realms/*.json       # cultivation realms
 *     skills/*.json       # skills
 *
 * Manifest:
 *   {
 *     "id": "tu_tien_giac",
 *     "name": "Tu Tiên Giác Mod",
 *     "version": "0.1.0",
 *     "author": "...",
 *     "dependencies": [],
 *     "overrides": ["npcs/village_elder", ...]
 *   }
 *
 * Loader returns merged StaticData (deep merge per category).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import type { StaticData } from "../data/loader.js";

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  dependencies: string[];
  /** Path-based list of files this mod overrides in the base data. */
  overrides?: string[];
}

export interface LoadedMod {
  manifest: ModManifest;
  /** Files keyed by category. */
  files: Record<string, Record<string, unknown>>;
  /** Absolute path to mod folder. */
  path: string;
}

/**
 * Parse mod manifest from a folder.
 */
export function parseManifest(modPath: string): ModManifest | null {
  const manifestPath = join(modPath, "mod.json");
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as ModManifest;
    if (!parsed.id || !parsed.version) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Recursively walk a folder, loading all .json files into category buckets.
 * Top-level subfolder name becomes the category (npcs/, items/, ...).
 */
export function walkMod(modPath: string): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const walk = (dir: string, category: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry);
      let s: ReturnType<typeof statSync>;
      try { s = statSync(full); } catch { continue; }
      if (s.isDirectory()) {
        walk(full, category ? `${category}/${entry}` : entry);
      } else if (extname(entry) === ".json" && entry !== "mod.json") {
        const id = basename(entry, ".json");
        try {
          (out[category ?? "_root"] ??= {})[id] = JSON.parse(readFileSync(full, "utf-8"));
        } catch { /* skip invalid */ }
      }
    }
  };
  walk(modPath, "");
  return out;
}

/**
 * Load all mods from a directory (non-recursive — only top-level mod folders).
 */
export function loadMods(modsDir: string): LoadedMod[] {
  let topEntries: string[];
  try { topEntries = readdirSync(modsDir); } catch { return []; }
  const mods: LoadedMod[] = [];
  for (const entry of topEntries) {
    const full = join(modsDir, entry);
    let s: ReturnType<typeof statSync>;
    try { s = statSync(full); } catch { continue; }
    if (!s.isDirectory()) continue;
    const manifest = parseManifest(full);
    if (!manifest) continue;
    const files = walkMod(full);
    mods.push({ manifest, files, path: full });
  }
  return mods;
}

/**
 * Apply mods to base StaticData.
 * Mod entries override base entries with same id.
 * Returns new StaticData (does not mutate input).
 */
export function applyMods(base: StaticData, mods: LoadedMod[]): StaticData {
  const out: StaticData = {
    traits: new Map(base.traits),
    states: new Map(base.states),
    skills: new Map(base.skills),
    elements: new Map(base.elements),
    matchup: new Map(base.matchup),
    statuses: new Map(base.statuses),
    realms: new Map(base.realms),
    factions: new Map(base.factions),
    items: new Map(base.items),
    npcTemplates: new Map(base.npcTemplates),
    regions: new Map(base.regions),
    quests: new Map(base.quests),
    dialogues: new Map(base.dialogues),
    shops: new Map(base.shops),
    pois: new Map(base.pois),
    dataVersion: base.dataVersion,
  };

  for (const mod of mods) {
    for (const [category, files] of Object.entries(mod.files)) {
      for (const [id, payload] of Object.entries(files)) {
        applyCategory(out, category, id, payload);
      }
    }
  }

  return out;
}

function applyCategory(
  data: StaticData,
  category: string,
  id: string,
  payload: unknown
): void {
  switch (category) {
    case "npcs":
      data.npcTemplates.set(id, payload as never);
      break;
    case "items":
      data.items.set(id, payload as never);
      break;
    case "factions":
      data.factions.set(id, payload as never);
      break;
    case "quests":
      data.quests.set(id, payload as never);
      break;
    case "realms":
      data.realms.set(id, payload as never);
      break;
    case "skills":
      data.skills.set(id, payload as never);
      break;
    case "dialogue":
      data.dialogues.set(id, payload as never);
      break;
    case "shops":
      data.shops.set(id, payload as never);
      break;
    case "pois":
      data.pois.set(id, payload as never);
      break;
  }
}

/**
 * Validate mod dependencies are loaded.
 * Returns missing list (empty = OK).
 */
export function validateModDependencies(mods: LoadedMod[]): string[] {
  const ids = new Set(mods.map((m) => m.manifest.id));
  const missing: string[] = [];
  for (const m of mods) {
    for (const dep of m.manifest.dependencies) {
      if (!ids.has(dep)) missing.push(`${m.manifest.id} requires ${dep}`);
    }
  }
  return missing;
}

/**
 * Sort mods by dependency order (topological).
 */
export function topoSortMods(mods: LoadedMod[]): LoadedMod[] {
  const byId = new Map(mods.map((m) => [m.manifest.id, m]));
  const visited = new Set<string>();
  const result: LoadedMod[] = [];

  const visit = (mod: LoadedMod, stack: Set<string>): void => {
    if (visited.has(mod.manifest.id)) return;
    if (stack.has(mod.manifest.id)) return; // cycle, skip
    stack.add(mod.manifest.id);
    for (const dep of mod.manifest.dependencies) {
      const depMod = byId.get(dep);
      if (depMod) visit(depMod, stack);
    }
    stack.delete(mod.manifest.id);
    visited.add(mod.manifest.id);
    result.push(mod);
  };

  for (const m of mods) visit(m, new Set());
  return result;
}

void dirname;