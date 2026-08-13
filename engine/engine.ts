/**
 * Engine orchestrator.
 * Top-level facade tying all systems together.
 */

import type {
  EngineState, GameEvent, EntityId, GameSave, Player, NPC,
} from "./types.js";
import type { StaticData } from "./data/loader.js";
import { prngInit, prngNext, prngInt } from "./seed/prng.js";
import {
  SaveSerializer, createDefaultPlayer, initPrngStates,
} from "./save/serializer.js";
import { tickWorld, checkEncounter } from "./world/tick.js";
import { evaluateNpc } from "./ai/utility.js";
import { instantiateNpc } from "./npc/model.js";
import { advanceMinutes } from "./world/time.js";
import { eventBus, DelayedEventQueue } from "./events/dispatcher.js";
import { propagateHatred } from "./relationship/hatred.js";
import { addRelation, changeAffinity } from "./relationship/graph.js";
import {
  initBattle, resolveAction, type BattleState, type ActionRequest,
} from "./combat/battle.js";

export interface EngineConfig {
  seed: number;
  data: StaticData;
  initialPlayer?: Player;
}

export class Engine {
  state: EngineState;
  data: StaticData;
  seed: number;
  prng: Record<string, { value: number; state: number }>;
  serializer: SaveSerializer;
  battle: BattleState | null = null;
  lastBattleResult: "victory" | "defeat" | "escape" | null = null;
  eventQueue: DelayedEventQueue = new DelayedEventQueue();

  constructor(config: EngineConfig) {
    this.seed = config.seed;
    this.data = config.data;
    this.prng = initPrngStates(config.seed);
    this.serializer = new SaveSerializer({
      prngSeed: config.seed,
      dataVersion: config.data.dataVersion,
      prngState: this.prng,
    });

    const player = config.initialPlayer ?? createDefaultPlayer();

    const npcs = new Map<EntityId, NPC>();
    for (const [tplId, _tpl] of config.data.npcTemplates) {
      const npc = instantiateNpc(tplId, config.data, 0);
      if (npc) npcs.set(npc.id, npc);
    }

    this.state = {
      time: { day: 0, hour: 8, minute: 0 },
      tick: 0,
      currentRegion: player.currentRegion,
      player,
      npcs,
      relations: [],
      events: [],
      flags: {},
    };

    // Initial setup: a few relations to bootstrap social graph
    this.bootstrapRelations();
  }

  private bootstrapRelations(): void {
    const npcList = [...this.state.npcs.values()];
    if (npcList.length < 2) return;

    // Lý Trưởng Lão knows Lý Vệ Sĩ (master/family)
    const elder = this.state.npcs.get("village_elder");
    const guard = this.state.npcs.get("village_guard");
    if (elder && guard) {
      addRelation(this.state, elder.id, guard.id, "master", 60, 80, false);
      addRelation(this.state, elder.id, guard.id, "family", 30, 50, true);
    }
    // Trần Thương Nhân knows Lý Trưởng Lão (friend)
    const merchant = this.state.npcs.get("village_merchant");
    if (merchant && elder) {
      addRelation(this.state, merchant.id, elder.id, "friend", 40, 60, true);
    }
    void npcList;
  }

  // ============== World ==============

  tickWorld(): GameEvent[] {
    const result = tickWorld(this.state, this.data, this.prng.world);
    // Process delayed events
    const due = this.eventQueue.pop(this.state.time.day);
    for (const de of due) {
      eventBus.emit({
        id: de.id,
        type: de.type,
        source: de.source,
        targets: de.targets,
        data: de.data,
        day: this.state.time.day,
        tick: this.state.tick,
        timestamp: Date.now(),
      });
    }
    return result.events;
  }

  checkEncounterAtPlayer(): boolean {
    const region = this.data.regions.get(this.state.currentRegion);
    if (!region) return false;
    return checkEncounter(region.encounterRate, this.prng.world);
  }

  // ============== Player actions ==============

  movePlayer(dx: number, dy: number): void {
    this.state.player.position.x += dx;
    this.state.player.position.y += dy;
  }

  attackNpc(npcId: EntityId): GameEvent[] {
    const events: GameEvent[] = [];
    const npc = this.state.npcs.get(npcId);
    if (!npc || !npc.alive) return events;

    // Trigger combat: player team vs enemy team (just this NPC for MVP)
    const playerCombatant = npcToCombatant(this.state.player, 0, 0, 0);
    const enemyCombatant = npcToCombatant(npc, 1, 0, 0);

    this.battle = initBattle({
      playerTeam: [playerCombatant],
      enemyTeam: [enemyCombatant],
      data: this.data,
      rng: this.prng.combat,
      day: this.state.time.day,
      tick: this.state.tick,
    });

    events.push({
      id: `ENCOUNTER_${Date.now()}`,
      type: "ENCOUNTER_TRIGGERED",
      source: this.state.player.id,
      targets: [npcId],
      data: { reason: "player_attack" },
      day: this.state.time.day,
      tick: this.state.tick,
      timestamp: Date.now(),
    });

    return events;
  }

  // ============== Combat ==============

