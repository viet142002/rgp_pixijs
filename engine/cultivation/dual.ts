/**
 * Dual cultivation (song tu) — two cultivators jointly meditate.
 * Faster exp gain, but trust required: partner may betray.
 *
 * Betrayal triggers if:
 *   - partner has grudge > 60 against player
 *   - or random roll (5%)
 */

import type { EngineState, GameEvent, EntityId } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { changeAffinity } from "../relationship/graph.js";

export interface DualCultivationResult {
  expGained: number;
  events: GameEvent[];
  betrayed: boolean;
  message: string;
}

/**
 * Dual-cultivate with an NPC partner for `minutes` game-time.
 * Must be in safe zone, NPC must be alive + in same region.
 */
export function dualCultivate(
  state: EngineState,
  data: StaticData,
  partnerId: EntityId,
  minutes: number = 60,
  rng: { state: number }
): DualCultivationResult {
  const player = state.player;
  const region = data.regions.get(state.currentRegion);
  if (!region?.isSafeZone) {
    return { expGained: 0, events: [], betrayed: false, message: "Cần nơi an toàn để tu luyện" };
  }
  const partner = state.npcs.get(partnerId);
  if (!partner || !partner.alive) {
    return { expGained: 0, events: [], betrayed: false, message: "Đạo lữ không hợp lệ" };
  }

  // Check trust (no grudge > 60)
  const grudgeStrength = partner.grudge
    .filter((g) => g.target === player.id)
    .reduce((s, g) => s + g.strength, 0);
  const trustBlocked = grudgeStrength > 60;

  // Betrayal random (5%) + trust-based
  const betrayalRoll = roll01(rng);
  const betrayed = betrayalRoll <= 0.05 || trustBlocked;

  if (betrayed) {
    changeAffinity(state, player.id, partnerId, "enemy", -50, 1.5);
    return {
      expGained: 0,
      events: [],
      betrayed: true,
      message: trustBlocked
        ? `${partner.name} đã phản bội trong lúc song tu!`
        : `${partner.name} bất ngờ phản bội!`,
    };
  }

  // Success: 3× exp rate vs solo meditation
  const baseGain = 10 * (minutes / 60);
  const layerBonus = player.realmLayer * 4;
  const expGained = Math.floor((baseGain + layerBonus) * 3);

  player.cultivationExp += expGained;
  changeAffinity(state, player.id, partnerId, "lover", 15, 1);
  changeAffinity(state, partnerId, player.id, "lover", 15, 0.5);

  return {
    expGained,
    events: [],
    betrayed: false,
    message: `Song tu với ${partner.name}: +${expGained} tu vi`,
  };
}

function roll01(rng: { state: number }): number {
  const next = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  rng.state = next;
  return (next % 10000) / 10000;
}
