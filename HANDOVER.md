# Hand-over: Read With Them prototype

Written for a fresh session picking this up with no prior context. Read `plan.v1.md` first; it is the source of truth for scope and the reasoning behind it. This file covers what has actually been built against that plan, current deployment state, and open items.

## What this is

A local-first PWA for parents to log books read with their children: add a child, log a reading against a book (search, barcode scan, or manual entry), view history, export as CSV/JSON/printable poster. No accounts, no server-side database; all data lives in the browser's IndexedDB. See `plan.v1.md` for the full product boundaries and the reasoning behind the local-first, no-backend design.

Status against the plan: this is further along than a throwaway prototype (the plan's workstream 1, a no-code retention/positioning test, has not been run). Treat feature completeness as real but product validation as not yet done.

## Where it lives

- Code: `https://github.com/pazz/readwiththem` (private, under the `pazz` GitHub account)
- Live: `https://readwiththem.vercel.app`
- Deployment is automatic: the Vercel project is connected to the GitHub repo, so a push to `main` deploys on its own. No manual `vercel --prod` needed.
- Local dev: `npm install`, then `npm run dev` (add `-- --host` to test from a phone on the same Wi-Fi). `npm run build` for a production build.

## Architecture, in brief

- `src/db.ts` — Dexie/IndexedDB schema (`children`, `editions`, `sessions`, `changeLog`).
- `src/storage.ts` — the single storage-adapter boundary. All UI code calls this, never `db` directly. Every write also appends a `changeLog` entry (append-only, unused for now, but the seam the plan wants in place for a future sync backend).
- `src/id.ts` — ID generation. Not `crypto.randomUUID()` directly: that requires a secure context and is `undefined` over plain `http://<lan-ip>`, which is how this gets tested on a phone during development. Falls back to `crypto.getRandomValues()`, which has no such restriction.
- `src/catalogue.ts` — merges `src/openLibrary.ts` (primary) and `src/googleBooks.ts` (gap-filler for missing results or missing covers, per the plan). Amazon was asked about and explicitly ruled out: the plan excludes retailer/affiliate integration from scope.
- `src/BarcodeScanner.tsx` + `src/barcode-detector.d.ts` — uses the native `BarcodeDetector` API where available, falls back to `@zxing/browser` (lazy-loaded, so Chrome/Android users never download it) where it isn't, e.g. Safari. Requires a secure context (HTTPS or localhost) — will not work over the LAN-IP dev URL.
- `src/isbn.ts` — ISBN-13 checksum validation, with a runnable self-check at `scripts/check-isbn.mjs` (`node scripts/check-isbn.mjs`).
- `src/App.tsx` — everything else: views, the `BookCover` component (graceful fallback to a text placeholder when a cover image fails to load), `StarRating`, the local-date helpers.
- PWA: `vite-plugin-pwa` generates the manifest and service worker; icons are in `public/icons/`.

## Known caveats, not yet resolved

- **A4 vs Letter on print/PDF export**: added `@page { size: A4 }` to the print stylesheet. This is a CSS hint, not a guarantee; Android's system print dialog is OS-level and may still default to Letter regardless. A fully reliable fix would mean generating the PDF ourselves (e.g. `jsPDF`) instead of relying on `window.print()`, which is a bigger change from the plan's "browser print as baseline" approach. Not done; flagged, not fixed.
- **Google Books gap-filler quota**: it's the unauthenticated endpoint, which hit a global rate limit (429) during testing from this environment. The app degrades gracefully (Open Library results still show), but real-world cover coverage from Google may be inconsistent until/unless a free API key is added.
- **Open Library cover reliability**: covers occasionally fail to load even when a `cover_i` is returned. Handled with a fallback placeholder (`BookCover` component), not fixed at the source.

## Deliberately not built (matches the plan's stated scope, not an oversight)

- No bundled/cached offline catalogue subset; catalogue lookups are always live network calls.
- No push/reminder notifications.
- No multi-device sync, no accounts, no server-side database.
- No commercial barcode-scanning SDK; native `BarcodeDetector` + a small fallback only.
- No automated test suite beyond the one ISBN self-check script; verification so far has been manual, via Playwright driving a live dev server.

## Suggested next steps

1. If continuing feature work: check with the user for the next concrete ask rather than assuming the next plan workstream — this session has been driven by direct feature requests, not by working through the plan document in order.
2. If picking up the A4/PDF caveat: decide whether `window.print()` + CSS is good enough or whether it's worth adding a PDF-generation library.
3. The plan's workstream 1 (no-code retention/positioning validation) has still not been run. Worth surfacing to the user if the conversation turns to "is this worth building further."