  combatAction(request: ActionRequest): GameEvent[] {
    if (!this.battle) return [];
    const result = resolveAction(this.battle, request, this.data, this.prng.combat);
    this.prng.combat = { value: result.events[0]?.id ? 0 : 0, state: this.prng.combat.state };
    void result;

    // If battle ended, apply post-combat
    if (this.battle.result) {
      return this.endBattle();
    }
    return [];
  }

  private endBattle(): GameEvent[] {
    if (!this.battle) return [];
    const events: GameEvent[] = [];

    const playerWon = this.battle.result === "victory";
    const enemies = this.battle.combatants.filter((c: import("./types.js").Combatant) => c.team === 1);

    if (playerWon) {
      for (const e of enemies) {
        if (!e.alive) {
          // Sync HP back to NPC (we treat combat HP as direct)
          const npc = this.state.npcs.get(e.id);
          if (npc) {
            npc.stats.hp = 0;
            npc.alive = false;
            // Hatred propagation
            const hatredEvents = propagateHatred(this.state, this.data, {
              actor: this.state.player.id,
              victim: npc.id,
              type: "killed",
              position: npc.position,
            });
            events.push(...hatredEvents);
            // NPC died event
            events.push({
              id: `NPC_DIED_${Date.now()}_${npc.id}`,
              type: "NPC_DIED",
              source: this.state.player.id,
              targets: [npc.id],
              data: { killer: this.state.player.id },
              day: this.state.time.day,
              tick: this.state.tick,
              timestamp: Date.now(),
            });
            // Schedule revenge attack (3 days later)
            this.scheduleRevenge(npc);
          }
        }
      }
    } else if (this.battle.result === "defeat") {
      // Player loses HP, returns to town
      this.state.player.stats.hp = 1;
    } else if (this.battle.result === "escape") {
      // No-op, player escaped
    }

    // Sync player HP back
    const playerCombatant = this.battle.combatants.find((c: import("./types.js").Combatant) => c.team === 0);
    if (playerCombatant) {
      this.state.player.stats.hp = Math.max(1, playerCombatant.stats.hp);
      this.state.player.stats.mp = Math.max(0, playerCombatant.stats.mp);
    }

    this.lastBattleResult = this.battle.result ?? null;
    this.battle = null;
    return events;
  }

  private scheduleRevenge(victim: NPC): void {
    // Find a faction ally of the victim to attack
    for (const [id, npc] of this.state.npcs) {
      if (id === victim.id) continue;
      if (!npc.alive) continue;
      if (npc.factionId !== victim.factionId) continue;
      if (npc.grudge.find((g) => g.target === this.state.player.id)) {
        // Already has grudge, schedule attack
        this.eventQueue.enqueue({
          id: `REVENGE_${Date.now()}_${npc.id}`,
          type: "NPC_ATTACKED",
          source: npc.id,
          targets: [this.state.player.id],
          data: { attackerId: npc.id, victimId: this.state.player.id },
          executeAtDay: this.state.time.day + 3,
        });
        break;
      }
    }
  }

  // ============== Social ==============

  giveGift(targetId: EntityId, value: number): void {
    changeAffinity(this.state, this.state.player.id, targetId, "friend", value * 0.5, 1);
  }

  robNpc(targetId: EntityId): void {
    changeAffinity(this.state, this.state.player.id, targetId, "enemy", -40, 1.5);
  }

  spareNpc(targetId: EntityId): void {
    changeAffinity(this.state, this.state.player.id, targetId, "friend", 20, 1);
  }

  // ============== Save ==============

  save(): GameSave {
    // Sync worldEvents from eventQueue
    this.state.events = this.eventQueue.list();
    return this.serializer.serialize(this.state);
  }

  load(save: GameSave): void {
    this.state = this.serializer.deserialize(save);
    this.eventQueue = new DelayedEventQueue();
    for (const e of this.state.events) {
      this.eventQueue.enqueue(e);
    }
  }

  // ============== Debug helpers ==============

  listNpcs(): NPC[] {
    return [...this.state.npcs.values()];
  }

  getNpc(id: EntityId): NPC | undefined {
    return this.state.npcs.get(id);
  }

  getPlayer(): Player {
    return this.state.player;
  }

  getGrudgesAgainstPlayer(npcId: EntityId): number {
    const npc = this.state.npcs.get(npcId);
    if (!npc) return 0;
    return npc.grudge
      .filter((g) => g.target === this.state.player.id)
      .reduce((s, g) => s + g.strength, 0);
  }

  totalNpcsWithGrudgeOnPlayer(): number {
    let count = 0;
    for (const npc of this.state.npcs.values()) {
      if (npc.grudge.some((g) => g.target === this.state.player.id)) count++;
    }
    return count;
  }
}

// ============== Helpers ==============

function npcToCombatant(
  src: Player | NPC,
  team: number,
  row: 0 | 1,
  col: 0 | 1 | 2
): import("./types.js").Combatant {
  return {
    id: src.id,
    name: src.name,
    side: team === 0 ? "player" : "enemy",
    team,
    row,
    col,
    stats: { ...src.stats },
    element: src.element,
    elementResist: {},
    traits: src.traits,
    states: src.states,
    statuses: [],
    ap: 3,
    maxAp: 3,
    combo: 0,
    alive: true,
  };
}

export function createEngine(config: EngineConfig): Engine {
  return new Engine(config);
}

void prngNext;
void prngInt;
void advanceMinutes;
void evaluateNpc;
void eventBus;
