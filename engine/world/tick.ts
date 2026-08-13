/**
 * World tick — orchestrates the simulation loop.
 *
 * 1 game-second = 1 world tick.
 * AI evaluation every 5 ticks (0.2 Hz per spec).
 */

import type { EngineState, GameEvent, EntityId } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { advanceMinutes, MINUTES_PER_HOUR } from "./time.js";
import { decayGrudge, decayMemory } from "../npc/model.js";
import { evaluateAllNpcs } from "../ai/utility.js";
import { dispatchEvent } from "../events/dispatcher.js";

export interface TickResult {
  events: GameEvent[];
  dayChanged: boolean;
  aiEvaluated: boolean;
}

const AI_EVAL_INTERVAL = 5;
const MINUTES_PER_TICK = 1; // 1 game-minute per tick (configurable)
const DAY_DECAY_INTERVAL = MINUTES_PER_HOUR * 24; // every game-day

/**
 * Run one world tick.
 * Returns events fired this tick.
 */
export function tickWorld(
  state: EngineState,
  data: StaticData,
  rng: { value: number; state: number }
): TickResult {
  const events: GameEvent[] = [];
  const beforeDay = state.time.day;
  const result = advanceMinutes(state.time, MINUTES_PER_TICK);
  const dayChanged = result.dayChanged;

  // Daily decay (memory + grudge)
  if (dayChanged) {
    for (const npc of state.npcs.values()) {
      decayMemory(npc);
      decayGrudge(npc);
    }
    void DAY_DECAY_INTERVAL;
    events.push({
      id: `day_${state.time.day}`,
      type: "DAY_CHANGED",
      source: "system",
      targets: [],
      data: { day: state.time.day },
      day: state.time.day,
      tick: state.tick,
      timestamp: Date.now(),
    });
  }

  // AI evaluation (every N ticks)
  const aiEvaluated = state.tick % AI_EVAL_INTERVAL === 0;
  if (aiEvaluated) {
    const aiEvents = evaluateAllNpcs(state, data, rng);
    events.push(...aiEvents);
  }

  state.tick++;
  return { events, dayChanged, aiEvaluated };
}

/**
 * Check encounter — given player position + region encounter rate.
 */
export function checkEncounter(
  encounterRate: number,
  rng: { value: number; state: number }
): boolean {
  if (encounterRate <= 0) return false;
  return rng.value < encounterRate;
}

/**
 * Move NPC toward target position (one step).
 * Used by AI for pathfinding-lite movement.
 */
export function moveToward(
  current: { x: number; y: number },
  target: { x: number; y: number },
  stepSize: number = 16
): { x: number; y: number } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= stepSize) return { ...target };
  return {
    x: current.x + (dx / dist) * stepSize,
    y: current.y + (dy / dist) * stepSize,
  };
}

/**
 * Find nearest NPC to a position (Euclidean distance).
 */
export function findNearestNpc(
  state: EngineState,
  pos: { x: number; y: number },
  filter?: (id: EntityId, npc: ReturnType<typeof getNpc>) => boolean
): { id: EntityId; npc: ReturnType<typeof getNpc>; distance: number } | null {
  function getNpc(id: EntityId) {
    return state.npcs.get(id)!;
  }
  let best: { id: EntityId; npc: ReturnType<typeof getNpc>; distance: number } | null = null;
  for (const [id, npc] of state.npcs) {
    if (!npc.alive) continue;
    if (filter && !filter(id, npc)) continue;
    const dx = npc.position.x - pos.x;
    const dy = npc.position.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!best || dist < best.distance) {
      best = { id, npc, distance: dist };
    }
  }
  return best;
}

void dispatchEvent;
