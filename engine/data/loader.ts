/**
 * Static data loader.
 * Reads JSON files, validates structure, returns typed catalog.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Trait, State, SkillDef, ElementId } from "../types.js";

export interface ElementDef {
  id: ElementId;
  name: string;
  color: string;
}

export interface ElementMatchup {
  weakness: ElementId;
  strength: ElementId;
}

export interface StatusDef {
  id: string;
  name: string;
  duration: number;
  tickEffect: Record<string, unknown>;
  modifier?: Record<string, unknown>;
  dispellable: boolean;
}

export interface RealmDef {
  id: string;
  name: string;
  layers: number;
  baseStats: Record<string, number>;
  statPerLayer: Record<string, number>;
}

export interface FactionDef {
  id: string;
  name: string;
  alignment: "righteous" | "evil" | "neutral";
  hostileTo: string[];
  allyTo: string[];
  regions: string[];
}

export interface ItemDef {
  id: string;
  name: string;
  type: "consumable" | "weapon" | "armor" | "material" | "quest";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  effect?: Record<string, unknown>;
  statBonus?: Record<string, number>;
  value: number;
}

export interface NPCTemplate {
  id: string;
  name: string;
  gender: "Male" | "Female";
  realm: string;
  stats: {
    hp: number; mp: number; attack: number; defense: number; speed: number;
    critRate: number; critDamage: number; evasion: number; accuracy: number;
  };
  traits: string[];
  factionId: string;
  element: ElementId;
  inventory?: string[];
  skills?: string[];
  homeRegion: string;
  spawnPosition: { x: number; y: number };
}

export interface RegionDef {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  encounterRate: number;
  isSafeZone: boolean;
}

export interface StaticData {
  traits: Map<string, Trait>;
  states: Map<string, State>;
  skills: Map<string, SkillDef>;
  elements: Map<ElementId, ElementDef>;
  matchup: Map<ElementId, ElementMatchup>;
  statuses: Map<string, StatusDef>;
  realms: Map<string, RealmDef>;
  factions: Map<string, FactionDef>;
  items: Map<string, ItemDef>;
  npcTemplates: Map<string, NPCTemplate>;
  regions: Map<string, RegionDef>;
  dataVersion: number;
}

/**
 * Load static data from a directory containing JSON files.
 */
