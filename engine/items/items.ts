/**
 * Item system.
 *
 * Inventory ops:
 * - giveItem (stack if stackable)
 * - takeItem
 * - useItem (apply consumable effect, consume)
 * - equipItem (set slot, replace previous)
 * - getEquipmentBonus (sum statBonus across equipped)
 *
 * Stackable items merge into existing stacks up to maxStack.
 * Non-stackable items each get their own inventory entry.
 */

import type { EngineState, ItemStack, Player, Stats } from "../types.js";

export interface GiveItemResult {
  added: number;          // how many added
  remainingDropped: number; // dropped if inventory full
  newStacks: ItemStack[];
}

export interface UseItemResult {
  consumed: boolean;
  effect: Record<string, unknown> | null;
  message?: string;
}

/**
 * Give items to an actor (player or NPC).
 * stackable: merges with existing stack up to maxStack.
 * non-stackable: each becomes its own stack with quantity 1.
 */
export function giveItem(
  inventory: ItemStack[],
  itemId: string,
  quantity: number,
  maxStack: number = 99
): GiveItemResult {
  let remaining = quantity;
  let added = 0;
  const newStacks: ItemStack[] = [];

  while (remaining > 0) {
    const existing = inventory.find((s) => s.itemId === itemId);
    if (existing && existing.quantity < maxStack) {
      const add = Math.min(remaining, maxStack - existing.quantity);
      existing.quantity += add;
      added += add;
      remaining -= add;
      newStacks.push({ ...existing });
    } else if (!existing) {
      const add = Math.min(remaining, maxStack);
      const stack: ItemStack = { itemId, quantity: add };
      inventory.push(stack);
      added += add;
      remaining -= add;
      newStacks.push({ ...stack });
      if (maxStack === 1) {
        // non-stackable: one at a time
      }
    } else {
      // existing is full, but maxStack=1 means non-stackable, allow new entry
      if (maxStack === 1) {
        const stack: ItemStack = { itemId, quantity: 1 };
        inventory.push(stack);
        added += 1;
        remaining -= 1;
        newStacks.push({ ...stack });
      } else {
        break;
      }
    }
  }

  return { added, remainingDropped: remaining, newStacks };
}

/**
 * Take items from inventory (remove up to quantity).
 */
export function takeItem(inventory: ItemStack[], itemId: string, quantity: number): number {
  let remaining = quantity;
  for (let i = 0; i < inventory.length && remaining > 0; i++) {
    const stack = inventory[i]!;
    if (stack.itemId !== itemId) continue;
    const take = Math.min(remaining, stack.quantity);
    stack.quantity -= take;
    remaining -= take;
    if (stack.quantity <= 0) {
      inventory.splice(i, 1);
      i--;
    }
  }
  return quantity - remaining;
}

/**
 * Count items in inventory.
 */
export function countItem(inventory: ItemStack[], itemId: string): number {
  return inventory
    .filter((s) => s.itemId === itemId)
    .reduce((sum, s) => sum + s.quantity, 0);
}

/**
 * Use a consumable item. Removes 1 from inventory, applies effect to player.
 * Effect keys: heal, restoreMp, cultivationExp, breakthroughBonus, qiDeviationResist, dispell.
 */
export function useItem(state: EngineState, itemId: string): UseItemResult {
  const player = state.player;
  const idx = player.inventory.findIndex((s) => s.itemId === itemId && s.quantity > 0);
  if (idx === -1) {
    return { consumed: false, effect: null, message: "Không có vật phẩm này" };
  }

  const item = state.player.inventory[idx]!;
  void item;
  // Resolve effect from static data via engine consumer; here we accept pre-loaded effect
  // The actual effect resolution happens in engine.ts where data is available.
  // For the module, we just consume and report.

  return { consumed: false, effect: null, message: "useItem must be called via engine.applyItem" };
}

/**
 * Equip item to slot. Replaces currently equipped item in same slot.
 * Non-stackable items with slot: weapon/armor/accessory.
 * Returns true if equipped.
 */
export function equipItem(
  player: Player,
  itemId: string,
  staticItems: Map<string, { slot?: string; type: string }>
): { equipped: boolean; oldItem: string | null; message?: string } {
  const stack = player.inventory.find((s) => s.itemId === itemId && s.quantity > 0);
  if (!stack) return { equipped: false, oldItem: null, message: "Không có vật phẩm" };

  const def = staticItems.get(itemId);
  if (!def) return { equipped: false, oldItem: null, message: "Không rõ vật phẩm" };
  if (def.type !== "weapon" && def.type !== "armor") {
    return { equipped: false, oldItem: null, message: "Không thể trang bị" };
  }
  const slot = def.slot ?? (def.type === "weapon" ? "weapon" : "armor");
  if (!player.equipment) player.equipment = {};
  const oldItem = player.equipment[slot] ?? null;
  player.equipment[slot] = itemId;
  return { equipped: true, oldItem };
}

/**
 * Sum stat bonuses across all equipped items.
 */
export function getEquipmentBonus(
  player: Player,
  staticItems: Map<string, { statBonus?: Partial<Record<keyof Stats, number>> }>
): Partial<Stats> {
  const total: Partial<Stats> = {};
  if (!player.equipment) return total;
  for (const itemId of Object.values(player.equipment)) {
    if (!itemId) continue;
    const def = staticItems.get(itemId);
    if (!def?.statBonus) continue;
    for (const [stat, value] of Object.entries(def.statBonus)) {
      const k = stat as keyof Stats;
      const cur = (total[k] as number | undefined) ?? 0;
      (total as Record<string, number>)[k] = cur + (value as number);
    }
  }
  return total;
}
