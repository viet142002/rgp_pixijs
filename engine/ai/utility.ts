/**
 * Utility AI — score actions, pick best.
 */

import type { EngineState, EntityId, NPC, GameEvent } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { resolveModifiers } from "../traits/resolver.js";
import { getAffinity } from "../relationship/graph.js";

export type AIActionId =
  | "WANDER"
  | "PATROL"
  | "SCHEDULE"
  | "APPROACH"
  | "FLEE"
  | "ATTACK"
  | "DEFEND"
  | "HELP_ALLY"
  | "IDLE";

export interface AIDecision {
  npcId: EntityId;
  action: AIActionId;
  target?: EntityId;
  score: number;
}

export interface AIInput {
  name: string;
  /** Compute 0-1 value from context. */
  compute: (npc: NPC, state: EngineState, data: StaticData) => number;
}

export const AI_INPUTS: Record<string, AIInput> = {
  Aggressive: {
    name: "Aggressive",
    compute: (npc, _state, data) => {
      const mods = resolveModifiers(npc.traits, npc.states, data);
      return clamp01(0.5 + mods.totalAggression);
    },
  },
  Cowardice: {
    name: "Cowardice",
    compute: (npc, _state, data) => {
      const mods = resolveModifiers(npc.traits, npc.states, data);
      return clamp01(mods.totalCowardice);
    },
  },
  Revenge: {
    name: "Revenge",
    compute: (npc, state, _data) => {
      // High if any grudge target nearby
      if (npc.grudge.length === 0) return 0;
      const playerGrudge = npc.grudge.find((g) => g.target === "player");
      if (playerGrudge) return clamp01(playerGrudge.strength / 100);
      // Check nearest hostile
      const maxStrength = npc.grudge.reduce((m, g) => Math.max(m, g.strength), 0);
      return clamp01(maxStrength / 100);
    },
  },
  HealthLow: {
    name: "HealthLow",
    compute: (npc) => {
      // Estimate base max HP from current + memory; use ratio to current
      // Since we don't store max, use heuristic: if HP < 30, consider low
      return npc.stats.hp < 30 ? 1.0 : 0.0;
    },
  },
  AllyNearby: {
    name: "AllyNearby",
    compute: (npc, state, data) => {
      let count = 0;
      for (const [id, other] of state.npcs) {
        if (id === npc.id || !other.alive) continue;
        if (other.factionId !== npc.factionId) continue;
        const dx = other.position.x - npc.position.x;
        const dy = other.position.y - npc.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < 200) count++;
      }
      void data;
      return clamp01(count / 3);
    },
  },
  ThreatNearby: {
    name: "ThreatNearby",
    compute: (npc, state, _data) => {
      const player = state.player;
      const dx = player.position.x - npc.position.x;
      const dy = player.position.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 200) return 0;
      const playerGrudge = npc.grudge.find((g) => g.target === "player");
      if (playerGrudge && playerGrudge.strength > 10) {
        return clamp01(1 - dist / 200);
      }
      return 0;
    },
  },
  PlayerNearby: {
    name: "PlayerNearby",
    compute: (npc, state) => {
      const dx = state.player.position.x - npc.position.x;
      const dy = state.player.position.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 96) return 0; // 3 tiles
      return clamp01(1 - dist / 96);
    },
  },
  Loyalty: {
    name: "Loyalty",
    compute: (npc, _state, data) => {
      const mods = resolveModifiers(npc.traits, npc.states, data);
      return clamp01(mods.totalLoyalty);
    },
  },
};

export interface ActionScore {
  inputs: Record<string, number>; // input name → weight
  bias: number;
  threshold: number;
}

