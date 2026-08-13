/**
 * NPC model + factory.
 */

import type {
  NPC, EntityId, Stats, ScheduleEntry, MemoryEntry, Grudge, ElementId,
} from "../types.js";
import type { NPCTemplate, StaticData } from "../data/loader.js";

let npcCounter = 0;

/**
 * Generate unique NPC id from template.
 * e.g. "village_elder" + "_" + counter = "village_elder_0"
 */
export function instantiateNpc(
  templateId: string,
  data: StaticData,
  spawnDay: number,
  instanceIndex: number = 0
): NPC | null {
  const tpl = data.npcTemplates.get(templateId);
  if (!tpl) return null;

  const id: EntityId = instanceIndex === 0 ? templateId : `${templateId}_${instanceIndex}`;
  return materializeNpc(tpl, id, spawnDay);
}

export function materializeNpc(tpl: NPCTemplate, id: EntityId, spawnDay: number): NPC {
  const stats: Stats = { ...tpl.stats };
  return {
    id,
    name: tpl.name,
    gender: tpl.gender,
    realm: tpl.realm,
    stats,
    factionId: tpl.factionId,
    position: { ...tpl.spawnPosition },
    homeRegion: tpl.homeRegion,
    traits: [...tpl.traits],
    states: [],
    schedule: defaultSchedule(tpl.spawnPosition),
    memory: [],
    grudge: [],
    alive: true,
    spawnDay,
    inventory: tpl.inventory ? tpl.inventory.map((i) => ({ itemId: i, quantity: 1 })) : [],
    element: tpl.element,
  };
}

function defaultSchedule(spawnPos: { x: number; y: number }): ScheduleEntry[] {
  return [
    { hour: 6,  location: { x: spawnPos.x + 32, y: spawnPos.y },     action: "stroll" },
    { hour: 12, location: { x: spawnPos.x,      y: spawnPos.y },     action: "eat" },
    { hour: 18, location: { x: spawnPos.x - 32, y: spawnPos.y },     action: "socialize" },
    { hour: 22, location: spawnPos,                                 action: "rest" },
  ];
}

/**
 * Add memory entry. Decay intensity by 5% per day on tick.
 */
export function addMemory(npc: NPC, entry: MemoryEntry): void {
  npc.memory.push(entry);
  // Cap memory at 50 entries
  if (npc.memory.length > 50) {
    npc.memory.shift();
  }
}

/**
 * Decay all memory intensities by 5%. Remove if intensity < 0.05.
 * Called once per game-day.
 */
export function decayMemory(npc: NPC): void {
  for (const m of npc.memory) {
    m.intensity *= 0.95;
  }
  npc.memory = npc.memory.filter((m) => m.intensity >= 0.05);
}

/**
 * Decay all grudge strengths. Remove if strength <= 0.
 */
export function decayGrudge(npc: NPC): void {
  for (const g of npc.grudge) {
    g.strength -= g.decay;
  }
  npc.grudge = npc.grudge.filter((g) => g.strength > 0);
}

/**
 * Add or strengthen a grudge.
 */
export function addGrudge(npc: NPC, grudge: Omit<Grudge, "strength"> & { strength: number }, multiplier: number = 1): void {
  const existing = npc.grudge.find((g) => g.target === grudge.target && g.type === grudge.type);
  if (existing) {
    existing.strength += grudge.strength * multiplier;
    existing.strength = Math.min(100, existing.strength);
  } else {
    npc.grudge.push({ ...grudge, strength: Math.min(100, grudge.strength * multiplier) });
  }
}

/**
 * Get strongest grudge against a target.
 */
export function getGrudgeAgainst(npc: NPC, target: EntityId): number {
  return npc.grudge
    .filter((g) => g.target === target)
    .reduce((sum, g) => sum + g.strength, 0);
}

/**
 * Apply damage. Returns actual damage dealt.
 */
export function applyDamage(npc: NPC, damage: number): number {
  if (!npc.alive) return 0;
  const actual = Math.max(0, Math.min(damage, npc.stats.hp));
  npc.stats.hp -= actual;
  if (npc.stats.hp <= 0) {
    npc.stats.hp = 0;
    npc.alive = false;
  }
  return actual;
}

/**
 * Heal NPC. Returns actual heal.
 */
export function healNpc(npc: NPC, amount: number): number {
  if (!npc.alive) return 0;
  const maxHp = npc.stats.hp + (npc.stats.hp > 0 ? 0 : 0); // we don't store max separately
  // For simplicity, treat current hp as max unless we'd need to track separately
  // In a fuller impl, store maxHp in stats. Here, cap at "reasonable" via max hp from stats:
  // Stats don't have max hp field; we assume current HP can only go up, no cap.
  // Better: track maxHp separately. For MVP, allow heal without cap.
  const actual = Math.max(0, amount);
  npc.stats.hp += actual;
  return actual;
}

/**
 * Auto-increment for unique instance generation.
 */
export function nextInstanceIndex(): number {
  return npcCounter++;
}
