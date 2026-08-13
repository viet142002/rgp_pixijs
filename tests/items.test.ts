import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Item System", () => {
  it("gives stackable items that merge with existing stacks", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10001, data });
    expect(engine.countItem("hp_potion_small")).toBe(3); // starting inventory
    engine.giveItem("hp_potion_small", 5);
    expect(engine.countItem("hp_potion_small")).toBe(8);
  });

  it("respects maxStack from def", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10002, data });
    // bp_pill minor has maxStack 20
    engine.giveItem("breakthrough_pill_minor", 25);
    const count = engine.countItem("breakthrough_pill_minor");
    // Should cap at one stack of 20
    expect(count).toBe(20);
  });

  it("takeItem removes from inventory", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10003, data });
    engine.takeItem("hp_potion_small", 2);
    expect(engine.countItem("hp_potion_small")).toBe(1);
  });

  it("applyItem applies heal effect and consumes", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10004, data });
    engine.state.player.stats.hp = 30;
    engine.state.player.stats.attack = 200;
    const before = engine.countItem("hp_potion_small");
    const res = engine.applyItem("hp_potion_small");
    expect(res.consumed).toBe(true);
    expect(engine.countItem("hp_potion_small")).toBe(before - 1);
    expect((res.effect?.heal as number)).toBeGreaterThan(0);
    expect(engine.getPlayer().stats.hp).toBeGreaterThan(30);
  });

  it("applyItem applies cultivationExp", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10005, data });
    const before = engine.getPlayer().cultivationExp;
    engine.giveItem("qi_recovery_pill", 3);
    engine.applyItem("qi_recovery_pill");
    expect(engine.getPlayer().cultivationExp).toBe(before + 50);
  });

  it("applyItem rejects non-consumable", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10006, data });
    engine.giveItem("iron_sword", 1);
    const res = engine.applyItem("iron_sword");
    expect(res.consumed).toBe(false);
  });

  it("equipItem sets equipment slot, replaces old", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10007, data });
    engine.giveItem("iron_sword", 1);
    engine.giveItem("jade_blade", 1);
    const r1 = engine.equipItem("iron_sword");
    expect(r1.equipped).toBe(true);
    const r2 = engine.equipItem("jade_blade");
    expect(r2.equipped).toBe(true);
    expect(r2.oldItem).toBe("iron_sword");
    expect(engine.getPlayer().equipment?.weapon).toBe("jade_blade");
  });

  it("equipment stat bonus sums across slots", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10008, data });
    engine.giveItem("jade_blade", 1);
    engine.giveItem("silk_robe", 1);
    engine.equipItem("jade_blade");
    engine.equipItem("silk_robe");
    const bonus = engine.getEquipmentBonus();
    expect(bonus.attack).toBe(18); // jade_blade
    expect(bonus.defense).toBe(12); // silk_robe
    expect(bonus.critRate).toBe(0.05); // jade_blade
  });

  it("save/load preserves inventory + equipment", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10009, data });
    engine.giveItem("spirit_sword", 1);
    engine.equipItem("spirit_sword");
    const save = engine.save();
    const engine2 = createEngine({ seed: 10009, data });
    engine2.load(save);
    expect(engine2.countItem("spirit_sword")).toBe(1);
    expect(engine2.getPlayer().equipment?.weapon).toBe("spirit_sword");
    const bonus = engine2.getEquipmentBonus();
    expect(bonus.attack).toBe(35);
  });

  it("giveItemToNpc adds to NPC inventory", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10010, data });
    // merchant already has 4 starting items from template; verify only the herb addition
    const before = (engine.getNpc("village_merchant")!.inventory ?? [])
      .reduce((s, i) => s + i.quantity, 0);
    const added = engine.giveItemToNpc("village_merchant", "spirit_herb", 5);
    expect(added).toBe(5);
    const npc = engine.getNpc("village_merchant")!;
    const total = (npc.inventory ?? []).reduce((s, i) => s + i.quantity, 0);
    expect(total).toBe(before + 5);
    expect(npc.inventory!.find((s) => s.itemId === "spirit_herb")?.quantity).toBe(5);
  });
});
