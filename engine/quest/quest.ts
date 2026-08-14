/**
 * Quest system.
 *
 * Quest types:
 * - kill: defeat N of target entity
 * - collect: gather N of item
 * - talk: interact with NPC (auto-completed on dialogue)
 * - deliver: bring item to NPC (auto-completed on item give)
 * - explore: enter a region
 * - survive: survive N days in a region
 *
 * Quests in player.quests record (QuestProgress[]).
 * Objectives advance via engine.completeObjective(...) calls.
 */

import type { EngineState, EntityId, Player } from "../types.js";
import type { StaticData, QuestReward } from "../data/loader.js";

export type ObjectiveType = "kill" | "collect" | "talk" | "deliver" | "explore" | "survive";

export interface QuestObjective {
  type: ObjectiveType;
  target: string;
  quantity: number;
  description: string;
}

// Canonical QuestReward lives in engine/data/loader.ts (matches quest.json schema).
export type { QuestReward } from "../data/loader.js";

export type QuestStatus = "available" | "active" | "completed" | "failed";

export interface QuestProgress {
  questId: string;
  status: QuestStatus;
  objectiveProgress: Record<number, number>;
  acceptedDay: number;
  completedDay?: number;
  objectives?: Array<{
    id: string;
    description: string;
    type: "kill" | "collect" | "talk" | "deliver" | "explore" | "survive";
    target: string;
    current: number;
    count: number;
    completed: boolean;
  }>;
}

/**
 * Check if player meets quest prerequisites.
 */
export function canAcceptQuest(
  player: Player,
  quest: StaticData["quests"] extends Map<string, infer Q> ? Q : never,
  completedQuests: Set<string>
): { canAccept: boolean; reason?: string } {
  if (!quest.prereq) return { canAccept: true };

  if (quest.prereq.factionRepMin) {
    for (const [f, min] of Object.entries(quest.prereq.factionRepMin)) {
      if ((player.factionRep[f] ?? 0) < min) {
        return { canAccept: false, reason: `Cần ${min} uy tín với ${f}` };
      }
    }
  }
  if (quest.prereq.questCompleted) {
    for (const q of quest.prereq.questCompleted) {
      if (!completedQuests.has(q)) {
        return { canAccept: false, reason: `Cần hoàn thành ${q}` };
      }
    }
  }
  return { canAccept: true };
}

/**
 * Accept quest. Adds to player.questProgress if not already active.
 */
export function acceptQuest(
  state: EngineState,
  data: StaticData,
  questId: string
): { accepted: boolean; reason?: string } {
  const def = data.quests.get(questId);
  if (!def) return { accepted: false, reason: "Quest không tồn tại" };

  const completed = new Set(
    state.player.questProgress.filter((q) => q.status === "completed").map((q) => q.questId)
  );
  const check = canAcceptQuest(state.player, def, completed);
  if (!check.canAccept) return { accepted: false, reason: check.reason };

  const existing = state.player.questProgress.find((q) => q.questId === questId);
  if (existing) {
    if (existing.status === "active") return { accepted: false, reason: "Đang làm rồi" };
    if (existing.status === "completed") return { accepted: false, reason: "Đã hoàn thành" };
  }

  state.player.questProgress.push({
    questId,
    status: "active",
    objectiveProgress: {},
    acceptedDay: state.time.day,
  });

  return { accepted: true };
}

/**
 * Complete an objective (advance progress by count). Returns true if all objectives complete.
 */
export function completeObjective(
  state: EngineState,
  data: StaticData,
  questId: string,
  objectiveIdx: number,
  count: number = 1
): boolean {
  const def = data.quests.get(questId);
  if (!def) return false;
  const progress = state.player.questProgress.find((q) => q.questId === questId);
  if (!progress || progress.status !== "active") return false;

  const obj = def.objectives[objectiveIdx];
  if (!obj) return false;

  progress.objectiveProgress[objectiveIdx] =
    (progress.objectiveProgress[objectiveIdx] ?? 0) + count;

  return progress.objectiveProgress[objectiveIdx]! >= obj.quantity;
}

/**
 * Check + apply completion. Awards rewards.
 */
