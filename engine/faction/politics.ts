/**
 * Faction politics (nâng cao AI).
 *
 * Each faction has a stance: aggressive / defensive / neutral / opportunistic.
 * Stance changes based on:
 * - War casualties
 * - Player reputation changes
 * - NPC betrayal events
 * - Random drift
 *
 * Factions periodically:
 * - propose truce if rep high
 * - recruit wandering NPCs if rep >= 0
 * - expel traitors
 * - opportunistic raid if enemy weak
 */

import type { EngineState, EntityId, GameEvent } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { applyRepChange } from "./reputation.js";

export type FactionStance = "aggressive" | "defensive" | "neutral" | "opportunistic" | "dying";

/**
 * Compute current stance based on war/casualties/politics.
 */
export function computeFactionStance(
  state: EngineState,
  data: StaticData,
  factionId: string
): FactionStance {
  const faction = data.factions.get(factionId);
  if (!faction) return "neutral";

  // Count members
  const members = [...state.npcs.values()].filter((n) => n.alive && n.factionId === factionId);
  if (members.length === 0) return "dying";

  // Count casualties in active wars
  let totalCasualties = 0;
  for (const w of state.factionWars) {
    if (!w.active) continue;
    if (w.factionA === factionId) totalCasualties += w.casualties[factionId] ?? 0;
    if (w.factionB === factionId) totalCasualties += w.casualties[factionId] ?? 0;
  }
  if (totalCasualties >= members.length * 0.5) return "dying";

  // Player rep
  const playerRep = state.player.factionRep[factionId] ?? 0;
  if (playerRep >= 50) return "opportunistic"; // friendly, will help
  if (playerRep <= -50) return "aggressive"; // hostile

  // Default by alignment
  if (faction.alignment === "evil") return "opportunistic";
  if (faction.alignment === "righteous") return "defensive";
  return "neutral";
}

/**
 * Periodic AI evaluation. Apply opportunistic actions per faction.
 * Returns events that occurred.
 */
export function evaluateFactionPolitics(
  state: EngineState,
  data: StaticData,
  rng: { state: number },
  day: number
): GameEvent[] {
  const events: GameEvent[] = [];

  for (const faction of data.factions.values()) {
    const stance = computeFactionStance(state, data, faction.id);
    const members = [...state.npcs.values()].filter((n) => n.alive && n.factionId === faction.id);

    // Dying faction → member migration handled in migration.ts already
    if (stance === "dying" || members.length === 0) continue;

    // Opportunistic: try to recruit wandering NPCs (low chance)
    if (stance === "opportunistic" && faction.alignment !== "evil") {
      const wanderers = [...state.npcs.values()].filter(
        (n) => n.alive && n.factionId === "wandering" && n.homeRegion === faction.regions[0]
      );
      if (wanderers.length > 0 && rng.state % 10 < 2) {
        const target = wanderers[rng.state % wanderers.length]!;
        target.factionId = faction.id;
        events.push({
          id: `FACTION_RECRUIT_${target.id}_${day}`,
          type: "FACTION_REP_CHANGED",
          source: "system",
          targets: [target.id],
          data: { faction: faction.id, action: "auto_recruit", npcName: target.name },
          day, tick: 0, timestamp: Date.now(),
        });
      }
      rng.state = (rng.state * 1103515245 + 12345) & 0x7fffffff;
    }

    // Aggressive: push war intensity higher occasionally
    if (stance === "aggressive") {
      for (const w of state.factionWars) {
        if (!w.active) continue;
        if (w.factionA === faction.id || w.factionB === faction.id) {
          w.intensity = Math.min(100, w.intensity + 1);
        }
      }
    }

    // Defensive: increase player rep passively if friendly
    if (stance === "defensive" && (state.player.factionRep[faction.id] ?? 0) > 0) {
      applyRepChange(state.player, faction.id, 1, `daily_decay_${day}`, "system");
    }
  }

  return events;
}

/**
 * Force stance check — returns all factions' current stance.
 */
export function getAllStances(state: EngineState, data: StaticData): Record<string, FactionStance> {
  const out: Record<string, FactionStance> = {};
  for (const f of data.factions.keys()) {
    out[f] = computeFactionStance(state, data, f);
  }
  return out;
}
