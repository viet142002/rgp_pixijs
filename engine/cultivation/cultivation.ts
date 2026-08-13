/**
 * Cultivation (tu luyện) system.
 *
 * Player progression:
 * - meditate: gain cultivationExp over time
 * - breakthrough: attempt to advance layer within realm, or realm tier
 * - qi deviation: failure state (tẩu hỏa nhập ma)
 *
 * Realm ladder (from data/realms.json):
 *   luyen_khi (9 layers) → truc_co (3 layers) → kim_dan (3 layers) → ...
 *
 * Each layer costs baseExp * (1 + 0.2*(layer-1)) exp.
 * Each realm "tier breakthrough" (last layer → first layer of next tier)
 *   has higher cost + higher risk.
 */

import type { EngineState, Player, GameEvent } from "../types.js";
import type { StaticData } from "../data/loader.js";

export interface MeditationResult {
  expGained: number;
  events: GameEvent[];
}

export interface BreakthroughAttempt {
  success: boolean;
  newRealm?: string;
  newLayer?: number;
  qiDeviation: boolean;
  expRemaining: number;
  message: string;
}

/**
 * Meditate for a duration. Player must be in safe zone.
 * Returns exp gained. Doesn't auto-trigger breakthrough.
 */
export function meditate(
  state: EngineState,
  data: StaticData,
  minutes: number = 60
): MeditationResult {
  const player = state.player;
  const region = data.regions.get(state.currentRegion);
  if (!region?.isSafeZone) {
    return { expGained: 0, events: [] };
  }
  const realm = data.realms.get(player.realm);
  if (!realm) return { expGained: 0, events: [] };

  // base exp per hour + bonus per layer
  const basePerHour = 10;
  const layerBonus = player.realmLayer * 2;
  const realmBonus = realm.layers >= 9 ? 0 : 10; // higher realms slightly slower
  const expGained = Math.floor(((basePerHour + layerBonus + realmBonus) * minutes) / 60);

  player.cultivationExp += expGained;

  const events: GameEvent[] = [];
  if (expGained > 0) {
    events.push({
      id: `MEDITATE_${Date.now()}`,
      type: "PLAYER_REALM_UP",
      source: player.id,
      targets: [player.id],
      data: { action: "meditate", expGained, totalExp: player.cultivationExp },
      day: state.time.day,
      tick: state.tick,
      timestamp: Date.now(),
    });
  }

  return { expGained, events };
}

/**
 * Exp needed to advance from layer N to layer N+1 within same realm.
 */
export function expToNextLayer(realmLayers: number, currentLayer: number, baseExp: number): number {
  return Math.floor(baseExp * (1 + 0.2 * (currentLayer - 1)));
}

/**
 * Compute the next realm/layer after a successful breakthrough.
 * If at max layer of current realm → advance to next realm tier.
 * Returns null if at end of ladder.
 */
export function nextRealmStep(
  player: Player,
  data: StaticData
): { realm: string; layer: number } | null {
  const realm = data.realms.get(player.realm);
  if (!realm) return null;
  if (player.realmLayer < realm.layers) {
    return { realm: player.realm, layer: player.realmLayer + 1 };
  }
  // last layer, find next realm tier
  const realms = [...data.realms.keys()];
  const idx = realms.indexOf(player.realm);
  if (idx === -1 || idx === realms.length - 1) return null;
  const nextRealmId = realms[idx + 1]!;
  return { realm: nextRealmId, layer: 1 };
}

/**
 * Cost in exp to attempt breakthrough from current state.
 */
export function breakthroughCost(
  player: Player,
  data: StaticData,
  baseExp: number = 100
): { exp: number; isRealmTier: boolean } {
  const realm = data.realms.get(player.realm);
  if (!realm) return { exp: baseExp, isRealmTier: false };
  const isRealmTier = player.realmLayer >= realm.layers;
  const exp = isRealmTier
    ? baseExp * realm.layers * 3 // higher cost for tier break
    : expToNextLayer(realm.layers, player.realmLayer, baseExp);
  return { exp, isRealmTier };
}

