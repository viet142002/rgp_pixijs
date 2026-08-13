# 04 — World Engine

## Mục tiêu

Quản lý thời gian, không gian, và trạng thái thế giới. Là nền cho NPC AI, encounter, event.

## Tick system

**Hai tick rate tách biệt:**

| Tick | Tần suất | Dùng cho |
|---|---|---|
| World tick | 1 Hz (1 game-second) | NPC move, time advance, encounter check |
| AI tick | 0.2 Hz (5 game-second) | Utility AI evaluation |
| Render | 60 fps | PixiJS render từ snapshot |

World tick chạy trong accumulator để không drift. AI evaluation mỗi 5 world tick để giảm CPU.

## World time

```
worldTime: {
  day: number       # 0-based
  hour: number      # 0-23
  minute: number    # 0-59
}
```

1 game-hour = 60 game-second = 60 world tick.
1 game-day = 24 game-hour.

Time advance mỗi world tick. NPC schedule dựa theo hour (NPC ngủ ban đêm, đi chợ ban ngày).

## Map spec

### Tile-based
- Tile size: **32x32 px**.
- Grid: viewport 25x15 tile (800x480), vùng lớn hơn off-screen.
- Format: **Tiled JSON** (.json export từ Tiled editor).

### Layer structure
- `ground`: tile nền (cỏ, đá, đất).
- `terrain`: tile có va chạm (tường, núi, cây lớn).
- `objects`: NPC spawn point, interactable (cây, rương, cửa).
- `overlay`: tile render trên player (mái nhà, tán cây).
- `collision`: boolean layer.

### Region
- Nhiều map file, mỗi map 1 region (làng, thành, rừng, sơn môn).
- Player di chuyển giữa region qua transition tile.
- Mỗi region có NPC riêng (resident) + NPC vãng lai (visitor từ region khác).

### Coordinate
- World coord: pixel (`x: 1234, y: 567`).
- Tile coord: `(tx: floor(x/32), ty: floor(y/32))`.
- Collision check theo tile coord.

## Encounter

Khi player di chuyển:
- Check tile có encounter zone không.
- Roll PRNG → có thể trigger combat.
- Encounter rate tunable per region.

Tránh encounter trong town/safe zone.

## Pathfinding

NPC di chuyển bằng **A*** trên grid (dùng collision layer).
- Recompute path khi mục tiêu đổi hoặc bị chặn.
- Path cache theo (start, goal) pair, TTL 5 giây.

## Spatial query

Neighbor lookup dùng **uniform grid** (chia tile space thành cell 8x8 tile). NPC query neighbor trong cell ± 1.

Tránh O(n²) check khi world lớn.

## Determinism

Tick order deterministic. NPC list sorted by ID. AI evaluation thứ tự cố định. Cùng seed → cùng world state sau N tick.
