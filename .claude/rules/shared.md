---
paths:
  - "packages/shared/**/*.ts"
---

# Shared package rules

- This package is the contract between the server, the web app and any future native shell, so it imports no DOM type, no `react-dom` and no Leaflet, and nothing here may reach for `window`, `document` or `localStorage` directly — storage goes through the injected adapter.
- The Zod schemas are the single source of truth: the server validates with them, the client parses with them, and every type comes from `z.infer`. A shape declared twice is a bug.
- The WS protocol is a discriminated union on `type`, validated in both directions, and every frame carries the ids the client needs to de-duplicate.
- `ChatStore` is framework-free and synchronous: a subscribe/getSnapshot pair, immutable snapshots so `useSyncExternalStore` can compare them by reference, and no timers or network calls of its own.
- `ChatClient` owns reconnection with jittered backoff and back-fills from the last seen message id; it reports connection state into the store rather than throwing at its callers.
