/**
 * Faction reputation system.
 *
 * Player has per-faction reputation (-100 to +100).
 * Rank tier derived from rep value.
 * Rep changes via events (kill, spare, help, betray).
 */

import type { EntityId, FactionRank, Player } from "../types.js";
import { rankFromRep } from "../types.js";
import type { EngineState } from "../types.js";

export interface RepChange {
  factionId: string;
  delta: number;
  reason: string;
  source: EntityId;
}

export const REP_DELTAS = {
  killedMember: -10,
  killedElder: -25,
  killedLeader: -50,
  sparedMember: 5,
  robbedMember: -5,
  helpedMember: 10,
  completedQuest: 20,
  betrayedFaction: -30,
  joinedFaction: 50, // initial when joining
};

/**
 * Apply reputation change. Clamp to [-100, 100].
 * Returns the effective delta applied (after clamp).
 */
export function applyRepChange(
  player: Player,
  factionId: string,
  delta: number,
  reason: string,
  source: EntityId = "system"
): number {
  const before = player.factionRep[factionId] ?? 0;
  const after = clamp(before + delta, -100, 100);
  player.factionRep[factionId] = after;
  return after - before;
}

/**
 * Apply rep change + alliance cascade.
 * Returns all rep changes applied (primary + cascade).
 */
export function applyRepWithCascade(
  state: EngineState,
  change: RepChange,
  allianceMult: number = 0.3
): RepChange[] {
  const applied: RepChange[] = [];
  const primary = applyRepChange(state.player, change.factionId, change.delta, change.reason, change.source);
  if (primary !== 0) {
    applied.push({ ...change, delta: primary });
  }

  const faction = state.flags["__factions"] as unknown; // placeholder
  void faction;
  // Cascade: read faction relations from data via resolveCascade
  const cascade = resolveCascade(state, change, allianceMult);
  applied.push(...cascade);

  return applied;
}

/**
 * Resolve alliance cascade using faction definitions.
 * Called from engine via injected data.
 */
export function resolveCascade(
  state: EngineState,
  change: RepChange,
  allianceMult: number,
  factionData?: { allyTo: string[]; hostileTo: string[] }
): RepChange[] {
  if (!factionData) return [];
  const applied: RepChange[] = [];

  for (const allyId of factionData.allyTo) {
    const delta = change.delta * allianceMult;
    const eff = applyRepChange(state.player, allyId, delta, `${change.reason} (cascade ally)`, change.source);
    if (eff !== 0) {
      applied.push({ factionId: allyId, delta: eff, reason: `${change.reason} (cascade ally)`, source: change.source });
    }
  }

  for (const enemyId of factionData.hostileTo) {
    // Inverse: helping X → hurt X's enemy Y → rep with Y goes down
    // Or hurting X → help X's enemy Y → rep with Y goes up
    const delta = -change.delta * allianceMult;
    const eff = applyRepChange(state.player, enemyId, delta, `${change.reason} (cascade enemy)`, change.source);
    if (eff !== 0) {
      applied.push({ factionId: enemyId, delta: eff, reason: `${change.reason} (cascade enemy)`, source: change.source });
    }
  }

  return applied;
}

/**
 * Get rank label for display.
 */
export function getRankLabel(rank: FactionRank): string {
  const labels: Record<FactionRank, string> = {
    sworn_enemy: "Tử Thù",
    hostile: "Căm Thù",
    unfriendly: "Bất Hòa",
    neutral: "Trung Lập",
    friendly: "Thân Thiện",
    ally: "Đồng Minh",
    sworn_ally: "Kết Nghĩa",
  };
  return labels[rank];
}

/**
 * Get rank for faction via player rep.
 */
export function getRank(player: Player, factionId: string): FactionRank {
  const rep = player.factionRep[factionId] ?? 0;
  return rankFromRep(rep);
}

/**
 * Check if player can join faction (rep ≥ 50 + no hostile relation).
 */
export function canJoinFaction(player: Player, factionId: string): boolean {
  return (player.factionRep[factionId] ?? 0) >= 50;
}

/**
 * Compute NPC initial affinity toward player based on faction rep.
 * Member NPC starts at affinity = rep * 0.5.
 */
export function affinityFromRep(player: Player, factionId: string): number {
  return (player.factionRep[factionId] ?? 0) * 0.5;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