export async function loadStaticData(dataDir: string): Promise<StaticData> {
  const [
    traitsRaw,
    statesRaw,
    skillsRaw,
    elementsRaw,
    statusesRaw,
    realmsRaw,
    factionsRaw,
    itemsRaw,
    npcsRaw,
    regionsRaw,
  ] = await Promise.all([
    readJson<{ dataVersion: number; traits: Trait[] }>(join(dataDir, "traits.json")),
    readJson<{ dataVersion: number; states: State[] }>(join(dataDir, "states.json")),
    readJson<{ dataVersion: number; skills: SkillDef[] }>(join(dataDir, "skills.json")),
    readJson<{ dataVersion: number; elements: ElementDef[]; matchup: Record<string, ElementMatchup> }>(join(dataDir, "elements.json")),
    readJson<{ dataVersion: number; statuses: StatusDef[] }>(join(dataDir, "statuses.json")),
    readJson<{ dataVersion: number; realms: RealmDef[] }>(join(dataDir, "realms.json")),
    readJson<{ dataVersion: number; factions: FactionDef[] }>(join(dataDir, "factions.json")),
    readJson<{ dataVersion: number; items: ItemDef[] }>(join(dataDir, "items.json")),
    readJson<{ dataVersion: number; templates: NPCTemplate[] }>(join(dataDir, "npcs.json")),
    readJson<{ dataVersion: number; regions: RegionDef[] }>(join(dataDir, "regions.json")),
  ]);

  // Cross-reference validation
  validateReferences({
    npcTemplates: npcsRaw.templates,
    statuses: statusesRaw.statuses,
    skills: skillsRaw.skills,
    traits: traitsRaw.traits,
    factions: factionsRaw.factions,
    items: itemsRaw.items,
    regions: regionsRaw.regions,
  });

  const traitsMap = new Map<string, Trait>();
  for (const t of traitsRaw.traits) traitsMap.set(t.id, t);

  const statesMap = new Map<string, State>();
  for (const s of statesRaw.states) statesMap.set(s.id, s);

  const skillsMap = new Map<string, SkillDef>();
  for (const s of skillsRaw.skills) skillsMap.set(s.id, s);

  const elementsMap = new Map<ElementId, ElementDef>();
  for (const e of elementsRaw.elements) elementsMap.set(e.id, e);

  const matchupMap = new Map<ElementId, ElementMatchup>();
  for (const [k, v] of Object.entries(elementsRaw.matchup)) {
    matchupMap.set(k as ElementId, v);
  }

  const statusesMap = new Map<string, StatusDef>();
  for (const s of statusesRaw.statuses) statusesMap.set(s.id, s);

  const realmsMap = new Map<string, RealmDef>();
  for (const r of realmsRaw.realms) realmsMap.set(r.id, r);

  const factionsMap = new Map<string, FactionDef>();
  for (const f of factionsRaw.factions) factionsMap.set(f.id, f);

  const itemsMap = new Map<string, ItemDef>();
  for (const i of itemsRaw.items) itemsMap.set(i.id, i);

  const npcTemplatesMap = new Map<string, NPCTemplate>();
  for (const n of npcsRaw.templates) npcTemplatesMap.set(n.id, n);

  const regionsMap = new Map<string, RegionDef>();
  for (const r of regionsRaw.regions) regionsMap.set(r.id, r);

  return {
    traits: traitsMap,
    states: statesMap,
    skills: skillsMap,
    elements: elementsMap,
    matchup: matchupMap,
    statuses: statusesMap,
    realms: realmsMap,
    factions: factionsMap,
    items: itemsMap,
    npcTemplates: npcTemplatesMap,
    regions: regionsMap,
    dataVersion: npcsRaw.dataVersion, // use npcs as reference
  };
}

async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

interface ValidationRefs {
  npcTemplates: NPCTemplate[];
  statuses: StatusDef[];
  skills: SkillDef[];
  traits: Trait[];
  factions: FactionDef[];
  items: ItemDef[];
  regions: RegionDef[];
}

function validateReferences(refs: ValidationRefs): void {
  const traitIds = new Set(refs.traits.map((t) => t.id));
  const statusIds = new Set(refs.statuses.map((s) => s.id));
  const skillIds = new Set(refs.skills.map((s) => s.id));
  const factionIds = new Set(refs.factions.map((f) => f.id));
  const itemIds = new Set(refs.items.map((i) => i.id));
  const regionIds = new Set(refs.regions.map((r) => r.id));

  for (const npc of refs.npcTemplates) {
    for (const t of npc.traits) {
      if (!traitIds.has(t)) throw new Error(`NPC ${npc.id}: unknown trait ${t}`);
    }
    if (!factionIds.has(npc.factionId)) {
      throw new Error(`NPC ${npc.id}: unknown faction ${npc.factionId}`);
    }
    if (!regionIds.has(npc.homeRegion)) {
      throw new Error(`NPC ${npc.id}: unknown region ${npc.homeRegion}`);
    }
    if (npc.skills) {
      for (const s of npc.skills) {
        if (!skillIds.has(s)) throw new Error(`NPC ${npc.id}: unknown skill ${s}`);
      }
    }
    if (npc.inventory) {
      for (const i of npc.inventory) {
        if (!itemIds.has(i)) throw new Error(`NPC ${npc.id}: unknown item ${i}`);
      }
    }
  }

  for (const skill of refs.skills) {
    if (skill.statusEffect && !statusIds.has(skill.statusEffect.type)) {
      throw new Error(`Skill ${skill.id}: unknown status ${skill.statusEffect.type}`);
    }
  }
}
