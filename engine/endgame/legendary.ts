/**
 * Endgame — Legendary crafting.
 *
 * Legendary recipes require:
 * - Rare base item
 * - 1+ legendary material from tribulation
 * - Specific realm (>= Kim Dan / tier 4)
 * - High alchemy skill
 *
 * Quality rolls: perfect (1/16) → grants 2x stats
 */

import type { EngineState } from "../types.js";
import type { StaticData } from "../data/loader.js";

export interface LegendaryRecipe {
  id: string;
  name: string;
  description: string;
  baseItem: string;          // item id required
  legendaryMaterials: string[]; // ids required (any 1)
  minRealm: string;          // realm id required
  minAlchemy: number;        // alchemy skill level
  resultItem: string;        // item id granted
  qualityOdds: { perfect: number; good: number; minor: number; failure: number };
}

export const LEGENDARY_RECIPES: LegendaryRecipe[] = [
  {
    id: "than_kim_kiem",
    name: "Thần Kim Kiếm",
    description: "Kiếm rèn từ thiên kim, uy áp vạn cổ.",
    baseItem: "thien_kinh_iron",
    legendaryMaterials: ["cuu_chau_thuy_tinh"],
    minRealm: "kim_dan",
    minAlchemy: 5,
    resultItem: "than_kim_kiem",
    qualityOdds: { perfect: 0.0625, good: 0.25, minor: 0.5, failure: 0.1875 },
  },
  {
    id: "cuu_thu_hoan",
    name: "Cửu Thọ Hoàn",
    description: "Đan được tăng 900 năm tuổi thọ.",
    baseItem: "kim_dan_thien_dia",
    legendaryMaterials: ["nguyet_hoa_tinh_thach"],
    minRealm: "kim_dan",
    minAlchemy: 6,
    resultItem: "cuu_thu_hoan",
    qualityOdds: { perfect: 0.05, good: 0.2, minor: 0.5, failure: 0.25 },
  },
  {
    id: "long_huyet_giap",
    name: "Long Huyết Giáp",
    description: "Giáp từ huyết rồng, phòng ngự cực cao.",
    baseItem: "hoa_long_huyet",
    legendaryMaterials: ["cuu_chau_thuy_tinh", "nguyet_hoa_tinh_thach"],
    minRealm: "nguyen_anh",
    minAlchemy: 7,
    resultItem: "long_huyet_giap",
    qualityOdds: { perfect: 0.04, good: 0.16, minor: 0.5, failure: 0.3 },
  },
];

/**
 * Check if player can attempt this recipe.
 */
export function canCraftLegendary(
  state: EngineState,
  data: StaticData,
  recipe: LegendaryRecipe
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const player = state.player;
  const realmIds = [...data.realms.keys()];
  const realmTier = realmIds.indexOf(player.realm);
  const reqTier = realmIds.indexOf(recipe.minRealm);
  if (realmTier < reqTier) reasons.push(`Cần cảnh giới ${recipe.minRealm} (hiện ${player.realm})`);
  if (!player.inventory.some((it) => it.itemId === recipe.baseItem)) {
    reasons.push(`Thiếu nguyên liệu: ${recipe.baseItem}`);
  }
  const haveMat = recipe.legendaryMaterials.some((m) =>
    player.inventory.some((it) => it.itemId === m)
  );
  if (!haveMat) {
    reasons.push(`Thiếu huyền thoại: ${recipe.legendaryMaterials.join("/")}`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Roll quality. Returns "perfect" | "good" | "minor" | "failure".
 */
export type LegendaryQuality = "perfect" | "good" | "minor" | "failure";

export function rollQuality(
  recipe: LegendaryRecipe,
  rng: { value: number; state: number }
): LegendaryQuality {
  const r = rng.value;
  rng.state = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  rng.value = rng.state / 0x7fffffff;
  const o = recipe.qualityOdds;
  if (r < o.perfect) return "perfect";
  if (r < o.perfect + o.good) return "good";
  if (r < o.perfect + o.good + o.minor) return "minor";
  return "failure";
}

/**
 * Attempt crafting. Consumes materials, grants result if not failure.
 */
export function craftLegendary(
  state: EngineState,
  recipe: LegendaryRecipe,
  rng: { value: number; state: number }
): { quality: LegendaryQuality; resultItem: string | null; consumed: string[] } {
  const consumed: string[] = [];
  // Consume base item
  const baseSlot = state.player.inventory.findIndex((it) => it.itemId === recipe.baseItem);
  if (baseSlot >= 0) {
    state.player.inventory[baseSlot]!.quantity -= 1;
    if (state.player.inventory[baseSlot]!.quantity <= 0) {
      state.player.inventory.splice(baseSlot, 1);
    }
    consumed.push(recipe.baseItem);
  }
  // Consume one legendary material
  for (const m of recipe.legendaryMaterials) {
    const slot = state.player.inventory.findIndex((it) => it.itemId === m);
    if (slot >= 0) {
      state.player.inventory[slot]!.quantity -= 1;
      if (state.player.inventory[slot]!.quantity <= 0) {
        state.player.inventory.splice(slot, 1);
      }
      consumed.push(m);
      break;
    }
  }
  const quality = rollQuality(recipe, rng);
  const resultItem = quality !== "failure" ? recipe.resultItem : null;
  if (resultItem) {
    state.player.inventory.push({ itemId: resultItem, quantity: 1 });
    if (quality === "perfect") {
      // perfect quality → bonus: duplicate item
      state.player.inventory.push({ itemId: resultItem, quantity: 1 });
    }
  }
  return { quality, resultItem, consumed };
}