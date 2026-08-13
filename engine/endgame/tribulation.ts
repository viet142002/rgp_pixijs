/**
 * Endgame — Tribulation (thiên kiếp) + Ascension.
 *
 * At Nguyên Anh realm and beyond, player must survive 9 tribulation waves
 * to ascend to higher tier. Each wave:
 *  - Element themed
 *  - Summons heavenly tribulation lightning (high damage)
 *  - May drop legendary crafting materials
 *
 * Victory → ascension + title + legendary skill.
 */

import type { EngineState, GameEvent } from "../types.js";
import type { StaticData } from "../data/loader.js";

export type TribulationElement = "fire" | "water" | "wood" | "metal" | "earth" | "lightning" | "wind";

export interface TribulationWave {
  index: number;          // 1..9
  element: TribulationElement;
  damage: number;         // base damage dealt
  dodgeChance: number;    // 0..1
  bonusItem: string;      // legendary material id
}

export interface TribulationResult {
  wave: number;
  survived: boolean;
  damageDealt: number;
  damageTaken: number;
  rewards: string[];
  ascension: boolean;
}

const TRIBULATION_TIERS: TribulationElement[] = [
  "fire", "water", "wind", "lightning", "earth", "metal", "wood", "lightning", "wind",
];

export const LEGENDARY_MATERIALS = [
  "thien_kinh_iron",
  "cuu_chau_thuy_tinh",
  "kim_dan_thien_dia",
  "nguyet_hoa_tinh_thach",
  "hoa_long_huyet",
] as const;

/**
 * Get realm tier by realm id (luyen_khi=0, truc_co=1, kim_dan=2, ...).
 * Fallback: index in realm list.
 */
function getRealmTier(state: EngineState, data: StaticData, realmId: string): number {
  const idx = [...data.realms.keys()].indexOf(realmId);
  return idx >= 0 ? idx : 0;
}

/**
 * Check if player can challenge tribulation.
 * Requires: realm >= kim_dan (tier 2), HP >= 50%, MP >= 30%.
 */
export function canChallengeTribulation(state: EngineState, data: StaticData): boolean {
  const player = state.player;
  const playerTier = getRealmTier(state, data, player.realm);
  const required = data.realms.get("kim_dan");
  const reqTier = required ? [...data.realms.keys()].indexOf("kim_dan") : 0;
  if (playerTier < reqTier) return false;
  if (player.stats.hp < player.stats.maxHp * 0.5) return false;
  if (player.stats.mp < player.stats.maxMp * 0.3) return false;
  return true;
}

/**
 * Generate 9 tribulation waves for current player.
 */
export function generateTribulation(state: EngineState): TribulationWave[] {
  const waves: TribulationWave[] = [];
  const playerAtk = state.player.stats.attack;
  for (let i = 0; i < 9; i++) {
    waves.push({
      index: i + 1,
      element: TRIBULATION_TIERS[i]!,
      damage: 80 + i * 30 + playerAtk * 2,
      dodgeChance: 0.3 - i * 0.02,
      bonusItem: LEGENDARY_MATERIALS[i % LEGENDARY_MATERIALS.length]!,
    });
  }
  return waves;
}

/**
 * Resolve a single tribulation wave. Returns result + rewards.
 * Pure RNG: dodged if rng < dodgeChance.
 */
export function resolveWave(
  wave: TribulationWave,
  rng: { value: number; state: number }
): { survived: boolean; damageTaken: number; reward: string | null } {
  // Use rng.state to derive dodge — deterministic per state value
  rng.state = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  const roll = rng.state / 0x7fffffff;
  rng.value = roll;
  const dodged = roll < wave.dodgeChance;
  return {
    survived: dodged,
    damageTaken: dodged ? Math.floor(wave.damage * 0.1) : wave.damage,
    reward: dodged ? wave.bonusItem : null,
  };
}

/**
 * Run full tribulation. Returns array of GameEvents with outcomes.
 * If player survives all 9 → ascension granted.
 */
export function runTribulation(
  state: EngineState,
  data: StaticData,
  rng: { value: number; state: number }
): { events: GameEvent[]; result: TribulationResult[]; ascension: boolean } {
  const events: GameEvent[] = [];
  const results: TribulationResult[] = [];
  const waves = generateTribulation(state);
  let totalDmgDealt = 0;
  let totalDmgTaken = 0;
  const rewards: string[] = [];

  for (const wave of waves) {
    const r = resolveWave(wave, rng);
    totalDmgDealt += wave.damage;
    totalDmgTaken += r.damageTaken;
    if (r.reward) rewards.push(r.reward);
    state.player.stats.hp = Math.max(1, state.player.stats.hp - r.damageTaken);
    results.push({
      wave: wave.index,
      survived: r.survived,
      damageDealt: wave.damage,
      damageTaken: r.damageTaken,
      rewards: r.reward ? [r.reward] : [],
      ascension: false,
    });
    events.push({
      id: `TRIBULATION_WAVE_${wave.index}_${Date.now()}`,
      type: "TRIBULATION_WAVE",
      source: "system",
      targets: [state.player.id],
      data: { wave: wave.index, element: wave.element, survived: r.survived, damage: r.damageTaken },
      day: state.time.day,
      tick: state.tick,
      timestamp: Date.now(),
    });
    if (state.player.stats.hp <= 1) {
      events.push({
        id: `TRIBULATION_FAILED_${Date.now()}`,
        type: "TRIBULATION_FAILED",
        source: "system",
        targets: [state.player.id],
        data: { wave: wave.index, reason: "hp_depleted" },
        day: state.time.day,
        tick: state.tick,
        timestamp: Date.now(),
      });
      return { events, result: results, ascension: false };
    }
  }

  // Survived all 9 → ascension
  const ascension = true;
  for (const r of results) r.ascension = true;
  state.player.flags["ascended"] = true;
  state.player.flags["tribulation_completed"] = true;
  // Grant title
  state.player.titles.push("Thiên Kiếp Giác");
  // Legendary skill
  state.player.skills.push("thien_kiem_tuyet_thu");

  events.push({
    id: `ASCENSION_${Date.now()}`,
    type: "ASCENSION",
    source: "system",
    targets: [state.player.id],
    data: { realm: "ascended", title: "Thiên Kiếp Giác", skill: "thien_kiem_tuyet_thu", rewards },
    day: state.time.day,
    tick: state.tick,
    timestamp: Date.now(),
  });

  void data;
  return { events, result: results, ascension };
}

/**
 * Secret bosses — encounterable only at certain conditions.
 * Returns list of boss IDs that player can currently challenge.
 */
export function listAvailableSecretBosses(state: EngineState): string[] {
  const out: string[] = [];
  // Cự Ly Ma Tôn: only at night + demon_sect hostile
  if (state.time.phase === "night" && (state.player.factionRep["demon_sect"] ?? 0) <= -50) {
    out.push("cuu_ly_ma_ton");
  }
  // Thanh Vân Tổ Sư: only with thanh_van_sect rep >= 80
  if ((state.player.factionRep["thanh_van_sect"] ?? 0) >= 80) {
    out.push("thanh_van_to_su");
  }
  // Bát Hoang Cổ Thần: requires ascension
  if (state.player.flags["ascended"]) {
    out.push("bat_hoang_co_than");
  }
  return out;
}