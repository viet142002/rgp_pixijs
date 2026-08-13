/**
 * Shop + economy system.
 *
 * - Shop inventory per NPC, with stock and rep-gated unlocks
 * - Buy/sell with rep discount
 * - Dynamically priced by item rarity × region
 */

import type { EngineState, Player, EntityId, ItemStack } from "../types.js";
import type { StaticData, ShopDef } from "../data/loader.js";

export interface ShopItem {
  itemId: string;
  stock: number; // -1 = infinite
  minRep?: Record<string, number>;
}

export interface ShopResult {
  success: boolean;
  message: string;
  unitPrice?: number;
  totalPrice?: number;
}

/**
 * Get shop for NPC. Looks up static shop def.
 */
export function getShop(data: StaticData, ownerId: EntityId): ShopDef | null {
  return data.shops.get(ownerId) ?? null;
}

/**
 * List shop inventory. Filters by rep-gated items.
 */
export function listShop(data: StaticData, ownerId: EntityId, player: Player): ShopItem[] {
  const shop = getShop(data, ownerId);
  if (!shop) return [];
  return shop.inventory.filter((it) => {
    if (!it.minRep) return true;
    for (const [f, min] of Object.entries(it.minRep)) {
      if ((player.factionRep[f] ?? 0) < min) return false;
    }
    return true;
  });
}

/**
 * Effective buy price for player. Base = item.value × shop.buyMultiplier.
 * Applies faction discount if player rep with shop's faction.
 */
export function getBuyPrice(
  data: StaticData,
  ownerId: EntityId,
  itemId: string,
  player: Player
): number {
  const item = data.items.get(itemId);
  if (!item) return 0;
  const shop = getShop(data, ownerId);
  const mult = shop?.buyMultiplier ?? 1;
  let price = Math.floor(item.value * mult);

  // Faction discount
  const ownerFaction = data.npcTemplates.get(ownerId)?.factionId;
  if (ownerFaction && shop?.factionDiscount?.[ownerFaction]) {
    const rep = player.factionRep[ownerFaction] ?? 0;
    // Rep 0 = no discount, 100 = full shop.discount
    const discountRate = (shop.factionDiscount[ownerFaction] ?? 0) * (Math.max(0, rep) / 100);
    price = Math.floor(price * (1 - discountRate));
  }
  return Math.max(1, price);
}

/**
 * Effective sell price (player → shop).
 */
export function getSellPrice(
  data: StaticData,
  ownerId: EntityId,
  itemId: string,
  player: Player
): number {
  const item = data.items.get(itemId);
  if (!item) return 0;
  const shop = getShop(data, ownerId);
  const mult = shop?.sellMultiplier ?? 0.4;
  return Math.floor(item.value * mult);
}

/**
 * Buy item from shop.
 */
export function buyItem(
  state: EngineState,
  data: StaticData,
  ownerId: EntityId,
  itemId: string,
  quantity: number = 1
): ShopResult {
  const shop = getShop(data, ownerId);
  if (!shop) return { success: false, message: "Cửa hàng không tồn tại" };

  // Find item in shop inventory
  const shopItem = shop.inventory.find((s) => s.itemId === itemId);
  if (!shopItem) return { success: false, message: "Không bán vật phẩm này" };

  // Check minRep
  if (shopItem.minRep) {
    for (const [f, min] of Object.entries(shopItem.minRep)) {
      if ((state.player.factionRep[f] ?? 0) < min) {
        return { success: false, message: `Cần ${min} uy tín với ${f}` };
      }
    }
  }

  const stock = shopItem.stock;
  if (stock !== -1 && stock < quantity) {
    return { success: false, message: `Chỉ còn ${stock}` };
  }

  const unitPrice = getBuyPrice(data, ownerId, itemId, state.player);
  const totalPrice = unitPrice * quantity;

  if (state.player.gold < totalPrice) {
    return { success: false, message: `Không đủ vàng (cần ${totalPrice}, có ${state.player.gold})` };
  }

  state.player.gold -= totalPrice;

  // Add to inventory (stack with existing if stackable)
  const def = data.items.get(itemId);
  const maxStack = def?.stackable ? (def.maxStack ?? 99) : 1;
  let remaining = quantity;
  for (const s of state.player.inventory) {
    if (s.itemId === itemId && s.quantity < maxStack) {
      const add = Math.min(remaining, maxStack - s.quantity);
      s.quantity += add;
      remaining -= add;
      if (remaining <= 0) break;
    }
  }
  while (remaining > 0) {
    const add = Math.min(remaining, maxStack);
    state.player.inventory.push({ itemId, quantity: add });
    remaining -= add;
  }

  // Decrement shop stock if finite
  if (stock !== -1) {
    shopItem.stock = stock - quantity;
  }

  return {
    success: true,
    message: `Mua ${quantity} × ${def?.name ?? itemId} với giá ${totalPrice} vàng`,
    unitPrice,
    totalPrice,
  };
}

/**
 * Sell item to shop.
 */
export function sellItem(
  state: EngineState,
  data: StaticData,
  ownerId: EntityId,
  itemId: string,
  quantity: number = 1
): ShopResult {
  const shop = getShop(data, ownerId);
  if (!shop) return { success: false, message: "Cửa hàng không tồn tại" };
  const item = data.items.get(itemId);
  if (!item) return { success: false, message: "Không rõ vật phẩm" };
  // Quest items can't be sold
  if (item.type === "quest") {
    return { success: false, message: "Không thể bán vật phẩm nhiệm vụ" };
  }

  // Check inventory has enough
  const have = state.player.inventory
    .filter((s) => s.itemId === itemId)
    .reduce((s, q) => s + q.quantity, 0);
  if (have < quantity) {
    return { success: false, message: `Chỉ có ${have}` };
  }

  const unitPrice = getSellPrice(data, ownerId, itemId, state.player);
  const totalPrice = unitPrice * quantity;

  // Remove from inventory
  let remaining = quantity;
  for (let i = 0; i < state.player.inventory.length && remaining > 0; i++) {
    const s = state.player.inventory[i]!;
    if (s.itemId !== itemId) continue;
    const take = Math.min(remaining, s.quantity);
    s.quantity -= take;
    remaining -= take;
    if (s.quantity <= 0) { state.player.inventory.splice(i, 1); i--; }
  }

  state.player.gold += totalPrice;
  return {
    success: true,
    message: `Bán ${quantity} × ${item.name} được ${totalPrice} vàng`,
    unitPrice,
    totalPrice,
  };
}
