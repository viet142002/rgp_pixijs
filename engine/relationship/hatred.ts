/**
 * Hatred propagation.
 *
 * When a bad event happens (NPC died, attacked, robbed), hatred spreads:
 * 1. Witness scan — NPCs in radius who saw the event
 * 2. Relation cascade — NPCs related to victim
 * 3. Faction cascade — faction members of victim
 *
 * Each receiving NPC gets a grudge against the actor.
 */

import type { EngineState, EntityId, Position, GameEvent, NPC } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { addGrudge, addMemory } from "../npc/model.js";
import { resolveModifiers } from "../traits/resolver.js";
import { getRelationsTo } from "./graph.js";
import { dispatchEvent } from "../events/dispatcher.js";

export interface HatredTrigger {
  actor: EntityId;       // who did the bad thing
  victim: EntityId;      // who got hurt
  type: "killed" | "attacked" | "robbed" | "humiliated";
  position: Position;    // event location
}

const WITNESS_RADIUS = 8 * 32; // 8 tiles * 32px

const BASE_HATRED = {
  killed: 20,
  attacked: 10,
  robbed: 15,
  humiliated: 8,
};

const RELATION_MULT = {
  family: 3.0,
  friend: 2.0,
  lover: 3.0,
  sworn_brother: 2.0,
  master: 2.5,
  disciple: 2.0,
  rival: 0.5,
  enemy: 0.0,
};

const TYPE_MULT = {
  killed: 1.0,
  attacked: 0.5,
  robbed: 0.7,
  humiliated: 0.4,
};

/**
 * Propagate hatred from event.
 * Returns events fired (witnesses, grudge adds).
 */
export function propagateHatred(
  state: EngineState,
  data: StaticData,
  trigger: HatredTrigger
): GameEvent[] {
  const events: GameEvent[] = [];
  const victim = state.npcs.get(trigger.victim);
  if (!victim) return events;

  // 1. Witness scan
  const witnesses = findWitnesses(state, trigger.position, trigger.victim);
  for (const wId of witnesses) {
    const wNpc = state.npcs.get(wId);
    if (!wNpc || !wNpc.alive) continue;
    grantGrudgeFromWitness(state, data, wNpc, trigger, events);
  }

  // 2. Relation cascade (victim's relations → grudge with actor)
  const victimRelations = getRelationsTo(state, victim.id);
  for (const rel of victimRelations) {
    const npcId = rel.from;
    if (npcId === trigger.actor) continue;
    const npc = state.npcs.get(npcId);
    if (!npc || !npc.alive) continue;
    grantGrudgeFromRelation(state, data, npc, victim, trigger, rel.type, events);
  }

  // 3. Faction cascade
  if (victim.factionId) {
    const factionMembers = getFactionMembers(state, victim.factionId, victim.id);
    for (const fmId of factionMembers) {
      const fmNpc = state.npcs.get(fmId);
      if (!fmNpc || !fmNpc.alive) continue;
      // Skip if they already got grudge from witness/relation (same actor, same day)
      if (fmNpc.grudge.some((g) => g.target === trigger.actor)) continue;
      grantGrudgeFromFaction(state, data, fmNpc, victim, trigger, events);
    }
  }

  return events;
}

function findWitnesses(state: EngineState, pos: Position, victim: EntityId): EntityId[] {
  const witnesses: EntityId[] = [];
  for (const [id, npc] of state.npcs) {
    if (!npc.alive) continue;
    if (id === victim) continue;
    const dx = npc.position.x - pos.x;
    const dy = npc.position.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= WITNESS_RADIUS) {
      witnesses.push(id);
    }
  }
  return witnesses;
}

