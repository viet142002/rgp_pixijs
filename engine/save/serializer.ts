/**
 * Save serializer.
 * Serializes engine state to GameSave, deserializes back.
 * Includes version migration.
 */

import type {
  GameSave, EngineState, Player, NPC, Relation, DelayedEvent,
} from "../types.js";
import { SAVE_SCHEMA_VERSION } from "../types.js";
import { deriveSeed, prngInit, serializeState } from "../seed/prng.js";
import { PLAYER_ID } from "../types.js";

export interface SerializerOptions {
  prngSeed: number;
  dataVersion: number;
  prngState: Record<string, { value: number; state: number }>;
}

export class SaveSerializer {
  constructor(private opts: SerializerOptions) {}

  serialize(state: EngineState): GameSave {
    const npcs: NPC[] = [];
    for (const npc of state.npcs.values()) {
      npcs.push(cloneNpc(npc));
    }

    const player: Player = clonePlayer(state.player);

    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      dataVersion: this.opts.dataVersion,
      prngSeed: this.opts.prngSeed,
      prngState: this.serializePrng(),
      worldTime: { ...state.time },
      currentRegion: state.currentRegion,
      player,
      npcs,
      relations: state.relations.map((r) => ({ ...r })),
      worldEvents: state.events.map((e) => ({ ...e })),
      worldFlags: { ...state.flags },
    };
  }

  deserialize(save: GameSave): EngineState {
    let workingSave = save;

    // Migration chain
    while (workingSave.schemaVersion < SAVE_SCHEMA_VERSION) {
      workingSave = migrateStep(workingSave);
    }

    if (workingSave.schemaVersion > SAVE_SCHEMA_VERSION) {
      throw new Error(
        `Save schema version ${workingSave.schemaVersion} is newer than engine ${SAVE_SCHEMA_VERSION}`
      );
    }

    const npcs = new Map<string, NPC>();
    for (const npc of workingSave.npcs) {
      npcs.set(npc.id, cloneNpc(npc));
    }

    return {
      time: { ...workingSave.worldTime },
      tick: 0,
      currentRegion: workingSave.currentRegion,
      player: clonePlayer(workingSave.player),
      npcs,
      relations: workingSave.relations.map((r) => ({ ...r })),
      events: workingSave.worldEvents.map((e) => ({ ...e })),
      flags: { ...workingSave.worldFlags },
    };
  }

  private serializePrng(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, st] of Object.entries(this.opts.prngState)) {
      result[name] = serializeState(st.state);
    }
    return result;
  }
}

/**
 * Apply one migration step.
 * Each migration transforms save from version N to N+1.
 */
function migrateStep(save: GameSave): GameSave {
  // Schema version 1 (current) — no migrations yet.
  if (save.schemaVersion === 1) {
    // No-op for now; future v1→v2 would go here.
    return save;
  }
  return save;
}

// ============== Clone helpers ==============

function clonePlayer(p: Player): Player {
  return {
    ...p,
    position: { ...p.position },
    stats: { ...p.stats },
    states: p.states.map((s) => ({ ...s })),
    skills: [...p.skills],
    inventory: p.inventory.map((i) => ({ ...i })),
    factionRep: { ...p.factionRep },
    traits: [...p.traits],
  };
}

function cloneNpc(n: NPC): NPC {
  return {
    ...n,
    position: { ...n.position },
    stats: { ...n.stats },
    states: n.states.map((s) => ({ ...s })),
    traits: [...n.traits],
    schedule: n.schedule.map((e) => ({ ...e, location: { ...e.location } })),
    memory: n.memory.map((m) => ({ ...m })),
    grudge: n.grudge.map((g) => ({ ...g })),
    inventory: n.inventory ? n.inventory.map((i) => ({ ...i })) : undefined,
  };
}

// ============== Helper exports ==============

/**
 * Create default player for new game.
 */
export function createDefaultPlayer(): Player {
  return {
    id: PLAYER_ID,
    name: "Vô Danh Tu Sĩ",
    realm: "luyen_khi_1",
    stats: {
      hp: 120,
      mp: 60,
      attack: 12,
      defense: 10,
      speed: 12,
      critRate: 0.05,
      critDamage: 1.5,
      evasion: 0.05,
      accuracy: 0.95,
    },
    position: { x: 256, y: 256 },
    currentRegion: "region_village",
    traits: [],
    states: [],
    skills: ["basic_attack", "defend", "fireball", "wind_blade", "wood_heal"],
    inventory: [
      { itemId: "hp_potion_small", quantity: 3 },
      { itemId: "mp_potion_small", quantity: 2 },
    ],
    gold: 100,
    factionRep: {
      village_council: 0,
      thanh_van_sect: 0,
    },
    element: "fire",
  };
}

/**
 * Initialize PRNG state for a new game.
 */
export function initPrngStates(masterSeed: number): Record<string, { value: number; state: number }> {
  const names = ["world", "ai", "combat", "loot"];
  const result: Record<string, { value: number; state: number }> = {};
  for (const name of names) {
    const seed = deriveSeed(masterSeed, name);
    const state = prngInit(seed);
    result[name] = { value: 0, state };
  }
  return result;
}

// Type exports preserved for downstream use
export type { Relation, DelayedEvent };
