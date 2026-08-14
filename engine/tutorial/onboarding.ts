/**
 * Onboarding quest chain — first-hour guided experience.
 *
 * Quests auto-accepted on first tick. Each one teaches a mechanic.
 * Completing the whole chain grants:
 * - +500 exp cultivation
 * - 5x Hồi Xuân Đan
 * - +25 rep với Thanh Vân Tông
 */

import type { EngineState } from "../types.js";
import type { StaticData } from "../data/loader.js";
import type { EntityId } from "../types.js";

/**
 * Idempotent: only adds quests if not already in player's progress.
 */
export function ensureOnboardingQuests(
  state: EngineState,
  data: StaticData,
  playerId: EntityId
): { added: string[] } {
  const existing = new Set(state.player.questProgress.map((p) => p.questId));
  const chain: Array<{
    questId: string;
    title: string;
    objectives: Array<{ id: string; description: string; type: string; target: string; count: number }>;
  }> = [
    {
      questId: "onboard_first_move",
      title: "Khởi hành",
      objectives: [{ id: "o1", description: "Di chuyển 5 bước", type: "explore", target: "any", count: 5 }],
    },
    {
      questId: "onboard_first_combat",
      title: "Tẩy não yêu ma",
      objectives: [{ id: "o1", description: "Đánh bại 1 yêu thú", type: "kill", target: "demon_disciple", count: 1 }],
    },
    {
      questId: "onboard_first_meditate",
      title: "Bước đầu tu luyện",
      objectives: [{ id: "o1", description: "Thiền định 30 phút", type: "survive", target: "tick_30", count: 30 }],
    },
    {
      questId: "onboard_first_dialogue",
      title: "Hỏi đáp",
      objectives: [{ id: "o1", description: "Nói chuyện với Lý Trưởng Lão", type: "talk", target: "village_elder", count: 1 }],
    },
    {
      questId: "onboard_first_faction",
      title: "Tìm đường tu",
      objectives: [{ id: "o1", description: "Đạt 20 rep với Thanh Vân Tông", type: "talk", target: "rep_20_thanh_van", count: 1 }],
    },
  ];

  const added: string[] = [];
  for (const q of chain) {
    if (existing.has(q.questId)) continue;
    const def = data.quests.get(q.questId);
    if (!def) continue; // quest def must exist in static data
    state.player.questProgress.push({
      questId: q.questId,
      status: "active",
      objectiveProgress: {},
      objectives: q.objectives.map((o) => ({
        id: o.id,
        description: o.description,
        type: o.type as "kill" | "collect" | "talk" | "deliver" | "explore" | "survive",
        target: o.target,
        current: 0,
        count: o.count,
        completed: false,
      })),
      acceptedDay: state.time.day,
    });
    added.push(q.questId);
  }

  void playerId;
  return { added };
}

/**
 * Completion bonus for whole onboarding chain.
 */
export const ONBOARDING_BONUS = {
  exp: 500,
  items: ["hoi_xuan_dan"] as const,
  rep: 25,
  faction: "thanh_van_sect",
};