function grantGrudgeFromWitness(
  state: EngineState,
  data: StaticData,
  witness: ReturnType<typeof getNpc>,
  trigger: HatredTrigger,
  events: GameEvent[]
): void {
  const mods = resolveModifiers(witness.traits, witness.states, data);
  const baseHatred = BASE_HATRED[trigger.type];
  const hatred = baseHatred * TYPE_MULT[trigger.type] * mods.totalHatredMultiplier;

  addGrudge(
    witness,
    {
      target: trigger.actor,
      type: trigger.type === "killed" ? "witnessed_death" : "attacked",
      strength: hatred * mods.totalGrudgeStrength,
      decay: 1,
      day: state.time.day,
    },
    1
  );

  addMemory(witness, {
    day: state.time.day,
    type: `witnessed_${trigger.type}`,
    actor: trigger.actor,
    context: `${trigger.victim} bị ${trigger.type === "killed" ? "giết" : trigger.type === "attacked" ? "tấn công" : "cướp"}`,
    intensity: 1.0,
  });

  events.push(
    dispatchEvent({
      type: "HATRED_PROPAGATED",
      source: trigger.actor,
      targets: [witness.id],
      data: { reason: "witness", hatred, victimId: trigger.victim },
      day: state.time.day,
      tick: state.tick,
    }, state.time.day, state.tick)
  );
}

function grantGrudgeFromRelation(
  state: EngineState,
  data: StaticData,
  npc: NPC,
  victim: NPC,
  trigger: HatredTrigger,
  relationType: string,
  events: GameEvent[]
): void {
  const relMult = RELATION_MULT[relationType as keyof typeof RELATION_MULT] ?? 1.0;
  if (relMult === 0) return;

  const mods = resolveModifiers(npc.traits, npc.states, data);
  const baseHatred = BASE_HATRED[trigger.type] * 2; // relation cascade bigger
  const hatred = baseHatred * TYPE_MULT[trigger.type] * relMult * mods.totalHatredMultiplier;

  addGrudge(
    npc,
    {
      target: trigger.actor,
      type: trigger.type === "killed" ? "killed_friend" : "attacked",
      strength: hatred * mods.totalGrudgeStrength,
      decay: 1,
      day: state.time.day,
    },
    1
  );

  addMemory(npc, {
    day: state.time.day,
    type: `relation_${trigger.type}`,
    actor: trigger.actor,
    context: `${victim.name} (${relationType}) bị hại`,
    intensity: 1.0,
  });

  events.push(
    dispatchEvent({
      type: "HATRED_PROPAGATED",
      source: trigger.actor,
      targets: [npc.id],
      data: { reason: "relation", hatred, victimId: victim.id, relationType },
      day: state.time.day,
      tick: state.tick,
    }, state.time.day, state.tick)
  );
}

function grantGrudgeFromFaction(
  state: EngineState,
  data: StaticData,
  npc: NPC,
  victim: NPC,
  trigger: HatredTrigger,
  events: GameEvent[]
): void {
  const mods = resolveModifiers(npc.traits, npc.states, data);
  const factionHatred = 30 * TYPE_MULT[trigger.type] * mods.totalHatredMultiplier;

  // Faction leader gets 2x
  const isLeader = data.factions.get(victim.factionId)?.regions.includes(npc.homeRegion) &&
    npc.traits.includes("PROTECTOR");

  const hatred = isLeader ? factionHatred * 2 : factionHatred;

  addGrudge(
    npc,
    {
      target: trigger.actor,
      type: trigger.type === "killed" ? "killed_friend" : "attacked",
      strength: hatred * mods.totalGrudgeStrength,
      decay: 1,
      day: state.time.day,
    },
    1
  );

  events.push(
    dispatchEvent({
      type: "HATRED_PROPAGATED",
      source: trigger.actor,
      targets: [npc.id],
      data: { reason: "faction", hatred, victimId: victim.id, factionId: victim.factionId },
      day: state.time.day,
      tick: state.tick,
    }, state.time.day, state.tick)
  );
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

function getNpc(state: EngineState, id: EntityId): NPC {
  const n = state.npcs.get(id);
  if (!n) throw new Error(`NPC not found: ${id}`);
  return n;
}
