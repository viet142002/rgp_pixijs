# 03 — Persistence (Save/Load)

## Công nghệ

**IndexedDB qua Dexie.js.**

Lý do:
- Dung lượng lớn (hàng trăm MB).
- Object phức tạp, không cần normalize như SQL.
- Truy xuất nhanh qua index.
- Hỗ trợ nhiều save slot + auto save.
- Transaction đảm bảo atomic.

## Save slots

- Slot 1, 2, 3: manual.
- Auto Save: ghi đè tự động mỗi 30s và trước event quan trọng.

## Save schema (versioned)

```
GameSave {
  schemaVersion: number       # version của save structure
  dataVersion: number         # version của static data đã load
  prngSeed: number
  prngState: string           # serialized PRNG state
  
  worldTime: { day, hour, minute }
  
  player: Player
  npcs: NPC[]
  relations: Relation[]
  worldEvents: QueuedEvent[]
  inventory: Inventory
  worldState: WorldState       # map state, faction rep, flags
}
```

## Save trigger

| Trigger | Mô tả |
|---|---|
| Auto | Mỗi 30 giây game time |
| Area change | Đổi map/region |
| Pre-combat | Trước khi vào battle |
| Post-combat | Sau khi kết thúc battle |
| Player action | Bấm Save button |
| App background | Visibility change → flush |
| Dirty threshold | Nếu > N actions chưa save → force save |

## Atomic write

IndexedDB transaction wrap toàn bộ write. Nếu fail giữa chừng, rollback. Không bao giờ có save corrupt một nửa.

```
saveManager.save(slot, gameState):
  await db.transaction('rw', saves, async () => {
    const payload = serialize(gameState)
    await saves.put({ slot, payload, timestamp })
  })
```

## Version migration

Save cũ có `schemaVersion` thấp → migrate lên version hiện tại khi load.

- Migration table: `migrations[v] = (save) => save`.
- Chain migration: v1 → v2 → ... → current.
- Mỗi migration transform save object.
- Backup raw save trước khi migrate (rollback nếu fail).

## Data version

Static data (traits, skills, realms...) có `dataVersion`. Nếu game patch đ�i balance → dataVersion mới. Save cũ vẫn load được nhưng:
- Nếu dataVersion mismatch → áp dụng migration cho static data references.
- Hoặc đánh dấu save "outdated" → cho player chọn continue với data cũ hoặc bắt đầu mới.

## Save validation

- Checksum (SHA-256) của payload → verify khi load.
- Schema check: required fields, type check.
- Nếu checksum fail → fallback auto save hoặc thông báo cho player.

## Dirty flag

Engine track `dirty: boolean`. Mỗi action set dirty=true. Save success reset dirty=false. UI có thể hiện "*" khi dirty.

## Quota

- IndexedDB quota vài trăm MB → browser dependent.
- Estimate trước khi save.
- Nếu quota gần đầy → thông báo, suggest xóa slot cũ.
