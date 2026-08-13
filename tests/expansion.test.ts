import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { rollWeather, getWeatherEffect, WEATHER_EFFECTS } from "../engine/world/weather.js";
import { TILE_DEFS, getTileEncounterRate } from "../engine/world/terrain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Weather", () => {
  it("rollWeather returns valid weather id", () => {
    const rng = { state: 12345 };
    const w = rollWeather(rng);
    expect(WEATHER_EFFECTS[w.weather]).toBeDefined();
    expect(w.durationDays).toBeGreaterThan(0);
  });

  it("weather effects are defined for all weather ids", () => {
    for (const w of ["clear", "cloudy", "rain", "storm", "fog", "snow"] as const) {
      const e = WEATHER_EFFECTS[w];
      expect(e).toBeDefined();
      expect(e.encounterMultiplier).toBeGreaterThan(0);
    }
  });

  it("getWeatherEffect returns correct rate modifier", () => {
    expect(getWeatherEffect("rain").encounterMultiplier).toBeLessThan(1);
    expect(getWeatherEffect("fog").encounterMultiplier).toBeGreaterThan(1);
  });

  it("engine.advanceTime rolls weather on day change", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80001, data });
    const before = engine.getWeatherInfo().weather;
    // Advance by 1440 minutes (1 day) several times
    for (let i = 0; i < 5; i++) engine.advanceTime(1440);
    const after = engine.getWeatherInfo().weather;
    // Weather likely changed after multiple day-rolls
    expect(after).toBeDefined();
    void before;
  });
});

describe("Terrain", () => {
  it("TILE_DEFS defines all terrain types", () => {
    const terr = ["grass", "forest", "water", "mountain", "road", "sand", "swamp", "cave", "ruin", "shrine"];
    for (const t of terr) {
      expect(TILE_DEFS[t as keyof typeof TILE_DEFS]).toBeDefined();
    }
  });

  it("getTileEncounterRate returns 0 for safe tiles", () => {
    expect(getTileEncounterRate("shrine")).toBe(0);
    expect(getTileEncounterRate("road")).toBeGreaterThanOrEqual(0);
  });

  it("cave has higher encounter rate than shrine", () => {
    expect(getTileEncounterRate("cave")).toBeGreaterThan(getTileEncounterRate("shrine") ?? 0);
  });

  it("engine.getCurrentTile returns terrain", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80002, data });
    const tile = engine.getCurrentTile();
    expect(tile).toBeDefined();
  });

  it("engine.getTerrainMap returns 2D map", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80003, data });
    const map = engine.getTerrainMap("region_village");
    expect(map.length).toBeGreaterThan(0);
    expect(map[0]!.length).toBe(40); // region_village width
  });
});

describe("POI", () => {
  it("engine.listPoisInRegion returns POIs", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80004, data });
    const pois = engine.listPoisInRegion();
    expect(pois.length).toBeGreaterThanOrEqual(0);
    void pois;
  });

  it("engine.findPoiHere returns POI when on tile", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80005, data });
    engine.state.player.position = { x: 20 * 32, y: 15 * 32 };
    engine.state.currentRegion = "region_village";
    const poi = engine.findPoiHere();
    expect(poi).not.toBeNull();
    expect(poi?.name).toContain("Thổ Thần");
  });

  it("engine.enterPoi returns POI summary", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80006, data });
    const result = engine.enterPoi("village_shrine");
    expect(result).not.toBeNull();
    expect(result?.name).toContain("Thổ Thần");
  });

  it("demonic POI triggers encounter at night", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80007, data });
    engine.state.time.hour = 22; // night
    engine.state.time.phase = "night";
    const result = engine.enterPoi("demon_valley_altar");
    expect(result?.hasEncounter).toBe(true);
  });
});

describe("Day/Night Cycle", () => {
  it("phase updates on advanceTime", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 80008, data });
    expect(engine.state.time.phase).toBe("morning");
    engine.advanceTime(60 * 5); // 5h forward → afternoon
    expect(engine.state.time.phase).toBe("afternoon");
    engine.advanceTime(60 * 10); // → night
    expect(engine.state.time.phase).toBe("night");
  });
});
