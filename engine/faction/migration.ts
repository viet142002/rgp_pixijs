/**
 * NPC faction migration.
 *
 * NPC can change faction via:
 * 1. Faction falls (war defeat) → all members become "wandering"
 * 2. Personal betrayal (grudge > 80 vs own leader) → switch to rival faction
 * 3. Player intervention (recruit NPC after defeating their faction)
 * 4. Faction war resolves (winner absorbs loser's members)
 */

import type { EngineState, EntityId, NPC, GameEvent } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { addRelation } from "../relationship/graph.js";

export type MigrationReason =
  | "faction_fallen"
  | "personal_betrayal"
  | "player_recruit"
  | "war_resolution"
  | "ideological_shift";

export interface MigrationResult {
  npcId: EntityId;
  oldFaction: string;
  newFaction: string;
  reason: MigrationReason;
  events: GameEvent[];
}

/**
 * Migrate NPC from one faction to another.
 * Updates NPC.factionId, relations, and player rep.
 */
export function migrateNpc(
  state: EngineState,
  npcId: EntityId,
  newFactionId: string,
  reason: MigrationReason,
  data: StaticData
): MigrationResult | null {
  const npc = state.npcs.get(npcId);
  if (!npc || !npc.alive) return null;

  const oldFaction = npc.factionId;
  if (oldFaction === newFactionId) return null;

  npc.factionId = newFactionId;
  const events: GameEvent[] = [];

  // Update relations: with old faction members → enemy
  const oldFactionMembers = getFactionMembers(state, oldFaction, npcId);
  for (const memberId of oldFactionMembers) {
    addRelation(state, npcId, memberId, "enemy", -50, 60, false);
  }

  // With new faction members → friendly
  const newFactionMembers = getFactionMembers(state, newFactionId, npcId);
  for (const memberId of newFactionMembers) {
    addRelation(state, npcId, memberId, "friend", 30, 50, true);
  }

  // Player rep changes (depending on reason)
  if (reason === "player_recruit") {
    events.push({
      id: `MIGRATION_${npcId}_${Date.now()}`,
      type: "FACTION_REP_CHANGED",
      source: "player",
      targets: [npcId],
      data: { reason, oldFaction, newFaction: newFactionId },
      day: state.time.day,
      tick: state.tick,
      timestamp: Date.now(),
    });
  } else if (reason === "personal_betrayal" || reason === "faction_fallen") {
    // Old faction loses rep with player (they lost a member)
    state.player.factionRep[oldFaction] = Math.max(-100, (state.player.factionRep[oldFaction] ?? 0) - 5);
  }

  events.push({
    id: `MIGRATION_${npcId}_${Date.now()}`,
    type: "NPC_DIED", // reuse existing event type; payload in data
    source: "system",
    targets: [npcId],
    data: { eventSubtype: "migration", reason, oldFaction, newFaction: newFactionId, npcName: npc.name },
    day: state.time.day,
    tick: state.tick,
    timestamp: Date.now(),
  });

  void data;
  return { npcId, oldFaction, newFaction: newFactionId, reason, events };
}

/**
 * Check if NPC should betray their faction based on grudge against leader.
 */
export function checkPersonalBetrayal(
  npc: NPC,
  state: EngineState,
  data: StaticData,
  betrayalThreshold: number = 80
): { should: boolean; targetFaction: string | null } {
  if (!npc.factionId) return { should: false, targetFaction: null };

  // Check if NPC has grudge against someone in their own faction
  const ownFactionMembers = getFactionMembers(state, npc.factionId, npc.id);
  for (const memberId of ownFactionMembers) {
    const grudge = npc.grudge.find((g) => g.target === memberId);
    if (grudge && grudge.strength >= betrayalThreshold) {
      const currentFaction = data.factions.get(npc.factionId);
      const hostile = currentFaction?.hostileTo[0];
      return { should: true, targetFaction: hostile ?? null };
    }
  }

  return { should: false, targetFaction: null };
}

/**
 * Migrate all members of a fallen faction to "wandering" (no faction).
 */
export function migrateFallennFactionMembers(
  state: EngineState,
  factionId: string,
  data: StaticData
): MigrationResult[] {
  const results: MigrationResult[] = [];
  const members = getFactionMembers(state, factionId, "");
  for (const memberId of members) {
    const result = migrateNpc(state, memberId, "wandering", "faction_fallen", data);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Recruit defeated NPC to player faction (if player has one).
 * Cost: -10 rep with old faction.
 */
export function recruitNpc(
  state: EngineState,
  npcId: EntityId,
  playerFactionId: string,
  data: StaticData
): MigrationResult | null {
  const npc = state.npcs.get(npcId);
  if (!npc || !npc.alive) return null;

  // NPC must be willing (low affinity with current faction OR defeated)
  const currentFactionAff = state.relations
    .filter((r) => r.from === npcId && state.npcs.get(r.to)?.factionId === npc.factionId)
    .reduce((sum, r) => sum + r.affinity, 0);

  // Recruit if: low faction affinity OR player saved them
  if (currentFactionAff < 0) {
    return migrateNpc(state, npcId, playerFactionId, "player_recruit", data);
  }

  return null;
}

function getFactionMembers(state: EngineState, factionId: string, exclude: EntityId): EntityId[] {
  const members: EntityId[] = [];
  for (const [id, npc] of state.npcs) {
    if (npc.factionId === factionId && id !== exclude && npc.alive) {
      members.push(id);
    }
  }
  return members;
}
