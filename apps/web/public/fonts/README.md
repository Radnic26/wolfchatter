# Self-hosted fonts

Two faces, latin subset only, served from this folder so the app looks right with no
network and makes no third-party request. Both are licensed under the SIL Open Font
License 1.1; the full licence text sits next to each file, as the licence requires when
the fonts are redistributed.

| File | Face | Use | Size |
|---|---|---|---|
| `archivo-800.woff2` | Archivo ExtraBold | The bold half of the wordmark, headings | 14 KB |
| `kaushan-script-400.woff2` | Kaushan Script | The script half of the wordmark only | 23 KB |

The `@font-face` declarations and the fallback stacks live in `apps/web/src/index.css`;
how the faces are used is in [docs/brand.md](../../../../docs/brand.md).
