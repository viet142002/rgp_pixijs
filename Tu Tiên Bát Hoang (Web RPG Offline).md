# Tu Tiên Bát Hoang (Web RPG Offline)
## Software Requirement & Game Design Specification (Offline MVP v0.2)

### Phiên bản
- Version: 0.2 (Offline First)
- Ngày: 13/08/2026
- Tác giả: Việt Nguyễn
- Trạng thái: Draft

---

# 1. Tầm nhìn sản phẩm (Product Vision)

**Tu Tiên Bát Hoang** là một game web RPG 2D theo phong cách tu tiên sandbox, lấy cảm hứng từ *Quỷ Cốc Bát Hoang (Tale of Immortal)*. Trọng tâm của game không nằm ở cốt truyện tuyến tính hay combat, mà nằm ở **Mạng lưới Nhân - Quả (Social Graph Simulation)**.

Mỗi NPC trong thế giới đều có quan hệ, cảm xúc, tính cách, mục tiêu và ký ức. Mọi hành động của người chơi sẽ tạo ra chuỗi phản ứng lan truyền trong xã hội NPC, hình thành các câu chuyện tự phát (Emergent Storytelling).

Phiên bản hiện tại được thiết kế theo hướng **Offline First**:

- Chơi hoàn toàn không cần Internet
- Toàn bộ game logic chạy trong trình duyệt
- Dữ liệu được lưu cục bộ trên máy người chơi
- Có thể đóng gói thành desktop app bằng Electron trong tương lai

---

# 2. Mục tiêu MVP

MVP tập trung chứng minh 4 hệ thống cốt lõi:

1. **Thế giới 2D có NPC**
2. **Combat turn-based**
3. **Hệ thống Social Graph + Lan truyền Nhân - Quả**
4. **Lưu / tải game cục bộ (Save / Load)**

MVP không yêu cầu:

- Multiplayer
- Backend server
- Cloud save
- Marketplace
- PvP
- Quest hệ thống phức tạp

---

# 3. Gameplay Loop

Khám phá
→ Gặp NPC
→ Tương tác
→ Quan hệ thay đổi
→ Xung đột / Hợp tác
→ Combat
→ Hậu quả lan truyền
→ Thế giới thay đổi
→ Save game
→ Tiếp tục khám phá

---

# 4. Kiến trúc hệ thống (Offline Architecture)

## Tổng quan

Toàn bộ hệ thống chạy trong browser.

React UI
↓

PixiJS Renderer
↓

Game Engine
↓

IndexedDB Save System

## Frontend

### React

Chịu trách nhiệm:

- HUD
- Combat UI
- Dialog
- Relationship Graph
- Character Panel
- Event Log

### PixiJS

Render:

- Tile map
- Player
- NPC
- Animation
- Hiệu ứng đơn giản

## Game Engine

Bao gồm các module:

- World Engine
- Relationship Engine
- Behavior Engine
- Combat Engine
- Event Engine
- Save Manager

Game Engine **không phụ thuộc React**.

React chỉ đọc state và render.

---

# 5. Persistence (Lưu dữ liệu)

## Công nghệ

**IndexedDB (Dexie.js)**

Lý do:

- Dung lượng lớn
- Lưu object phức tạp
- Truy xuất nhanh
- Hỗ trợ nhiều save slot

## Save Slots

MVP:

- Slot 1
- Slot 2
- Slot 3
- Auto Save

## Save Structure

```ts
GameSave {
  version: number
  randomSeed: number

  worldTime: {
    day: number
    hour: number
    minute: number
  }

  player: Player

  npcs: NPC[]

  relations: Relation[]

  worldEvents: WorldEvent[]

  worldState: WorldState
}
```

## Save Trigger

- Mỗi 30 giây
- Khi đổi khu vực
- Trước combat
- Khi người chơi bấm Save

---

# 6. Core Systems

# 6.1 World Engine

## Mục tiêu

Quản lý thời gian và trạng thái thế giới.

## Tick

1 tick = 1 giây game

Mỗi tick:

- NPC di chuyển
- AI cập nhật
- Event Queue xử lý
- Kiểm tra encounter
- Cập nhật animation state

## World Time

Lưu:

- day
- hour
- minute

---

# 6.2 NPC System

## NPC Model

```ts
NPC {
  id: string

  name: string

  gender: Male | Female

  realm: string

  hp: number

  mp: number

  attack: number

  defense: number

  speed: number

  factionId: string

  position: {
    x: number
    y: number
  }

  traits: string[]

  states: string[]
}
```

## Spawn

MVP:

- Spawn cố định
- Không respawn
- NPC chết sẽ bị xóa khỏi thế giới

---

# 6.3 Relationship System

## Relation Model

```ts
Relation {
  from: string

  to: string

  type:
    friend
    enemy
    family
    master
    disciple

  affinity: number

  strength: number
}
```

Quan hệ luôn được lưu bằng **ID**, không lưu object lồng nhau.

---

# 6.4 Hatred Propagation

## Trigger

NPC chết

## Thuật toán

Tìm tất cả Relation có:

to == Victim

Tính hatred:

```ts
hatred =
abs(affinity)
× strength
× traitMultiplier
```

NPC nhận trạng thái:

Huyết Cừu

với người chơi.

## Hậu quả

NPC sẽ:

- truy sát
- từ chối giao dịch
- tăng sát thương với mục tiêu

---

# 6.5 Trait System

## Static Traits

Được định nghĩa trong:

traits.json

Ví dụ:

