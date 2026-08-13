# 05 — NPC System

## Mục tiêu

Mỗi NPC là entity độc lập có identity, quan hệ, traits, schedule, và inventory. NPC sống (di chuyển, tương tác) ngay cả khi player không ở gần.

## NPC Model

```
NPC {
  id: string                  # unique, stable
  name: string
  gender: Male | Female
  realm: string               # tu vi rank
  
  hp: number
  mp: number
  
  stats: {
    attack: number
    defense: number
    speed: number
    critRate: number
    critDamage: number
    evasion: number
    accuracy: number
  }
  
  factionId: string
  position: { x, y }
  homeRegion: string
  
  traits: string[]            # static, từ traits.json
  states: string[]            # dynamic: Huyết Cừu, Ân Tình, Tâm Ma
  
  inventory: InventoryRef     # optional, nếu có item
  
  schedule: Schedule          # pattern di chuyển theo giờ
  memory: MemoryEntry[]       # ghi nhận sự kiện liên quan
  grudge: Grudge[]            # hatred record per target
  
  alive: boolean
  spawnDay: number
}
```

## Identity

- `id`: stable string, dùng làm relation key. Không đổi khi reload save.
- `name`: hiển thị. Có thể trùng (Lý Thanh Vân A, Lý Thanh Vân B).
- Kết hợp `(id, region)` để locate NPC.

## Lifecycle

```
Spawn → Alive → (Combat: Death) → Removed
            ↓
         Memory persists in Relations
```

- **Spawn**: cố định từ region definition. MVP không procedural spawn.
- **Death**: HP = 0 → removed khỏi world. Quan hệ và grudge của NPC khác với nó vẫn tồn tại (lưu bằng id).
- **No respawn**: NPC chết = mất vĩnh viễn. Tăng weight cho player decision.

## Schedule

Mỗi NPC có pattern di chuyển theo hour:
```
Schedule {
  entries: [
    { hour: 6,  location: "market", action: "shop" },
    { hour: 12, location: "tavern", action: "eat" },
    { hour: 18, location: "home",   action: "rest" },
    ...
  ]
}
```

World tick check current hour → NPC move tới location. Schedule khác nhau theo nghề (farmer, merchant, guard, cultivator).

## Memory

NPC ghi nhận sự kiện liên quan đến bản thân:
```
MemoryEntry {
  day: number
  type: "witnessed_death" | "witnessed_attack" | "helped_by" | "robbed_by" | ...
  actor: string              # NPC id hoặc "player"
  context: string            # optional note
  intensity: number          # 0-1, fade theo thời gian
}
```

Memory fade: `intensity *= 0.95` mỗi game-day. Sau 30 ngày → quên hoàn toàn.

Memory dùng cho dialog reference ("tao nhớ mày đã giúp tao hôm trước").

## Grudge

NPC track grudge với từng actor đã hurt mình:
```
Grudge {
  target: string             # "player" hoặc NPC id
  type: "killed_friend" | "killed_family" | "attacked" | "robbed" | "insulted"
  strength: number           # 0-100
  decay: number              # strength giảm mỗi game-day
  day: number                # ngày hình thành
}
```

Grudge quyết định behavior (Attack vs Help vs Ignore).

## Inventory

NPC có thể có item để trade/rob. MVP: simple list, không trang bị.
```
InventoryRef {
  items: { itemId, quantity }[]
  capacity: number
}
```

## Render

PixiJS render NPC sprite. Mỗi frame:
- Đọc `position` từ engine state.
- Đọc `facing` (movement direction).
- Đọc `action` (idle/walk/attack/hurt).

## Performance

- NPC list trong world có thể 100-500 entity.
- Không update mỗi frame. Ch� khi position đổi → flag dirty → render update.
- Off-screen NPC: skip render, vẫn update logic.