export function completeQuest(
  state: EngineState,
  data: StaticData,
  questId: string
): { completed: boolean; rewards: QuestReward | null } {
  const def = data.quests.get(questId);
  if (!def) return { completed: false, rewards: null };
  const progress = state.player.questProgress.find((q) => q.questId === questId);
  if (!progress || progress.status !== "active") return { completed: false, rewards: null };

  // Verify all objectives met
  let allDone = true;
  for (let i = 0; i < def.objectives.length; i++) {
    const obj = def.objectives[i]!;
    const cur = progress.objectiveProgress[i] ?? 0;
    if (cur < obj.quantity) { allDone = false; break; }
  }
  if (!allDone) return { completed: false, rewards: null };

  // Apply rewards
  applyRewards(state, def.rewards);

  progress.status = "completed";
  progress.completedDay = state.time.day;
  return { completed: true, rewards: def.rewards };
}

/**
 * Abandon / fail quest.
 */
export function abandonQuest(state: EngineState, questId: string): boolean {
  const progress = state.player.questProgress.find((q) => q.questId === questId);
  if (!progress) return false;
  progress.status = "failed";
  return true;
}

/**
 * Apply quest rewards to player state.
 */
export function applyRewards(state: EngineState, rewards: QuestReward): void {
  const p = state.player;
  if (rewards.exp !== undefined) p.cultivationExp += rewards.exp;
  if (rewards.cultivationExp !== undefined) p.cultivationExp += rewards.cultivationExp;
  if (rewards.gold !== undefined) p.gold += rewards.gold;
  if (rewards.items) {
    for (const it of rewards.items) {
      const def = (state as unknown as { data?: { items?: Map<string, { maxStack?: number }> } }).data;
      const maxStack = def?.items?.get(it.itemId)?.maxStack ?? 99;
      let remaining = it.quantity;
      for (const s of p.inventory) {
        if (s.itemId === it.itemId && s.quantity < maxStack) {
          const add = Math.min(remaining, maxStack - s.quantity);
          s.quantity += add;
          remaining -= add;
          if (remaining <= 0) break;
        }
      }
      if (remaining > 0) {
        p.inventory.push({ itemId: it.itemId, quantity: remaining });
      }
    }
  }
  if (rewards.factionRep) {
    for (const r of rewards.factionRep) {
      p.factionRep[r.factionId] = (p.factionRep[r.factionId] ?? 0) + r.delta;
    }
  }
}

/**
 * Hook called when player kills an NPC. Advances matching "kill" objectives.
 */
export function onNpcKilled(
  state: EngineState,
  data: StaticData,
  npcId: EntityId
): void {
  for (const progress of state.player.questProgress) {
    if (progress.status !== "active") continue;
    const def = data.quests.get(progress.questId);
    if (!def) continue;
    def.objectives.forEach((obj, idx) => {
      if (obj.type === "kill" && obj.target === npcId) {
        completeObjective(state, data, progress.questId, idx, 1);
      }
    });
  }
}

/**
 * Hook called when player collects/gains an item.
 */
export function onItemGained(
  state: EngineState,
  data: StaticData,
  itemId: string,
  quantity: number
): void {
  for (const progress of state.player.questProgress) {
    if (progress.status !== "active") continue;
    const def = data.quests.get(progress.questId);
    if (!def) continue;
    def.objectives.forEach((obj, idx) => {
      if (obj.type === "collect" && obj.target === itemId) {
        completeObjective(state, data, progress.questId, idx, quantity);
      }
      if (obj.type === "deliver" && obj.target === itemId) {
        completeObjective(state, data, progress.questId, idx, quantity);
      }
    });
  }
}

/**
 * Hook called when player enters a region.
 */
export function onRegionEntered(
  state: EngineState,
  data: StaticData,
  regionId: string
): void {
  for (const progress of state.player.questProgress) {
    if (progress.status !== "active") continue;
    const def = data.quests.get(progress.questId);
    if (!def) continue;
    def.objectives.forEach((obj, idx) => {
      if (obj.type === "explore" && obj.target === regionId) {
        completeObjective(state, data, progress.questId, idx, 1);
      }
    });
  }
}
