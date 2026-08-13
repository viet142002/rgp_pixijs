import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import {
  generateTribulation, canChallengeTribulation, resolveWave, runTribulation,
  listAvailableSecretBosses, LEGENDARY_MATERIALS,
} from "../engine/endgame/tribulation.js";
import {
  LEGENDARY_RECIPES, canCraftLegendary, rollQuality, craftLegendary,
} from "../engine/endgame/legendary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Tribulation", () => {
  it("generateTribulation returns 9 waves", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80001, data });
    engine.state.player.stats.attack = 100;
    const waves = generateTribulation(engine.state);
    expect(waves.length).toBe(9);
    expect(waves[0]!.index).toBe(1);
    expect(waves[8]!.index).toBe(9);
  });

  it("canChallengeTribulation returns false below Nguyên Anh", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80002, data });
    expect(canChallengeTribulation(engine.state, data)).toBe(false);
  });

  it("canChallengeTribulation returns true at Kim Đan full HP", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80003, data });
    engine.state.player.realm = "kim_dan";
    engine.state.player.stats.hp = engine.state.player.stats.maxHp;
    engine.state.player.stats.mp = engine.state.player.stats.maxMp;
    expect(canChallengeTribulation(engine.state, data)).toBe(true);
  });

  it("resolveWave returns survived=true with high dodge", () => {
    const wave = { index: 1, element: "fire" as const, damage: 100, dodgeChance: 1.0, bonusItem: "x" };
    const rng = { value: 0.5, state: 12345 };
    const r = resolveWave(wave, rng);
    expect(r.survived).toBe(true);
  });

  it("runTribulation grants ascension flag on full clear", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80004, data });
    engine.state.player.realm = "kim_dan";
    engine.state.player.stats.maxHp = 99999;
    engine.state.player.stats.hp = 99999;
    engine.state.player.stats.maxMp = 99999;
    engine.state.player.stats.mp = 99999;
    const rng = { value: 0, state: 99999 };
    const { ascension } = runTribulation(engine.state, data, rng);
    expect(ascension).toBe(true);
    expect(engine.state.player.flags["ascended"]).toBe(true);
    expect(engine.state.player.titles).toContain("Thiên Kiếp Giác");
  });

  it("runTribulation fails when HP depleted", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80005, data });
    engine.state.player.realm = "kim_dan";
    engine.state.player.stats.maxHp = 100;
    engine.state.player.stats.hp = 100;
    engine.state.player.stats.maxMp = 100;
    engine.state.player.stats.mp = 100;
    const rng = { value: 1.0, state: 1 };
    const { ascension } = runTribulation(engine.state, data, rng);
    expect(ascension).toBe(false);
  });

  it("listAvailableSecretBosses filters by conditions", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80006, data });
    engine.state.time.phase = "night";
    engine.state.player.factionRep["demon_sect"] = -80;
    const bosses = listAvailableSecretBosses(engine.state);
    expect(bosses).toContain("cuu_ly_ma_ton");
    expect(bosses).not.toContain("bat_hoang_co_than"); // not ascended
  });

  it("LEGENDARY_MATERIALS has 5 entries", () => {
    expect(LEGENDARY_MATERIALS.length).toBe(5);
  });
});

describe("Legendary Crafting", () => {
  it("LEGENDARY_RECIPES has 3+ recipes", () => {
    expect(LEGENDARY_RECIPES.length).toBeGreaterThanOrEqual(3);
  });

  it("canCraftLegendary rejects low realm", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80007, data });
    const r = canCraftLegendary(engine.state, data, LEGENDARY_RECIPES[0]!);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("cảnh giới");
  });

  it("canCraftLegendary accepts full setup", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80008, data });
    engine.state.player.realm = "kim_dan";
    engine.state.player.inventory.push(
      { itemId: "thien_kinh_iron", quantity: 1 },
      { itemId: "cuu_chau_thuy_tinh", quantity: 1 },
    );
    const r = canCraftLegendary(engine.state, data, LEGENDARY_RECIPES[0]!);
    expect(r.ok).toBe(true);
  });

  it("rollQuality returns valid value", () => {
    const recipe = LEGENDARY_RECIPES[0]!;
    const rng = { value: 0.01, state: 12345 };
    const q = rollQuality(recipe, rng);
    expect(["perfect", "good", "minor", "failure"]).toContain(q);
  });

  it("craftLegendary consumes materials and grants result", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80009, data });
    engine.state.player.inventory.push(
      { itemId: "thien_kinh_iron", quantity: 2 },
      { itemId: "cuu_chau_thuy_tinh", quantity: 1 },
    );
    const rng = { value: 0.01, state: 99999 };
    const result = craftLegendary(engine.state, LEGENDARY_RECIPES[0]!, rng);
    expect(result.consumed.length).toBe(2);
    expect(["perfect", "good", "minor", "failure"]).toContain(result.quality);
    if (result.quality !== "failure") {
      expect(result.resultItem).toBeTruthy();
    }
  });
});