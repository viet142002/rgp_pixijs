/**
 * Alchemy (luyện đan) — crafting consumable dan from materials.
 *
 * Recipe: id, name, resultItem, ingredients (itemId × quantity), furnaceTier req.
 * Quality roll: success / minor / major / failure.
 */

import type { EngineState } from "../types.js";
import type { StaticData } from "../data/loader.js";

export interface Recipe {
  id: string;
  name: string;
  resultItem: string;
  ingredients: { itemId: string; quantity: number }[];
  furnaceTier: 1 | 2 | 3;
  baseQualityChance: number; // 0-1, chance for full success
}

export interface CraftResult {
  success: boolean;
  quality: "perfect" | "good" | "minor" | "failure";
  resultItem: string | null;
  quantity: number;
  message: string;
}

/**
 * Built-in recipes. Could later be loaded from data/recipes.json.
 */
export const BUILTIN_RECIPES: Recipe[] = [
  {
    id: "hp_potion_small_recipe",
    name: "Luyện Khôi Phục Đan (Nhỏ)",
    resultItem: "hp_potion_small",
    ingredients: [{ itemId: "spirit_herb", quantity: 2 }],
    furnaceTier: 1,
    baseQualityChance: 0.7,
  },
  {
    id: "qi_recovery_pill_recipe",
    name: "Luyện Tụ Khí Đan",
    resultItem: "qi_recovery_pill",
    ingredients: [
      { itemId: "spirit_herb", quantity: 3 },
      { itemId: "wood_essence", quantity: 1 },
    ],
    furnaceTier: 2,
    baseQualityChance: 0.55,
  },
  {
    id: "breakthrough_pill_minor_recipe",
    name: "Luyện Phá Cảnh Đan (Hạ)",
    resultItem: "breakthrough_pill_minor",
    ingredients: [
      { itemId: "thousand_year_ginseng", quantity: 1 },
      { itemId: "fire_essence", quantity: 1 },
      { itemId: "water_essence", quantity: 1 },
    ],
    furnaceTier: 3,
    baseQualityChance: 0.3,
  },
  {
    id: "qi_stabilizing_tea_recipe",
    name: "Luyện Tâm Tỏa Trà",
    resultItem: "qi_stabilizing_tea",
    ingredients: [
      { itemId: "spirit_herb", quantity: 5 },
      { itemId: "wood_essence", quantity: 2 },
    ],
    furnaceTier: 2,
    baseQualityChance: 0.6,
  },
];

/**
 * Find recipe by id.
 */
export function getRecipe(id: string): Recipe | undefined {
  return BUILTIN_RECIPES.find((r) => r.id === id);
}

/**
 * Craft an item from a recipe.
 * - consumes ingredients from player inventory
 * - rolls quality (success / minor / major / failure)
 * - gives result item(s)
 */
export function craft(
  state: EngineState,
  recipe: Recipe,
  rng: { state: number }
): CraftResult {
  // Check ingredients
  for (const ing of recipe.ingredients) {
    const have = state.player.inventory
      .filter((s) => s.itemId === ing.itemId)
      .reduce((sum, s) => sum + s.quantity, 0);
    if (have < ing.quantity) {
      return {
        success: false,
        quality: "failure",
        resultItem: null,
        quantity: 0,
        message: `Thiếu nguyên liệu ${ing.itemId} (cần ${ing.quantity}, có ${have})`,
      };
    }
  }

  // Consume ingredients
  for (const ing of recipe.ingredients) {
    let remaining = ing.quantity;
    for (let i = 0; i < state.player.inventory.length && remaining > 0; i++) {
      const stack = state.player.inventory[i]!;
      if (stack.itemId !== ing.itemId) continue;
      const take = Math.min(remaining, stack.quantity);
      stack.quantity -= take;
      remaining -= take;
      if (stack.quantity <= 0) {
        state.player.inventory.splice(i, 1);
        i--;
      }
    }
  }

  // Roll quality
  const roll = roll01(rng);
  let quality: CraftResult["quality"];
  if (roll <= recipe.baseQualityChance * 0.3) quality = "perfect";
  else if (roll <= recipe.baseQualityChance) quality = "good";
  else if (roll <= recipe.baseQualityChance + 0.25) quality = "minor";
  else quality = "failure";

  let qty = 0;
  let resultItem: string | null = null;
  if (quality === "perfect") { qty = 3; resultItem = recipe.resultItem; }
  else if (quality === "good") { qty = 2; resultItem = recipe.resultItem; }
  else if (quality === "minor") { qty = 1; resultItem = recipe.resultItem; }
  else {
    return {
      success: false,
      quality,
      resultItem: null,
      quantity: 0,
      message: `Luyện đan thất bại`,
    };
  }

  // Add to inventory
  for (const stack of state.player.inventory) {
    if (stack.itemId === resultItem) {
      stack.quantity += qty;
      return {
        success: true,
        quality,
        resultItem,
        quantity: qty,
        message: `Luyện thành công (${quality}) × ${qty}`,
      };
    }
  }
  state.player.inventory.push({ itemId: resultItem, quantity: qty });
  return {
    success: true,
    quality,
    resultItem,
    quantity: qty,
    message: `Luyện thành công (${quality}) × ${qty}`,
  };
}

function roll01(rng: { state: number }): number {
  const next = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  rng.state = next;
  return (next % 10000) / 10000;
}
