/**
 * Event bus + delayed event queue.
 */

import type {
  GameEvent, DelayedEvent, EventType, EntityId,
} from "../types.js";

type EventHandler = (event: GameEvent) => void;

class EventBus {
  private listeners: Map<EventType | "*", EventHandler[]> = new Map();

  on(type: EventType | "*", handler: EventHandler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  off(type: EventType | "*", handler: EventHandler): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((h) => h !== handler)
    );
  }

  emit(event: GameEvent): void {
    // Wildcard listeners
    const wildcards = this.listeners.get("*") ?? [];
    for (const h of wildcards) safeCall(h, event);

    // Typed listeners
    const typed = this.listeners.get(event.type) ?? [];
    for (const h of typed) safeCall(h, event);
  }
}

function safeCall(h: EventHandler, e: GameEvent): void {
  try {
    h(e);
  } catch (err) {
    console.error(`[EventBus] listener error for ${e.type}:`, err);
  }
}

export const eventBus = new EventBus();

export function dispatchEvent(
  partial: Omit<GameEvent, "id" | "timestamp">,
  day: number,
  tick: number
): GameEvent {
  const event: GameEvent = {
    ...partial,
    id: `${partial.type}_${day}_${tick}_${Math.random().toString(36).slice(2, 8)}`,
    day,
    tick,
    timestamp: Date.now(),
  };
  eventBus.emit(event);
  return event;
}

/**
 * Delayed event queue.
 * Events with executeAtDay <= currentDay fire on next tick.
 */
export class DelayedEventQueue {
  private events: DelayedEvent[] = [];

  enqueue(event: DelayedEvent): void {
    this.events.push(event);
  }

  remove(id: string): boolean {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    return this.events.length < before;
  }

  removeByTarget(target: EntityId): number {
    const before = this.events.length;
    this.events = this.events.filter((e) => !e.targets.includes(target));
    return before - this.events.length;
  }

  /**
   * Pop all events due on/before currentDay. Returns events in order.
   */
  pop(currentDay: number): DelayedEvent[] {
    const due = this.events.filter((e) => e.executeAtDay <= currentDay);
    this.events = this.events.filter((e) => e.executeAtDay > currentDay);
    // Sort by executeAtDay for determinism
    return due.sort((a, b) => a.executeAtDay - b.executeAtDay);
  }

  list(): DelayedEvent[] {
    return [...this.events];
  }

  count(): number {
    return this.events.length;
  }
}
