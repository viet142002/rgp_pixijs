/**
 * Faction war state.
 *
 * FactionA and factionB are at war.
 * Intensity (0-100) affects hostility, encounter rate in contested regions.
 * Casualties tracked per faction.
 */

import type { EngineState, FactionWarState, NPC, EntityId } from "../types.js";
import type { StaticData } from "../data/loader.js";

export interface WarConfig {
  factionA: string;
  factionB: string;
  intensity: number;
  startDay: number;
}

/**
 * Initialize war from config (called on engine init).
 */
export function initFactionWar(state: EngineState, config: WarConfig): void {
  const existing = state.factionWars.find(
    (w) => (w.factionA === config.factionA && w.factionB === config.factionB) ||
           (w.factionA === config.factionB && w.factionB === config.factionA)
  );
  if (existing) return;

  state.factionWars.push({
    factionA: config.factionA,
    factionB: config.factionB,
    intensity: config.intensity,
    startDay: config.startDay,
    casualties: { [config.factionA]: 0, [config.factionB]: 0 },
    active: true,
  });
}

/**
 * Register a casualty in war.
 */
export function recordCasualty(state: EngineState, factionId: string): void {
  for (const war of state.factionWars) {
    if (war.factionA === factionId || war.factionB === factionId) {
      war.casualties[factionId] = (war.casualties[factionId] ?? 0) + 1;
      // Intensity increases with casualties (war escalates)
      war.intensity = Math.min(100, war.intensity + 2);
    }
  }
}

/**
 * Check if two factions are at war.
 */
export function isAtWar(state: EngineState, factionA: string, factionB: string): boolean {
  return state.factionWars.some(
    (w) => w.active &&
      ((w.factionA === factionA && w.factionB === factionB) ||
       (w.factionA === factionB && w.factionB === factionA))
  );
}

/**
 * Get all active wars for a faction.
 */
export function getActiveWars(state: EngineState, factionId: string): FactionWarState[] {
  return state.factionWars.filter(
    (w) => w.active && (w.factionA === factionId || w.factionB === factionId)
  );
}

/**
 * Escalate war intensity (called periodically or on events).
 */
export function escalateWar(state: EngineState, factionA: string, factionB: string, amount: number): void {
  const war = state.factionWars.find(
    (w) => w.active &&
      ((w.factionA === factionA && w.factionB === factionB) ||
       (w.factionA === factionB && w.factionB === factionA))
  );
  if (war) {
    war.intensity = Math.max(0, Math.min(100, war.intensity + amount));
  }
}

/**
 * End a war (e.g., faction destroyed or peace treaty).
 */
export function endWar(state: EngineState, factionA: string, factionB: string): void {
  const war = state.factionWars.find(
    (w) => (w.factionA === factionA && w.factionB === factionB) ||
           (w.factionA === factionB && w.factionB === factionA)
  );
  if (war) war.active = false;
}

/**
 * Decide if NPC auto-attacks another NPC based on war state.
 * Returns true if NPC should attack the target.
 */
export function shouldAutoAttack(
  npc: NPC,
  target: NPC,
  state: EngineState,
  data: StaticData
): boolean {
  // Same faction: no
  if (npc.factionId === target.factionId) return false;

  // At war: yes (if intensity > 30)
  const warIntensity = getWarIntensity(state, npc.factionId, target.factionId);
  if (warIntensity > 30) {
    // War hostility scaled by intensity
    return true;
  }

  // Hostile faction relation (config)
  const factionDef = data.factions.get(npc.factionId);
  if (factionDef?.hostileTo.includes(target.factionId)) {
    return true;
  }

  return false;
}

/**
 * Get war intensity between two factions (0 if not at war).
 */
export function getWarIntensity(state: EngineState, factionA: string, factionB: string): number {
  const war = state.factionWars.find(
    (w) => w.active &&
      ((w.factionA === factionA && w.factionB === factionB) ||
       (w.factionA === factionB && w.factionB === factionA))
  );
  return war?.intensity ?? 0;
}

/**
 * Check if faction has fallen (casualties too high).
 * Threshold: more than half of known members killed.
 */
export function isFactionFallen(
  state: EngineState,
  factionId: string,
  totalMemberCount: number
): boolean {
  const totalCasualties = state.factionWars.reduce(
    (sum, w) => sum + (w.casualties[factionId] ?? 0),
    0
  );
  return totalCasualties > totalMemberCount / 2;
}

/**
 * Process war decay: intensity slowly decreases over time without events.
 */
export function decayWarIntensity(state: EngineState, amount: number = 0.5): void {
  for (const war of state.factionWars) {
    if (war.active) {
      war.intensity = Math.max(0, war.intensity - amount);
      // End war if intensity hits 0
      if (war.intensity === 0) {
        war.active = false;
      }
    }
  }
}

export type { EntityId };