export const ACTION_SCORES: Record<AIActionId, ActionScore> = {
  WANDER: {
    inputs: {},
    bias: 0.1,
    threshold: 0,
  },
  SCHEDULE: {
    inputs: {},
    bias: 0.3,
    threshold: 0,
  },
  APPROACH: {
    inputs: { PlayerNearby: 0.8, Loyalty: 0.5 },
    bias: 0.2,
    threshold: 0.3,
  },
  FLEE: {
    inputs: { Cowardice: 1.2, HealthLow: 1.0 },
    bias: 0.5,
    threshold: 0.4,
  },
  ATTACK: {
    inputs: {
      Aggressive: 1.0,
      Revenge: 0.8,
      AllyNearby: 0.3,
      ThreatNearby: 0.4,
    },
    bias: 0.2,
    threshold: 0.3,
  },
  DEFEND: {
    inputs: { HealthLow: 0.5, Cowardice: 0.3 },
    bias: 0.1,
    threshold: 0.2,
  },
  HELP_ALLY: {
    inputs: { Loyalty: 1.0, AllyNearby: 0.5 },
    bias: 0.2,
    threshold: 0.3,
  },
  PATROL: {
    inputs: {},
    bias: 0.15,
    threshold: 0,
  },
  IDLE: {
    inputs: {},
    bias: 0,
    threshold: -1,
  },
};

/**
 * Evaluate AI for all NPCs in current region.
 * Returns events + decisions.
 */
export function evaluateAllNpcs(
  state: EngineState,
  data: StaticData,
  rng: { value: number; state: number }
): GameEvent[] {
  const decisions: AIDecision[] = [];
  void rng;
  // Sort NPC ids for determinism
  const npcIds = [...state.npcs.keys()].sort();

  for (const id of npcIds) {
    const npc = state.npcs.get(id);
    if (!npc || !npc.alive) continue;
    // Skip NPCs in other regions (sleep optimization)
    if (npc.homeRegion !== state.currentRegion && npc.position.x > 10000) continue;

    const decision = evaluateNpc(npc, state, data);
    decisions.push(decision);
    applyDecision(npc, decision, state);
  }

  // Return any relevant events (placeholder for v1)
  return [];
}

export function evaluateNpc(npc: NPC, state: EngineState, data: StaticData): AIDecision {
  const scores: Record<AIActionId, number> = {} as Record<AIActionId, number>;

  for (const actionId of Object.keys(ACTION_SCORES) as AIActionId[]) {
    const def = ACTION_SCORES[actionId];
    let score = def.bias;
    for (const [inputName, weight] of Object.entries(def.inputs)) {
      const input = AI_INPUTS[inputName];
      if (!input) continue;
      const value = input.compute(npc, state, data);
      score += weight * value;
    }
    scores[actionId] = score;
  }

  // Pick best action (with threshold + tie-break)
  let bestAction: AIActionId = "IDLE";
  let bestScore = -Infinity;
  for (const actionId of Object.keys(scores).sort() as AIActionId[]) {
    const s = scores[actionId];
    const def = ACTION_SCORES[actionId];
    if (s < def.threshold) continue;
    if (s > bestScore) {
      bestScore = s;
      bestAction = actionId;
    }
  }

  return { npcId: npc.id, action: bestAction, score: bestScore };
}

function applyDecision(npc: NPC, decision: AIDecision, state: EngineState): void {
  switch (decision.action) {
    case "SCHEDULE": {
      const entry = npc.schedule.find((e) => e.hour === state.time.hour);
      if (entry) {
        npc.position = { ...entry.location };
      }
      break;
    }
    case "WANDER": {
      // Random small displacement
      npc.position = {
        x: npc.position.x + (Math.random() - 0.5) * 16,
        y: npc.position.y + (Math.random() - 0.5) * 16,
      };
      break;
    }
    case "FLEE":
    case "ATTACK":
    case "DEFEND":
    case "HELP_ALLY":
    case "APPROACH":
    case "PATROL":
    case "IDLE":
      // No-op for now (handled by combat trigger / pathfinding)
      break;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Re-export getAffinity for convenience
export { getAffinity };
