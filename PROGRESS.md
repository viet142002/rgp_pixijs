# Tu Tiên Bát Hoang — Tiến độ phát triển

Engine game nhập vai tu tiên Việt Nam. TypeScript strict + Vitest.

## Tổng quan

- **Tests**: 219/219 passing (23 files)
- **Modules**: 60+ files TypeScript trong `engine/`
- **Data**: JSON trong `data/` + modding qua `data/mods/`
- **Demo**: `engine/demo.ts` 57 sections
- **Persistence**: IndexedDB qua Dexie + SHA-256 checksum + migration chain (v1→v2)

## Phase 1-6: Nền tảng

| Phase | Module | Trạng thái |
|------|--------|-----------|
| 1 | Item + Equipment | done |
| 2 | Cultivation (tu luyện, đột phá, tẩu hỏa) | done |
| 3 | Quest (6 loại mục tiêu + prereq + reward) | done |
| 4 | Dialogue tree (condition + effect) | done |
| 5 | Shop (faction discount + rep-gate) | done |
| 6 | Dual cultivation (song tu + betrayal risk) | done |

## Batch 1: World Foundation

- `engine/world/time.ts` — day/night cycle, 6 phase
- `engine/world/weather.ts` — 6 weather (clear/cloudy/rain/storm/fog/snow)
- `engine/world/terrain.ts` — 10 tile types (grass/forest/water/mountain/road/sand/swamp/cave/ruin/shrine)
- `engine/world/poi.ts` — POI system (shrine/market/dungeon/demon_altar)

## Batch 2: Combat 3v3 + AI + Faction Politics

- `engine/faction/politics.ts` — `FactionStance` 5 loại (aggressive/defensive/neutral/opportunistic/dying)
- `engine/engine.ts` — `buildCombatTeam` 3v3 (1 player + 2 ally vs target + 2 ally)
- `engine/combat/grid.ts` — `calcCover` front/back, `selectTargets` cho 6 range
- `engine/combat/battle.ts` — Fix dead-actor turn advance
- `tests/combat3v3.test.ts` — 15 tests

Stance rules:
- `dying`: 0 member hoặc ≥50% casualties
- `opportunistic`: rep ≥ 50 hoặc evil alignment
- `aggressive`: rep ≤ -50
- mặc định theo alignment

## Batch 3: Tutorial + Modding

### Tutorial
- `engine/tutorial/tutorial.ts` — 9 step Vietnamese triggers (on_start → on_realm_kim_dan)
- `engine/tutorial/onboarding.ts` — quest chain 5 quest hướng dẫn
- Engine hooks: `fireTutorial()` / `completeTutorialStep()` / `skipTutorial()`
- Hooks fire từ: `attackNpc`, `meditate`, `attemptBreakthrough`, `joinFaction`

### Modding
- `engine/modding/loader.ts` — load mods từ `data/mods/`
- API: `loadMods()`, `applyMods()`, `validateModDependencies()`, `topoSortMods()`
- Mod structure: `mod.json` manifest + subfolder per category (npcs/items/factions/...)
- `data/mods/example_giac/` — mod mẫu

## Batch 4: Endgame + Tooling

### Endgame
- `engine/endgame/tribulation.ts` — 9 waves thiên kiếp, ascension → flag `ascended` + title "Thiên Kiếp Giác" + skill "thien_kiem_tuyet_thu"
- `engine/endgame/legendary.ts` — 3 legendary recipe (Thần Kim Kiếm / Cửu Thọ Hoàn / Long Huyết Giáp) với 4-tier quality (perfect/good/minor/failure)
- 5 legendary materials: `thien_kinh_iron`, `cuu_chau_thuy_tinh`, `kim_dan_thien_dia`, `nguyet_hoa_tinh_thach`, `hoa_long_huyet`
- 3 secret bosses: Cự Ly Ma Tôn (night + demon hostile), Thanh Vân Tổ Sư (rep ≥ 80), Bát Hoang Cổ Thần (cần ascension)

### Tooling
- `engine/tooling/inspector.ts` — `inspectPlayer`, `inspectWorld`, `saveSnapshot`, `fullReport`, `serializeForDebug`, `findNearbyNpcs`
- `engine/tooling/scenarios.ts` — 5 scenario:
  - `peaceful_start` — tu luyện yên bình
  - `war_zone` — Thanh Vân vs Ma Tông intensity 75
  - `endgame_demo` — Kim Đan + legendary materials
  - `ascension_attempt` — Nguyên Anh max stats
  - `debug_sandbox` — tất cả flag mở

## Batch 5: Persistence + Migration

### IndexedDB SaveManager (spec/03 E1-E5)
- `engine/persistence/db.ts` — Dexie schema, `MAX_MANUAL_SLOTS=3`, `AUTO_SLOT=1`, composite key `slot:kind`
- `engine/persistence/checksum.ts` — SHA-256 (browser `crypto.subtle` + `node:crypto` fallback)
- `engine/persistence/saveManager.ts` — `SaveManager` class:
  - `save(slot, payload, kind?)` — atomic IDB tx, checksum compute, returns `SaveMeta`
  - `load(slot, kind?)` — read + verify checksum + auto-migrate
  - `list()` — metadata only (no payload)
  - `delete(slot, kind?)` — remove
  - `quotaCheck()` — usage estimate
  - In-memory fallback when IDB unavailable (Node without polyfill)
