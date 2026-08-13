# 02 — Kiến trúc hệ thống

## Tổng quan

```
�─────────────────┐
│   React UI      │  HUD, Combat UI, Dialog, Relationship Graph
│   (read-only)   │
└────────┬────────┘
         │ subscribe state
┌────────▼────────┐
│  Game Engine    │  World, Relationship, Behavior, Combat, Event, Save
│  (no React)     │
└────────�────────┘
         │ persist
┌────────▼────────┐
│  IndexedDB      │  Dexie wrapper, save slots, migration
│  (Dexie.js)     │
└─────────────────┘
         ▲ render
┌────────┴────────┐
│  PixiJS         │  Tile map, sprite, animation
└─────────────────┘
```

## Layer boundaries

### React UI
- Chỉ đọc state từ Game Engine.
- Dispatch action (move, attack, dialog choice).
- Không chứa game logic.

### PixiJS Renderer
- Render tile map, sprite, animation.
- Đọc render state t� Game Engine mỗi frame.
- Không xử lý logic.

### Game Engine (pure logic)
- World Engine: tick, time, encounter.
- Relationship Engine: graph, hatred propagation.
- Behavior Engine: NPC AI, action selection.
- Combat Engine: turn-based battle.
- Event Engine: queue, delayed events, listener.
- Save Manager: serialize/deserialize/migrate.

**Engine không biết React tồn tại.** Chạy được trong Node/Web Worker để test.

### Persistence
- IndexedDB qua Dexie.js.
- Schema versioned.
- Migration table.
- Atomic write qua transaction.

## Folder structure

```
src/
├── assets/
│   ├── sprites/         # character, NPC, effect
│   ├── maps/            # Tiled JSON
│   └── ui/              # icons, portraits
│
├── data/                # static data (versioned)
│   ├── traits.json
│   ├── skills.json
│   ├── realms.json
│   ├── factions.json
│   ├── items.json
│   ├── elements.json
│   └── statuses.json
│
├── engine/              # pure logic, no React
│   ├── world/
│   │   ├── tick.ts
│   │   ├── time.ts
│   │   ├── map.ts
│   │   └── encounter.ts
│   ├── npc/
│   │   ├── model.ts
│   │   └── spawn.ts
│   ├── relationship/
│   │   ├── graph.ts
│   │   └── hatred.ts
│   ├── traits/
│   │   └── resolver.ts
│   ├── ai/
│   │   ├── utility.ts
│   │   └── actions.ts
│   ├── combat/
│   │   ├── battle.ts
│   │   ├── grid.ts
│   │   ├── actions.ts
│   │   ├── combo.ts
│   │   └── resolver.ts
│   ├── events/
│   │   ├── queue.ts
│   │   └── dispatcher.ts
│   ├── seed/
│   │   └── prng.ts
│   └── save/
│       ├── serializer.ts
│       └── migration.ts
│
├── persistence/
│   ├── db.ts            # Dexie schema
│   └── saveManager.ts   # CRUD + migration
│
├── store/
│   ├── gameStore.ts     # engine state mirror
│   └── uiStore.ts       # UI-only state (modal, hover)
│
├── ui/
│   ├── hud/
│   ├── combat/
│   ├── dialog/
│   ├── relationship/
│   └── eventLog/
│
├── renderer/
│   └── pixi/
│       ├── scene.ts
│       ├── tileLayer.ts
│       └── sprite.ts
│
└── worker/
    └── engine.worker.ts # optional: chạy engine trong Web Worker
```

## State separation

| Loại state | Owner | Persist? |
|---|---|---|
| Game state | Engine | Yes |
| UI state | React | No |
| Render state | PixiJS | No (derive từ game state) |
| Save metadata | Dexie | Yes |

## Communication

- React ↔ Engine: command pattern (dispatch action).
- Engine ↔ PixiJS: render snapshot mỗi frame.
- Engine modules ↔ nhau: qua Event bus (in-process).

## Worker option

Game Engine có thể chạy trong Web Worker để tránh block UI thread khi:
- World có > 200 NPC
- AI evaluation batch
- Save migration nặng

Trade-off: tăng complexity (postMessage boundary). Bật sau khi benchmark xác nhận cần.
