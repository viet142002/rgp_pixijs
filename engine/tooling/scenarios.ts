/**
 * CLI scenario launcher — predefined game starts.
 *
 * Each scenario configures:
 * - seed
 * - player setup (level, realm, gold, items)
 * - initial faction wars
 * - world conditions (weather, time)
 *
 * Usage from CLI:
 *   rtu run scenario <id> [--seed=N]
 */

export interface Scenario {
  id: string;
  name: string;
  description: string;
  defaultSeed: number;
  setup: (engine: import("../engine.js").Engine) => void;
}

export const SCENARIOS: Record<string, Scenario> = {
  peaceful_start: {
    id: "peaceful_start",
    name: "Khởi đầu Hòa Bình",
    description: "Tu luyện yên bình tại làng, không chiến đấu.",
    defaultSeed: 1,
    setup: (engine) => {
      engine.state.player.gold = 100;
      engine.state.player.cultivationExp = 50;
      engine.state.time.weather = "clear";
      engine.state.time.phase = "morning";
    },
  },
  war_zone: {
    id: "war_zone",
    name: "Vùng Chiến",
    description: "Thanh Vân vs Ma Tông leo thang, player bị kẹt giữa.",
    defaultSeed: 2,
    setup: (engine) => {
      engine.state.player.factionRep["thanh_van_sect"] = -20;
      engine.state.player.factionRep["demon_sect"] = -20;
      // Add initial war
      engine.state.factionWars.push({
        id: `war_${Date.now()}`,
        factionA: "thanh_van_sect",
        factionB: "demon_sect",
        intensity: 75,
        startDay: engine.state.time.day,
        active: true,
        casualties: {},
      });
    },
  },
  endgame_demo: {
    id: "endgame_demo",
    name: "Endgame Demo",
    description: "Player Kim Đan đã có legendary materials để thử kiếp.",
    defaultSeed: 3,
    setup: (engine) => {
      engine.state.player.realm = "kim_dan";
      engine.state.player.realmLayer = 3;
      engine.state.player.stats.hp = engine.state.player.stats.maxHp;
      engine.state.player.stats.mp = engine.state.player.stats.maxMp;
      engine.state.player.gold = 9999;
      // Grant some legendary materials
      engine.state.player.inventory.push(
        { itemId: "thien_kinh_iron", quantity: 3 },
        { itemId: "cuu_chau_thuy_tinh", quantity: 2 },
        { itemId: "nguyet_hoa_tinh_thach", quantity: 1 },
        { itemId: "hoa_long_huyet", quantity: 1 },
        { itemId: "kim_dan_thien_dia", quantity: 5 },
      );
    },
  },
  ascension_attempt: {
    id: "ascension_attempt",
    name: "Thử Độ Kiếp",
    description: "Player Nguyên Anh đầy đủ HP/MP để độ kiếp 9 trận.",
    defaultSeed: 4,
    setup: (engine) => {
      engine.state.player.realm = "nguyen_anh";
      engine.state.player.realmLayer = 6;
      engine.state.player.stats.hp = engine.state.player.stats.maxHp;
      engine.state.player.stats.mp = engine.state.player.stats.maxMp;
      engine.state.player.stats.attack = 500;
      engine.state.player.stats.defense = 300;
    },
  },
  debug_sandbox: {
    id: "debug_sandbox",
    name: "Debug Sandbox",
    description: "Tất cả flag mở, dùng để test.",
    defaultSeed: 5,
    setup: (engine) => {
      engine.state.player.gold = 99999;
      engine.state.player.cultivationExp = 999999;
      engine.state.player.stats.hp = engine.state.player.stats.maxHp;
      engine.state.player.stats.mp = engine.state.player.stats.maxMp;
      engine.state.player.flags["ascended"] = true;
      engine.state.player.flags["tribulation_completed"] = true;
      engine.state.player.titles.push("Thiên Kiếp Giác", "Bát Hoang Giác");
    },
  },
};

/**
 * List scenario IDs + names for CLI.
 */
export function listScenarios(): string[] {
  return Object.values(SCENARIOS).map(
    (s) => `  ${s.id.padEnd(20)} ${s.name} — ${s.description}`
  );
}

/**
 * Apply scenario to engine.
 */
export function applyScenario(engine: import("../engine.js").Engine, scenarioId: string): boolean {
  const s = SCENARIOS[scenarioId];
  if (!s) return false;
  s.setup(engine);
  return true;
}