# Tu Tiên Bát Hoang — Core Engine

Web RPG offline. Core engine only (no UI). Testable via Node/Vitest.

## Quick start

```bash
npm install
npm test           # run all engine tests
npm run demo       # run end-to-end demo
npm run typecheck  # verify types
```

## Architecture

```
engine/
├── seed/         PRNG (Mulberry32 + sub-seed derivation)
├── data/         Static data loader (JSON)
├── world/        Tick loop + world time
├── npc/          NPC model + spawn
├── traits/       Static trait + dynamic state resolver
├── relationship/ Relation graph + hatred propagation
├── ai/           Utility AI evaluation + action selection
├── combat/       Turn-based JRPG (grid, AP, element, status, combo)
├── events/       Pub/sub event bus + delayed events
├── save/         Serializer + migration
└── engine.ts     Top-level orchestrator

data/             Static JSON (traits, skills, elements, ...)
tests/            Vitest test suites
```

## Usage

```ts
import { createEngine } from "./engine/engine.js";

const engine = createEngine({
  seed: 12345,
  staticData: await loadStaticData("./data"),
});

// tick world
engine.world.tick();

// trigger combat
const battle = engine.combat.startBattle(player, enemies);

// save / load
const save = engine.save.serialize();
const restored = engine.save.deserialize(save);
```

## Spec

See `spec/` directory for full design documents.