/**
 * Attempt breakthrough. Returns result.
 * Success chance = 50 + item bonus - layer risk.
 * Failure: 30% → qi deviation (lose 30% exp + receive penalty state).
 */
export function attemptBreakthrough(
  state: EngineState,
  data: StaticData,
  rng: { state: number }
): BreakthroughAttempt {
  const player = state.player;
  const cost = breakthroughCost(player, data);
  if (player.cultivationExp < cost.exp) {
    return {
      success: false,
      qiDeviation: false,
      expRemaining: player.cultivationExp,
      message: "Tu vi chưa đủ để đột phá",
    };
  }

  // Calculate success chance
  const realm = data.realms.get(player.realm)!;
  const layerRisk = player.realmLayer * 2;
  const tierRisk = cost.isRealmTier ? 15 : 0;
  // Item bonuses
  let itemBonus = 0;
  for (const s of player.states) {
    if (s.id === "breakthrough_bonus" && s.modifiers) {
      itemBonus += 15;
    }
  }
  // Qi stabilizing tea state
  const qiStableState = player.states.find((s) => s.id === "qi_stable");
  const qiDeviationReduce = qiStableState ? 20 : 0;

  const successChance = Math.max(
    5,
    Math.min(95, 50 + itemBonus - layerRisk - tierRisk + 10)
  );
  // 0..100 roll
  const roll = rollD100(rng);
  const success = roll <= successChance;

  // Consume item bonuses
  player.states = player.states.filter((s) => s.id !== "breakthrough_bonus");

  if (success) {
    player.cultivationExp -= cost.exp;
    const next = nextRealmStep(player, data);
    if (!next) {
      return {
        success: true,
        qiDeviation: false,
        expRemaining: player.cultivationExp,
        message: "Đã đạt đỉnh phong, không thể đột phá thêm",
      };
    }
    const oldRealm = player.realm;
    player.realm = next.realm;
    player.realmLayer = next.layer;
    // Stat boost on tier breakthrough
    if (cost.isRealmTier) {
      const newRealm = data.realms.get(next.realm);
      if (newRealm) {
        player.stats.hp = newRealm.baseStats.hp;
        player.stats.mp = newRealm.baseStats.mp;
        player.stats.attack = newRealm.baseStats.attack;
        player.stats.defense = newRealm.baseStats.defense;
        player.stats.speed = newRealm.baseStats.speed;
      }
    }
    return {
      success: true,
      newRealm: player.realm,
      newLayer: player.realmLayer,
      qiDeviation: false,
      expRemaining: player.cultivationExp,
      message: cost.isRealmTier
        ? `Đột phá lên ${data.realms.get(player.realm)?.name ?? player.realm} tầng ${player.realmLayer}`
        : `${data.realms.get(oldRealm)?.name ?? oldRealm} tầng ${player.realmLayer}`,
    };
  }

  // Failure
  // Qi deviation chance
  const deviationRoll = rollD100(rng);
  const deviationChance = Math.max(10, 30 - qiDeviationReduce);
  const qiDeviation = deviationRoll <= deviationChance;

  if (qiDeviation) {
    player.cultivationExp = Math.floor(player.cultivationExp * 0.6);
    player.states.push({
      id: "qi_deviation",
      name: "Tẩu Hỏa Nhập Ma",
      duration: 24 * 60,
      day: state.time.day,
      source: "breakthrough",
      modifiers: {},
    });
    return {
      success: false,
      qiDeviation: true,
      expRemaining: player.cultivationExp,
      message: "Tẩu hỏa nhập ma! Tu vi bị hao tổn",
    };
  }

  return {
    success: false,
    qiDeviation: false,
    expRemaining: player.cultivationExp,
    message: "Đột phá thất bại, nguyên khí chưa đủ",
  };
}

/**
 * D100 roll using provided PRNG state.
 */
function rollD100(rng: { state: number }): number {
  // Simple linear-congruential step (mirrors prng style but standalone)
  const next = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  rng.state = next;
  return (next % 100) + 1;
}
