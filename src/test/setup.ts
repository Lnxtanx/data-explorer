// =============================================================================
// Vitest setup for the app layer.
//
// Three environment gaps have to be closed before the pure-module tests run.
// Each one is a real footgun discovered in Phase 0, not scaffolding:
//
// 1. Node >= 22 exposes its OWN `localStorage` global (behind --localstorage-file).
//    Under Node 25 that object shadows jsdom's: it is an `object` with
//    `clear === undefined` and no usable constructor, so every persistence test
//    dies on `localStorage.clear is not a function`. We install a real jsdom
//    Storage in its place.
//
// 2. jsdom does not implement IndexedDB, and `lib/persist.ts` calls `openDB()`
//    EAGERLY at module load. So merely importing it (which `lib/queryClient.ts`
//    does) throws. `fake-indexeddb` provides a real in-memory implementation,
//    which also lets us genuinely test the persister's cache filter.
//
// 3. Nothing else is stubbed. If a future test needs more, add it here with a
//    comment explaining WHY, and prefer a real implementation over a hand-rolled
//    one.
//
// Expected to be deleted or shrunk in Phase 3, when queryKeys moves out of the
// module that constructs the persister.
// =============================================================================
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

// ── 1. Replace Node's experimental localStorage with a real jsdom Storage ──
const dom = new JSDOM('', { url: 'http://localhost/' });
for (const name of ['localStorage', 'sessionStorage'] as const) {
  const store = (dom.window as unknown as Record<string, Storage>)[name];
  Object.defineProperty(globalThis, name, {
    value: store,
    configurable: true,
    writable: true,
  });
}
