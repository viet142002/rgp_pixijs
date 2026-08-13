import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Static Data Loader", () => {
  it("loads all JSON files", async () => {
    const data = await loadStaticData(DATA_DIR);
    expect(data.traits.size).toBeGreaterThan(0);
    expect(data.skills.size).toBeGreaterThan(0);
    expect(data.elements.size).toBe(7); // 6 + none
    expect(data.statuses.size).toBeGreaterThan(0);
    expect(data.factions.size).toBeGreaterThan(0);
    expect(data.items.size).toBeGreaterThan(0);
    expect(data.npcTemplates.size).toBeGreaterThan(0);
    expect(data.regions.size).toBeGreaterThan(0);
  });

  it("cross-references are valid", async () => {
    // If loading throws, fail
    const data = await loadStaticData(DATA_DIR);
    expect(data.dataVersion).toBeGreaterThan(0);
  });

  it("element matchup is consistent", async () => {
    const data = await loadStaticData(DATA_DIR);
    for (const el of data.elements.keys()) {
      if (el === "none") continue;
      const matchup = data.matchup.get(el);
      expect(matchup).toBeDefined();
      expect(matchup!.weakness).not.toBe(el);
      expect(matchup!.strength).not.toBe(el);
    }
  });
});
