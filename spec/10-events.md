# 10 — Event Queue

## Mục tiêu

Mọi thay đổi trong game world đều thông qua event. Cho phép:
- Decouple giữa các engine module.
- Trigger delayed action (trả thù sau N ngày).
- Replay log (debug, share).
- Listen UI update mà không cần polling.

## Event types

### Player events

| Event | Trigger |
|---|---|
| `PLAYER_MOVED` | Player đổi tile |
| `PLAYER_REALM_UP` | Player đột phá cảnh giới |
| `PLAYER_DIED` | HP = 0 |
| `PLAYER_ITEM_USED` | Dùng item trong combat/world |

### NPC events

| Event | Trigger |
|---|---|
| `NPC_SPAWNED` | NPC vào world |
| `NPC_DIED` | NPC HP = 0 |
| `NPC_ATTACKED` | NPC bị đánh |
| `NPC_HELPED` | NPC được cứu |
| `NPC_SPARED` | NPC được tha |
| `NPC_ROBBED` | NPC bị cướp |
| `NPC_MOVED` | NPC đổi tile |

### Social events

| Event | Trigger |
|---|---|
| `RELATION_CHANGED` | Affinity thay đổi |
| `GRUDGE_ADDED` | NPC có grudge mới |
| `GRUDGE_DECAYED` | Grudge strength giảm |
| `HATRED_PROPAGATED` | Witness/relation nhận hatred |
| `FACTION_REP_CHANGED` | Player rep với faction |

### World events

| Event | Trigger |
|---|---|
| `WORLD_TIME_TICK` | Mỗi world tick |
| `DAY_CHANGED` | Qua midnight |
| `AREA_ENTERED` | Player vào region mới |
| `ENCOUNTER_TRIGGERED` | Combat bắt đầu |
| `COMBAT_ENDED` | Victory/defeat/escape |

### Quest/script events (v0.4+)

| Event | Trigger |
|---|---|
| `QUEST_STARTED` | Nhận quest |
| `QUEST_OBJECTIVE_DONE` | Hoàn thành objective |
| `QUEST_COMPLETED` | Quest xong |

## Event schema

```
Event {
  id: string                  # unique
  type: EventType
  
  source: string              # actor gây ra (NPC id, "player", "system")
  targets: string[]           # affected entities
  
  data: Record<string, any>   # event-specific payload
  
  day: number                 # game-day lúc fire
  tick: number                # world tick lúc fire
  timestamp: number           # ms epoch (cho debug)
}
```

## Synchronous vs Delayed

### Synchronous

Event fire ngay trong tick hiện tại. Listener xử lý cùng tick.

Ví dụ: `NPC_DIED` → hatred propagation chạy ngay.

### Delayed

Event được schedule để fire ở tương lai:

```
DelayedEvent {
  ...Event fields
  executeAtDay: number
  executeAtTick: number      # optional, trong ngày
}
```

Queue kiểm tra mỗi world tick: event nào đã đến hạn → fire.

Ví dụ: player giết trưởng lão → schedule `REVENGE_ATTACK` executeAtDay = currentDay + 3.

## Event bus

In-process pub/sub:

```
eventBus.emit(event)
eventBus.on(type, handler)
eventBus.off(type, handler)
```

Listener register khi engine module init. UI subscribe để update.

### Listener priority

```
Listener {
  priority: number      # thấp chạy trước
  handler: (event) => void
}
```

Hatred propagation priority thấp (chạy trư�c). UI update priority cao (chạy sau).

## Persistence

Event log lưu trong save? **Không**. Chỉ lưu state hiện tại. Event log runtime (debug).

Exception: delayed events phải persist. Lưu `worldEvents: DelayedEvent[]` trong save.

## Replay

Nếu log full event sequence (optional, debug mode), replay từ seed + events → reproduce state. Hữu ích cho bug report.

## Event-driven flow example

```
Player attack NPC A (Lý trưởng)
  → emit NPC_ATTACKED { source: player, target: A }
    → listener: NPC A affinity -15
    → listener: combat trigger (nếu hostile)
  → combat ends → emit NPC_DIED { source: player, target: A }
    → listener: hatred propagation
      → witness scan: 5 NPC gần
      → relation cascade: A1, A2, B, C
      → faction cascade: Thanh Vân members
    → listener: schedule REVENGE_ATTACK (day +3)
    → listener: drop loot, update save flag
```

## UI integration

Event Log panel subscribe `*` → show scrollable list:
```
[Day 3, 14:23] Lý Thanh Vân ghi nhớ mối thù với bạn
[Day 3, 14:25] Triệu Vân trở nên căm hận bạn
[Day 4, 09:12] Bạn đạt Luyện Khí tầng 2
```

Filter theo type. Color theo category (red combat, yellow social, blue world).

## Performance

- Event emit không block: queue immediate + async dispatch.
- Listener handler timeout 5ms (warning nếu vượt).
- Drop event cũ > 1000 entries (giữ log manageable).
