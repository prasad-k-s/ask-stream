# Screenshots to capture for the README

Save each file into this `docs/` folder with exactly the name shown. The README already points to them.

Tip: set `GEMINI_API_KEY=mock` in `.env.local` while capturing. The mock answer always has a heading,
a list, a code block and a table, so every screenshot looks full and consistent.

| File | What to capture | How |
| --- | --- | --- |
| `screenshot-light.png` | A finished answer in light mode: question, status with model name, stream timeline, start of the answer | Windows: `Win + Shift + S`, drag over the browser content. Browser window about 1280px wide. |
| `screenshot-dark.png` | The same view in dark mode | Windows **Settings → Personalization → Colors → Dark**, or Chrome DevTools → `Ctrl + Shift + P` → "Emulate CSS prefers-color-scheme: dark" |
| `fallback.png` | The blue "main model was busy" note | Mock mode, ask: `explain streaming (busy)` |
| `demo.gif` | 10 to 15 seconds: type a question, answer streams in, then ask another and press **Stop** halfway | Record with [ScreenToGif](https://www.screentogif.com) (free). Keep it under about 8 MB so GitHub shows it. |

Optional extra: the error state. Ask `overloaded` in mock mode to show the Retry countdown.

Before taking screenshots:
- Zoom the browser to 100% and hide bookmarks bar (`Ctrl + Shift + B`).
- Close DevTools.
- Crop out the browser tabs and address bar, or keep the address bar only if it shows your live URL.
