import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Quest System", () => {
  it("listQuests returns all quest defs", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50001, data });
    const quests = engine.listQuests();
    expect(quests.length).toBeGreaterThan(0);
  });

  it("acceptQuest creates active progress", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50002, data });
    const res = engine.acceptQuest("herb_gathering");
    expect(res.accepted).toBe(true);
    expect(engine.getActiveQuests().length).toBe(1);
    expect(engine.getActiveQuests()[0]!.questId).toBe("herb_gathering");
  });

  it("acceptQuest rejects when prereq not met", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50003, data });
    const res = engine.acceptQuest("sect_recruit_trial");
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain("uy tín");
  });

  it("completeObjective tracks count", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50004, data });
    engine.acceptQuest("herb_gathering");
    engine.advanceQuestObjective("herb_gathering", 0, 2);
    const prog = engine.getActiveQuests()[0]!;
    expect(prog.objectiveProgress[0]).toBe(2);
  });

  it("quest auto-completes when all objectives met + rewards applied", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50005, data });
    engine.acceptQuest("herb_gathering");
    const goldBefore = engine.getPlayer().gold;
    engine.advanceQuestObjective("herb_gathering", 0, 5);
    expect(engine.getActiveQuests().length).toBe(0);
    const completed = engine.getAllQuestProgress().find((q) => q.questId === "herb_gathering");
    expect(completed?.status).toBe("completed");
    expect(engine.getPlayer().gold).toBe(goldBefore + 50);
  });

  it("killing target NPC advances kill objective", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50006, data });
    engine.acceptQuest("demon_scout_patrol");
    // Manually trigger NPC kill (combat test would be overkill)
    engine.triggerOnNpcKilled("demon_scout");
    engine.triggerOnNpcKilled("demon_scout");
    const prog = engine.getActiveQuests()[0];
    expect(prog?.objectiveProgress[0]).toBe(2);
  });

  it("entering region completes explore objective", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50007, data });
    engine.acceptQuest("explore_demon_valley");
    engine.enterRegion("region_demon_valley");
    const prog = engine.getActiveQuests()[0];
    // Quest auto-completes when all objectives done
    const completed = engine.getAllQuestProgress().find((q) => q.questId === "explore_demon_valley");
    expect(completed?.status).toBe("completed");
  });

  it("gathering item advances collect objective", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50008, data });
    engine.acceptQuest("herb_gathering");
    engine.triggerOnItemGained("spirit_herb", 3);
    engine.triggerOnItemGained("spirit_herb", 2);
    const prog = engine.getAllQuestProgress().find((q) => q.questId === "herb_gathering");
    expect(prog?.objectiveProgress[0]).toBe(5);
  });

  it("abandonQuest marks failed", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50009, data });
    engine.acceptQuest("herb_gathering");
    engine.abandonQuest("herb_gathering");
    const prog = engine.getAllQuestProgress().find((q) => q.questId === "herb_gathering");
    expect(prog?.status).toBe("failed");
  });

  it("save/load preserves quest progress", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50010, data });
    engine.acceptQuest("herb_gathering");
    engine.advanceQuestObjective("herb_gathering", 0, 3);
    const save = engine.save();
    const engine2 = createEngine({ seed: 50010, data });
    engine2.load(save);
    const prog = engine2.getAllQuestProgress().find((q) => q.questId === "herb_gathering");
    expect(prog?.objectiveProgress[0]).toBe(3);
  });
});
