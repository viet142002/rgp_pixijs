/**
 * Vitest global setup.
 *
 * Installs `fake-indexeddb` polyfill before any test imports modules that
 * touch IndexedDB (engine/persistence/*).
 */

import "fake-indexeddb/auto";
