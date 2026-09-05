---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Web rules

- Components are functions, small, and free of fetching logic: they read the `ChatStore` through `useSyncExternalStore` and call the `ChatClient` for writes. No query-cache library, no second copy of server state.
- Derive, never duplicate. There is no effect whose only job is to keep one piece of state in step with another; the selected room comes from `?room=<id>` in the URL.
- Forms use `useActionState` for submission and `useOptimistic` for the message the user just sent, which is reconciled by id when the server echoes it back.
- The marker layer is memoised so message traffic never re-renders it, and Leaflet is imported only here, in its own chunk.
- Accessibility is part of the component, not a later pass: labelled inputs, a `role="log"` live region with an accessible name that exists before the first message, focus moved to the panel heading on room switch, Escape to close, and `prefers-reduced-motion` respected.
- Tests render through Testing Library and assert what a user sees; `react-leaflet` is mocked, never loaded into jsdom.
