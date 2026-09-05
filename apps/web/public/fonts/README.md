# Self-hosted fonts

Two faces, latin subset only, served from this folder so the app looks right with no network and
makes no third-party request. Both are licensed under the SIL Open Font License 1.1; the full
licence text sits next to each file, as the licence requires when the fonts are redistributed.

| File | Face | Use | Size |
|---|---|---|---|
| `archivo-800.woff2` | Archivo ExtraBold | The bold half of the wordmark, headings | 14 KB |
| `kaushan-script-400.woff2` | Kaushan Script | The script half of the wordmark only | 23 KB |

Kaushan Script is brand furniture, not a UI face: it is used for the word "chatter" and nowhere
else, so it can be loaded lazily or dropped without touching the interface.

```css
@font-face {
  font-family: "Archivo";
  src: url("/fonts/archivo-800.woff2") format("woff2");
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Kaushan Script";
  src: url("/fonts/kaushan-script-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Always declare a real fallback stack, so a failed load degrades instead of disappearing:
`font-family: Archivo, ui-sans-serif, system-ui, sans-serif`.