- `engine/persistence/migration.ts` — `MIGRATIONS` chain + `migrate(payload, target)`

### Schema v2 migration
- `SAVE_SCHEMA_VERSION=2` (types.ts)
- v1→v2: thêm `factionWars` default `[]` khi missing (backward compat)

### Engine integration
- `EngineConfig.saveManager` — optional; nếu null → no-op save
- `EngineConfig.autoSaveEveryTicks` (default 30) + `dirtySaveThreshold` (default 10)
- Hooks (spec E1):
  - `enterRegion` → `maybeSave("area_change")`
  - `attackNpc` → `maybeSave("pre_combat")`
  - `endBattle` → `maybeSave("post_combat")`
  - Social actions (`giveGift`, `robNpc`, `spareNpc`, ...) → `markPlayerAction()`
  - `tickWorld()` auto-save every N ticks via `tickWorld`
- Public fields: `saveManager`, `autoSaveEveryTicks`, `ticksSinceAutoSave`, `actionsSinceDirtySave`, `lastAutoSave`

### Demo end-of-run roundtrip
- Section 57: SaveManager → save snapshot to slot 1 (auto) → reload → verify 6 fields (schemaVersion, realm, region, day, npc count, war count) → list slot metadata

### Test coverage
- `tests/persistence.test.ts` — 12 tests: IDB CRUD, checksum, migration, slot isolation
- `tests/engine-persistence.test.ts` — 6 tests: SaveManager ↔ engine integration
- `tests/save-hooks.test.ts` — 6 tests: enterRegion, attackNpc, maybeSave, markPlayerAction, threshold flush
- `tests/migration.test.ts` — 8 tests: direct migrate + engine roundtrip + newer-schema rejection
- `tests/combat6slot.test.ts` — 22 tests: 6-slot 2-row grid + flanking + cover
- `vitest.config.ts` — `setupFiles: ["./tests/setup.ts"]` (fake-indexeddb/auto)

## Sửa đáng chú ý

1. **maxHp/maxMp**: thêm vào `Stats` interface. Derive từ `hp`/`mp` cho NPC trong `materializeNpc`, init trong `createDefaultPlayer`.
2. **Player.titles + Player.flags**: thêm vào Player interface, init `[]` / `{}`.
3. **EngineState.tutorial**: thêm `{currentIdx, completed, done}` field.
4. **Combat rng bug**: `engine.combatAction` reset prng value, sửa để dùng giá trị mới.
5. **Dead-actor advance**: `resolveAction` giờ gọi `advanceTurn` khi actor chết để skip qua.

## Cấu trúc thư mục

```
rpg_game/
├── data/                  # JSON static data
│   ├── mods/              # user mods
│   ├── factions.json
│   ├── items.json
│   ├── npcs.json
│   ├── quests.json
│   ├── realms.json
│   ├── dialogue.json
│   ├── shops.json
│   └── pois.json
├── engine/
│   ├── ai/                # NPC AI utility
│   ├── combat/            # battle resolution, damage, grid
│   ├── cultivation/       # tu luyện, alchemy, dual
│   ├── data/              # loader
│   ├── economy/           # shop
│   ├── endgame/           # tribulation + legendary
│   ├── events/            # delayed event queue
│   ├── faction/           # politics + reputation + war + migration
│   ├── modding/           # mod loader
│   ├── npc/               # materialize + templates
│   ├── persistence/       # IndexedDB + checksum + migration
│   ├── quest/             # quest system
│   ├── relationship/      # hatred + relations
│   ├── save/              # serializer
│   ├── seed/              # PRNG
│   ├── tooling/           # inspector + scenarios
│   ├── tutorial/          # tutorial + onboarding
│   ├── world/             # time + weather + terrain + POI
│   ├── dialogue/          # dialogue trees
│   ├── engine.ts          # Engine class — main API
│   └── demo.ts            # CLI demo 57 sections
└── tests/                 # 23 test files, 219 tests
```

## Cách dùng

```bash
rtk proxy npm test              # chạy toàn bộ test
rtk proxy npx vitest run tests/combat3v3.test.ts  # chạy 1 file
rtk proxy npx tsx engine/demo.ts # chạy demo
```

Tạo engine:
```ts
import { loadStaticData } from "./engine/data/loader.js";
import { createEngine } from "./engine/engine.js";
import { loadMods, applyMods } from "./engine/modding/loader.js";

const data = await loadStaticData("./data");
const mods = loadMods("./data/mods");
const merged = applyMods(data, topoSortMods(mods));

const engine = createEngine({ seed: 42, data: merged });
engine.attackNpc("wanderer");
```

## Tiếp theo (chưa làm)

- Web UI / TUI binding (PixiJS / React / terminal)
- Localization chuyển sang module (i18n)
- Thêm quest defs cho onboarding chain (đã có code, cần thêm vào `data/quests.json`)
- Nguyên Anh / Hoá Thần / Độ Kiếp realm tier cao hơn
- Multiplayer async (nếu cần)
- Web Worker cho checksum/migration (off main thread)
- Quota UI + save browser warning