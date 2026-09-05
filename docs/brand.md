# Wolfchatter — brand system

The single source for colour, type and the marks. The two `README.md` files next to the assets are file manifests; the rules live here.

Everything below is original work drawn for this project. None of it is derived from Wolfpack Digital's identity, because the repository is public.

## 1. Colour

Four roles, no more. A component names a role and never a hex, so a dark theme costs no second class anywhere. The tokens are declared once in `apps/web/src/index.css` inside `@theme`, and `light-dark()` resolves each one against the root colour scheme.

| Role | Token | Light | Dark | What it is for |
|---|---|---|---|---|
| Accent | `--color-accent` | `#EC2A6E` | `#FF4D86` | The one hot colour, for everything that is **not** text: the selected marker, the live indicator, the border of a field that was refused. |
| Accent, strong | `--color-accent-strong` | `#D42663` | `#FF4D86` | The same accent wherever text is involved — as the colour of the words, or as the ground beneath them. Identical in the dark theme, where the hot accent already carries text. |
| Ink | `--color-ink` | `#141216` | `#F3EFF2` | Every glyph. Secondary text is the same ink at reduced alpha (`text-ink/70`), never a fifth colour. |
| Ground | `--color-ground` | `#F8F6F7` | `#131114` | The surface everything sits on: page, panel, sheet. |
| Rule | `--color-rule` | `#E5DFE3` | `#2E2930` | Hairlines and borders. Not for text, which would fail contrast. |

The neutrals carry a slight pink bias on purpose, so the accent reads as part of the palette rather than dropped onto grey.

**Contrast**, measured rather than assumed — the alpha rows are read back from what Blink actually paints on the ground, not computed from the token:

| Pair | Light | Dark |
|---|---|---|
| Ink on ground | 17.30:1 | 16.49:1 |
| Ink at 70% on ground | 6.75:1 | 8.38:1 |
| Ink at 60% on ground | 4.76:1 | 6.42:1 |
| Ink at 40% on ground | **2.56:1** | **3.52:1** |
| Accent on ground | **3.81:1** | 5.96:1 |
| Accent-strong on ground, and ground on accent-strong | 4.58:1 | 5.96:1 |

Body text passes WCAG AAA in either theme. The accent does not: at 3.81:1 on the light ground it clears the 3:1 that AA asks of marks, borders and other non-text elements, but it is **below the 4.5:1 that normal text needs** — and contrast is symmetric, so white-on-accent fails in exactly the same way a button label does.

**The decision, taken in delivery-plan PR 6:** the palette keeps both. `--color-accent` stays the brand's hot pink and is spent only where WCAG asks 3:1 — the selected marker, the live indicator, the border of a refused field — which is also what the mark files are drawn in, so nothing has to be regenerated. `--color-accent-strong` is the same colour darkened to `#D42663` (4.58:1) and is the only one allowed near a word: the inline error under a field, and the fill of the Submit button, whose label is ground on accent. In the dark theme the hot accent already reaches 5.96:1, so the two tokens are the same colour there and the theme loses none of its heat. The alternative — darkening the one accent everywhere — was rejected because the colour is baked into thirteen SVG marks that would then no longer match the interface.

**Ink at reduced alpha is text too.** `text-ink/70` and `text-ink/60` clear 4.5:1 in both themes and are the two steps for secondary copy: 70% for panel prose, 60% for timestamps and the peek's preview. `text-ink/40` does not clear it in either theme and is not a text colour, which is why a placeholder — the visible label of a field whose real label is hidden — sits at 60%.

## 2. Type

Two faces, both self-hosted from `apps/web/public/fonts/` and declared in `index.css`. Neither is loaded from Google, so the app looks right for a reviewer with no network and makes no third-party request.

| Token | Face | Where |
|---|---|---|
| `--font-display` | Archivo ExtraBold (800) | The "Wolf" half of the wordmark, and headings |
| `--font-script` | Kaushan Script (400) | The "chatter" half of the wordmark, and nowhere else |
| *(default)* | the system UI stack | Every other glyph in the interface |

Kaushan Script is brand furniture rather than a UI face. It renders one word, which is why it can be loaded lazily or dropped entirely without touching the interface.

Both faces declare a real fallback stack, so a failed load degrades instead of disappearing.

**Scale.** The app does not invent a parallel type scale; it uses Tailwind's steps and fixes which step means what, so a stranger picks the same size for the same job.

| Step | Size | Use |
|---|---|---|
| `text-xs` | 12 px | Timestamps, attribution |
| `text-sm` | 14 px | Message bodies, panel copy |
| `text-base` | 16 px | Inputs — never smaller, or iOS zooms the page on focus |
| `text-lg` | 18 px | The room title in the panel |
| `text-xl` | 20 px | The wordmark in the app header |
| `text-2xl` | 24 px | The one place a page-level heading is needed |

## 3. Marks

Five marks, one visual grammar: a geometric line-art monogram on a 64 grid, 3.5 stroke, mitred joins, one hot accent. Each has a light and a dark version, chosen by the ground it sits on rather than by the file name's own colour.

| File | Mark | Role |
|---|---|---|
| `brand/wordmark-{light,dark}.svg` | Wordmark | The primary logo wherever there is room for the name: the README and the app header. "Wolf" is Archivo ExtraBold in ink, "chatter" is Kaushan Script in the accent. |
| `brand/mark-{light,dark}.svg` | Two Pins | The mark alone, for the places the wordmark will not fit. The only one that survives at 16 px unchanged. |
| `brand/icon-{light,dark}.svg` | Viewport | The app icon, and the PWA icon when that lands |
| `favicon.svg` | Viewport | The same mark with the theme switch built into the file, so the tab icon needs no second request |
| `brand/state-map-{light,dark}.svg` | Dropped Pin | Empty state on the map, before any room exists |
| `brand/state-live-{light,dark}.svg` | Broadcast | The live-connection indicator |
| `brand/state-room-{light,dark}.svg` | Bubble Pin | Empty state inside a room with no messages |

**Clear space** on every side is one quarter of the mark's width. **Minimum size is 16 px**; below that the 3.5 strokes close up and the mark turns into a blob.

**The wordmark carries no text.** Its letters are outlines, converted from the two fonts this repository already hosts, so it renders identically everywhere — GitHub does not load external fonts inside an SVG, and a wordmark set as SVG text would fall back to something else on the one page that matters most. Regenerate it only if the fonts or the spelling change, and from those same font files.

**Do not**: recolour a mark outside the palette, add a drop shadow, stretch a square mark to a non-square box, or re-set the wordmark as live text.

## 4. Where the files live

`apps/web/public/` is the one home. The favicon has to be served from there anyway, which makes any second copy a copy that will go stale.

```
apps/web/public/favicon.svg        the tab icon, theme switch inside the file
apps/web/public/brand/             the five marks, light and dark
apps/web/public/fonts/             two woff2 files and the OFL licence for each
```

Both folders keep a short `README.md` beside the files. Those ship with the build, which is two kilobytes of static text and cheaper than a build rule that would have to be maintained.