```json
{
  "RIGHTEOUS": {
    "hatredMultiplier": 1.5
  },

  "COWARD": {
    "runThreshold": 0.35
  }
}
```

## Dynamic States

Xuất hiện trong runtime:

- Huyết Cừu
- Ân Tình
- Tâm Ma

Được lưu trong save game.

---

# 6.6 Behavior Engine

Sử dụng **Utility AI**.

NPC tính điểm cho:

- Attack
- Run
- Help Friend
- Wander

Ví dụ:

```ts
Attack =
Aggressive
+ Revenge
+ AllyNearby
```

NPC chọn hành động có điểm cao nhất.

---

# 6.7 Combat Engine

## State Machine

```text
START

↓

ROLL_INITIATIVE

↓

TURN_START

↓

ACTION_SELECT

↓

ACTION_RESOLVE

↓

CHECK_DEATH

↓

END_TURN

↓

VICTORY / DEFEAT
```

## Actions

- Attack
- Skill
- Defend
- Escape

Combat hoàn toàn chạy trong Game Engine.

---

# 6.8 Ally Reinforcement

Điều kiện:

- affinity >= 70
- distance <= 3 ô

NPC đồng minh sẽ tham chiến.

MVP:

Tối đa 1 NPC viện trợ.

---

# 6.9 Post Combat

Sau khi thắng NPC

Người chơi chọn:

### Kill

- NPC chết
- Lan truyền Huyết Cừu

### Spare

- affinity +20
- Có thể nhận Ân Tình

### Rob

- nhận item
- affinity -40
- Có thể bị phục kích

---

# 7. Event Queue

Mọi hệ thống giao tiếp thông qua Event.

## Event Types

```ts
NPC_DIED

NPC_ATTACKED

NPC_HELPED

NPC_SPARED

NPC_ROBBED

PLAYER_REALM_UP

RELATION_CHANGED
```

## Delayed Events

Ví dụ:

Player giết trưởng lão

↓

Tạo event:

```json
{
  "type": "REVENGE_ATTACK",

  "executeAtDay": 15,

  "attacker": "npc_032"
}
```

Sau 3 ngày game, NPC sẽ xuất hiện truy sát.

---

# 8. UI Requirements

# 8.1 Map Screen

Hiển thị:

- Map
- Player
- NPC

HUD:

- HP
- MP
- Realm

Event Log:

```text
Lý Thanh Vân ghi nhớ mối thù với bạn

Triệu Vân trở nên căm hận bạn

Bạn đạt Luyện Khí tầng 2
```

# 8.2 Combat Screen

Hiển thị:

- Hai nhân vật
- HP/MP
- Turn Order

Buttons:

- Attack
- Skill
- Defend
- Escape

Combat Log:

```text
Bạn dùng Hỏa Cầu Thuật

Lý Thanh Vân nhận 12 sát thương

Lý Thanh Vân bỏ chạy
```

# 8.3 Relationship Screen

React Flow

Node:

- Avatar
- Tên
- Realm

Edge:

- Xanh: Friend
- Đỏ: Enemy
- Vàng: Master
- Cam: Family

Hỗ trợ:

- Zoom
- Pan
- Click xem chi tiết NPC

---

# 9. Dữ liệu game

## Static Data

Lưu trong:

```text
data/

  traits.json

  skills.json

  realms.json

  factions.json

  items.json
```

Các file này không thay đổi trong runtime.

## Runtime Data

Lưu trong save game:

- Player
- NPC hiện tại
- Relations
- Event Queue
- Inventory
- Map state

---

# 10. Cấu trúc thư mục

```text
src/

  assets/

    sprites/

    maps/

  data/

    traits.json

    skills.json

    realms.json

    factions.json

  engine/

    world/

    combat/

    relationship/

    ai/

    events/

  persistence/

    db.ts

    saveManager.ts

  store/

    gameStore.ts

  ui/

    hud/

    combat/

    relationship/

  renderer/

    pixi/
```

---

# 11. Random Seed

Game sử dụng **PRNG Seed**.

Mọi hành vi ngẫu nhiên:

- spawn
- AI
- loot
- encounter
- event

đều dùng cùng một seed.

Điều này giúp:

- tái tạo bug
- replay
- chia sẻ seed
- save file nhỏ hơn

---

# 12. MVP Acceptance Criteria

## World

- Có bản đồ
- Có NPC
- NPC di chuyển
- Có thời gian

## Combat

- Có thể đánh NPC
- Có thắng / thua
- Có log

## Social Graph

- Hiển thị cây quan hệ
- Giết NPC
- Quan hệ thay đổi
- Ít nhất 3 NPC phản ứng

## Event

- Event log hiển thị
- Có sự kiện truy sát sau vài ngày

## Save / Load

- Save thành công
- Load khôi phục đúng toàn bộ trạng thái
- Có tối thiểu 3 save slot

---

# 13. Roadmap

## v0.2 (Offline MVP)

- World
- NPC
- Combat
- Relationship
- Hatred Propagation
- Save / Load

## v0.3

- Faction
- Reputation
- Multi-ally combat
- Event Queue đầy đủ

## v0.4

- Tu luyện
- Đột phá
- Dynamic Trait
- Procedural Quest

## v0.5

- Tông môn
- Kết hôn
- Con cái
- Truyền thừa

## v1.0

- Sandbox thế giới hoàn chỉnh
- Hệ sinh thái NPC tự vận hành
- Câu chuyện phát sinh hoàn toàn từ hệ thống Nhân - Quả
