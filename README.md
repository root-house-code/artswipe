# Artswipe

Swipe-to-discover art prototype. Vite + React + Tailwind. Hits the Art Institute of Chicago's public API by default, with a Harvard Art Museums fallback wired in.

## Quick start

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). To view on your phone while developing, run `npm run dev -- --host` and hit your laptop's LAN IP from the phone.

## Switching catalog source

The app reads from AIC by default. To swap to Harvard:

1. Get a free API key: https://harvardartmuseums.org/collections/api
2. Copy `.env.example` to `.env.local`
3. Set `VITE_CATALOG_SOURCE=harvard` and `VITE_HARVARD_API_KEY=your_key_here`
4. Restart `npm run dev`

No code changes needed. Both sources return the same normalized shape.

## Project layout

```
src/
├── App.jsx              # main component (UI unchanged from artifact)
├── main.jsx             # React entry point
├── index.css            # Tailwind imports
├── api/
│   ├── index.js         # source selector (AIC or Harvard)
│   ├── aic.js           # Art Institute of Chicago client
│   └── harvard.js       # Harvard Art Museums client
└── storage/
    └── storage.js       # localStorage wrapper mimicking artifact API
```

## What works, what doesn't

**Works locally:**
- Real catalog from AIC (no API key needed)
- Swipe, collect, browse collection — all persisted in localStorage
- Comparison with other users **on the same browser** (different handles)

**Doesn't work yet:**
- Comparison across devices. The `storage.set(key, value, true)` "shared" flag currently just writes to localStorage, which is per-browser. For real cross-user comparison you need a backend. Easiest options: Supabase (add a `users` table keyed by handle), Firebase Realtime Database, or a tiny Express server with a SQLite file.

## Common gotchas

- AIC throttles requests to ~1/sec for scraping. We fetch 100 items per page, which is plenty and well under the limit.
- Not all AIC items have images. The API client filters these out and also filters to `is_public_domain=true` to avoid serving images you don't have rights to display.
- If you see CORS errors in the browser console, check that you're not accidentally running this inside another sandboxed iframe.

## Next steps for production

1. **Backend for shared comparison** — Supabase is the fastest path. One table: `users(handle TEXT PRIMARY KEY, liked JSONB, updated_at TIMESTAMP)`. Swap the `shared: true` path in `storage.js` for Supabase client calls.
2. **Port to mobile** — This is pure React with no DOM-specific tricks. The swipe logic uses pointer events that work on touch. To go native: `npx create-expo-app` and port the component; replace the CSS classes with NativeWind or styled-components, replace `<img>` with `<Image>` from React Native, and replace localStorage with AsyncStorage. The API and storage modules transfer unchanged.
3. **Real art prints integration** — Museum APIs are great for discovery, but for a commercial prints app you'd want a supplier API (Society6, Redbubble, or your own print-on-demand fulfillment). The catalog shape is the same, just swap the source.

## Debugging

Open the browser console. The API client logs every fetch and every filtered-out item so you can see what's happening.

To clear all local data and start fresh:

```js
// Paste in browser console
Object.keys(localStorage).filter(k => k.startsWith('artswipe:')).forEach(k => localStorage.removeItem(k))
location.reload()
```
