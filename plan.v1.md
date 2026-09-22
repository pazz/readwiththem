# Read With Them implementation plan

## Revision note

This revises the original full-concept plan after an external critical review. The scope is now deliberately narrowed to a **private-only product**: scanning, logging, and exporting. Discovery/regional trends, collection publishing, and affiliate links are removed from scope entirely, not deferred as a "later" phase, because the review found they added a large share of the compliance and engineering cost for a use case that hadn't yet proven people would use it at all. The most important unresolved risk for this product is retention (does a parent keep logging after week one), not privacy edge cases in features that no longer exist. Validating that risk is now the first workstream, ahead of any code.

## Product definition

Build a UK-first, installable progressive web application for parents to log books read with their children. A parent signs in, maintains one or more child profiles, adds a book by scanning its barcode or searching, records that a reading happened, adds an optional note or rating, and exports the resulting history as a printable monthly poster or a CSV/list. There is no public discovery, no sharing, no social feature, and no affiliate/retail integration in this product. Everything a parent enters stays inside their own household.

The repository contains only `readwiththem app idea.md`; this plan therefore defines a greenfield implementation rather than an extension of existing software.

## Confirmed product boundaries

- Scope is strictly private: scan/search a book, log a reading, note/rate it, view history, export it. Nothing else.
- No public or shared collections, no regional/social discovery, no affiliate or retailer links. These are not phased in later by default; reintroducing any of them requires a fresh product decision, not just unblocking a deferred task.
- Only parents have accounts (when accounts exist at all — see below). Children are represented by profiles, not logins.
- **Storage model: local-first, single-device, no server-side database in v1.** All household data lives in the browser (IndexedDB) on the device the parent uses. There is no cloud Postgres, no server-side personal-data store, and therefore no hosting bill for a database and very little GDPR "processor" surface in this version. This is a deliberate change from the earlier Supabase-cloud-first design, made because the user wants "local and fast" first.
- **The design must not preclude adding sync/multi-device/cloud backup later without a rewrite.** Concretely: give every record a globally unique, client-generated ID (not a server auto-increment); write all mutations as an append-only local event/change log, not just in-place updates; and keep all data access behind a single repository/storage-adapter interface that the rest of the app calls, so IndexedDB can later be replaced or supplemented by a networked adapter. These constraints are cheap to build in from day one and expensive to retrofit.
- The initial market is the United Kingdom; UK GDPR/Children's Code considerations are much lighter in this model since no personal data leaves the device by default, but still apply the moment any optional cloud backup or sync feature is switched on.

## Validate before building

Before any implementation, answer two questions, because they change what "logging" needs to feel like:

1. **Does logging survive two weeks?** Run a no-code test with a handful of families (a shared spreadsheet, form, or paper diary substitute) before writing the app. Manual-logging tools have poor retention by default; if this doesn't survive without an app, an app alone won't fix it.
2. **Does the UK school reading-record habit change the answer?** Many UK primary schools already require parents to log reading in a diary. If this product can slot into that existing, semi-mandatory habit rather than compete with it as a new voluntary one, retention is a materially easier problem, and it may be worth shaping onboarding and language (e.g. "reading diary" rather than "keepsake app") around it. Check current UK products in this space (school reading-record apps, Beanstack-style library trackers) so the product is positioned against what already exists rather than in ignorance of it.

Record the outcome of both before committing engineering time to more than a throwaway prototype.

## Proposed architecture

```text
Installable PWA (Next.js/React, largely static — no required server round-trip for normal use)
  -> storage adapter interface (the only thing the app talks to for data)
       -> v1 implementation: IndexedDB via Dexie.js, on-device only
       -> future implementation(s): same interface backed by a networked API/
          Postgres, or a local-first sync engine (e.g. Yjs/Automerge/ElectricSQL/
          PowerSync) — swappable without touching feature code
  -> append-only local change log per record (id, entity, op, timestamp, payload)
       -> enables offline logging, undo, and is the natural basis for future sync
          (a sync engine replays/merges change logs; it does not need inventing later)
  -> phone camera scanner (BarcodeDetector, then a tested fallback) — secondary to search
  -> catalogue lookups called directly from the client:
       -> local cached copy of a trimmed Open Library children's-books subset (primary)
       -> Google Books API as a gap-filler for missing/incomplete entries
     (no server-side broker needed while there is no server; both APIs support
      unauthenticated/low-volume client calls)
  -> client-side CSV, SVG/canvas poster, and PDF generation (unchanged)
  -> reminder notifications (local scheduled notification API; no server needed)
  -> no authentication in v1 (single device = single implicit "household");
     the household/parent data model still exists in the schema, ready for
     multi-device auth to be added when sync is introduced
```

Use `work` and `edition` as distinct catalogue entities, using Open Library's own work/edition IDs as the primary clustering key rather than deriving new ones. An edition holds ISBNs, format and cover data; a work represents the intellectual book. Sessions and shelves point to editions by stable ID. Provider responses are mapped into application-owned records with provenance, fetch timestamps, cache expiry, and parent-editable fields.

Search is the primary way to add a repeat reading (most households re-read a small, stable set of books), and scanning is the fast path for a genuinely new book. Do not over-invest in low-light/damaged-barcode scanning robustness or a commercial scanning SDK before evidence shows browser-native detection plus manual search is inadequate in practice.

### What "scales later" means concretely

The local-first choice is about where v1 stores data, not a ceiling on the product. Three things, built in from the start, are what make later growth additive rather than a rewrite:

1. **Client-generated stable IDs** (e.g. UUIDs) for every household, child, edition, shelf, session, note. A future server can accept these IDs as-is; nothing needs re-keying.
2. **An append-only change log**, not just current-state tables. This is what a sync engine (self-built or a library like PowerSync/ElectricSQL/Automerge) needs to merge two devices' histories later; retrofitting it after data exists in place-only form is much harder than starting with it.
3. **A single storage-adapter boundary.** Every screen/component calls `storage.getX()` / `storage.saveX()`, never IndexedDB directly. Swapping or extending the adapter to talk to a server is then a backend change, not a UI rewrite.

When you're ready for multi-device or multi-parent use, the natural next step is to add a thin sync server (even a simple one, e.g. Supabase or a small custom API) behind the same storage-adapter interface, using the existing IDs and change log — not to redesign the app.

## Delivery plan

1. **Run the no-code retention and positioning test**
   - Recruit a handful of families and track logging with a spreadsheet, form, or paper-diary substitute for two weeks. Decide whether logging survives without an app.
   - Research the UK school reading-record habit and existing competitors (school reading-diary apps, library summer-reading trackers, general bookshelf trackers). Decide whether to position this as a replacement for an existing mandatory habit, and note it in the product framing either way.
   - Do not proceed past a throwaway prototype until this is done.

2. **Create the application foundation**
   - Initialise a TypeScript Next.js (or a lighter client-only React/Vite) application, a component system, linting, unit-test runner, end-to-end test runner, and PWA manifest/service worker support.
   - Build the storage-adapter interface and its v1 IndexedDB (Dexie.js) implementation, plus the append-only change-log write path, before any feature screens. This is the foundation everything else and all future sync depend on.
   - Implement the design system and responsive mobile-first shell. Ensure touch targets, camera states, export pages, keyboard navigation, colour contrast, and offline behaviour (which is now the *default* state, not an edge case) meet accessibility requirements.
   - Add privacy-preserving observability only, and only if genuinely needed: since there is no server, most operational monitoring in v1 is client-side error logging you choose to review manually, not a hosted telemetry pipeline.

3. **Model households, parents, and children locally**
   - Model a household, one or more parent profiles, and child profiles (name and birth month/year) entirely as local IndexedDB records, with client-generated stable IDs, ready to be synced to a server later without re-keying.
   - Because there is no server and no cross-user access in v1, there is no RLS to write yet; the household boundary is enforced simply by "this is the data on this device." Note this explicitly as a boundary that will need real server-side enforcement (equivalent to the RLS approach in the earlier cloud design) the moment sync/multi-device is added.
   - Add local data export (a full JSON dump) and clear/reset flows so a parent is never without a way to back up or wipe their own data — this substitutes for "account deletion" while there is no account.
   - Skip the DPIA/privacy-notice/Children's Code work for v1's on-device-only data; note it as a pre-build gate for whenever cloud sync or backup is introduced, not now.

4. **Build the bibliographic catalogue and scanning experience**
   - Bundle or lazily fetch a trimmed, children's-books-focused subset of Open Library data (CC0-licensed) for local caching, using Open Library's own work/edition IDs as the clustering key.
   - Call Google Books directly from the client as a gap-filler lookup only for ISBNs missing or incomplete locally, respecting its terms on caching results client-side.
   - Provide title/author/ISBN search over the local catalogue cache and the household's own previously-logged books as the **primary** way to add a reading — most re-reads are of a small, stable set of books already in the household's history. Treat barcode scanning as the fast path for genuinely new books, not the primary interaction.
   - Implement scanning using the browser `BarcodeDetector` API where supported, with a basic fallback library. Request the camera only on user action, validate ISBN check digits locally, and discard camera frames after decoding. Do not invest in low-light/damaged-barcode robustness or a commercial scanning SDK unless real usage shows search-plus-basic-scan is inadequate.
   - Show edition ambiguity clearly, let the parent choose or correct a cover/title/author, and retain an immutable edition snapshot (by stable ID) sufficient for historical exports.
   - Defer general cover-image recognition entirely; it is out of scope for this product.

5. **Deliver the private reading journal**
   - Create shelves/collections, shelf items, reading sessions, notes, and parent-defined ratings, all as local records with stable IDs and change-log entries. Seed rating dimensions from the idea notes: enjoyment, re-read desire, pace/engagement, and longevity, while allowing the parent to hide or rename them.
   - Support multiple child profiles, a book being attached to more than one child, repeat readings, an at-a-glance "read today" action, and history views by child, book, shelf, week, and month.
   - Add duplicate handling, undo (natural given the change log) and edit flows, timezone-aware local reading dates, flexible ordering, and empty/loading/error states.
   - Implement reminder notifications as a first-class habit-support feature: a local scheduled reminder (works without install), and a web-push reminder once the PWA is added to the home screen. Explain the home-screen install step clearly in onboarding, since iOS only allows push after that step and the add-to-home-screen funnel is easily missed behind the share-sheet menu.
   - Explicitly test and document behaviour when local storage is cleared or the device is lost: this is the accepted trade-off of local-first storage in v1, and the export flow (workstream 3) is the mitigation. Make regular export-reminders part of onboarding.

6. **Create exports designed for printing and ownership**
   - Build a monthly poster composer with a title, month/year, child's name (or a parent-chosen display label), aligned cover grid, and print-friendly layouts. Generate SVG/canvas and PDF locally in the browser, with browser print as the baseline.
   - Offer previews and accessible alternatives for users who cannot see covers.
   - Produce CSV and printable list exports for selected children, shelves, date intervals, books, and reading sessions. Define stable columns and UTF-8/Excel compatibility.
   - Note the trade-off explicitly: local-only rendering (and local-only storage generally) is privacy-clean and free to run, but forecloses a paid print-fulfilment feature or true multi-device access until a sync/backend layer is added. Revisit only if that's deliberately chosen later, using the storage-adapter seam already in place.

7. **Validate, release, and operate the service**
   - Add unit tests for ISBN validation, metadata normalisation, date boundaries, poster layout inputs, the storage adapter, and change-log replay/idempotency.
   - Add end-to-end tests for camera-permission denial, manual search fallback, offline logging (which is simply the default path, not a special mode), multi-child reading recording, reminder delivery, exports, and full local export/re-import (the backup/restore path).
   - Test real devices across current iOS Safari, Android Chrome, and desktop browsers, including installed PWA, denied camera access, storage eviction after inactivity on iOS (a materially higher risk now that IndexedDB *is* the only copy of the data — make the export reminder prominent because of this), and printing.
   - Skip cloud-specific operational work (backups, RLS testing, provider status monitoring) for v1, since there is no server; add these to the pre-build gates for a future sync phase instead.

## Initial local data model (IndexedDB stores)

| Group | Stores / purpose |
| --- | --- |
| Identity | `households`, `parents`, `children` — all local, client-generated stable IDs |
| Catalogue | `works`, `editions`, `editionIdentifiers`, `catalogueCache` (from the bundled/fetched Open Library subset plus Google Books gap-fills) |
| Reading | `shelves`, `shelfItems`, `readingSessions`, `bookNotes`, `bookRatings` |
| Sync-readiness | `changeLog` (append-only: id, entity, op, timestamp, payload) — the seam a future sync engine will consume; not used for anything server-side yet |

Every record carries a client-generated stable ID from creation, regardless of whether a server will ever exist for it. There is no server-side schema in v1; a future cloud/sync design can reuse this same shape (as previously drafted with Supabase/Postgres) once it's actually needed.

## Key technical and operational decisions already made

| Decision | Rationale |
| --- | --- |
| Local-first storage (IndexedDB), no server database in v1 | Meets the "local and fast" requirement directly: no network round-trip for normal use, no hosting bill, minimal GDPR processor surface. |
| Storage-adapter interface + stable client-generated IDs + append-only change log | These three seams are what let sync/multi-device/cloud backup be added later as an additive backend change, not a rewrite. Retrofitting stable IDs or a change log onto a place-only data model later is materially harder than building them in now. |
| No accounts/auth in v1 | There is nothing to authenticate against yet with a single on-device store; auth is reintroduced when a server exists for sync. |
| Local barcode decoding, search-first logging | Keeps camera frames off any external service and matches the real usage pattern (mostly re-reads of known books). |
| Open Library as the catalogue spine, Google Books as gap-filler, both called client-side | Avoids needing a server just to broker catalogue lookups; both providers support this at low volume. |
| Local export generation and full local JSON backup/restore | Substitutes for cloud backup and account deletion while there is no server; also the main mitigation for local-storage data loss. |
| No discovery, sharing, or affiliate features in this product | These carried most of the compliance/engineering cost of the original plan for a use case not yet validated to retain users; removed rather than deferred. |

## Explicitly out of scope for v1

- Any server-side database, hosting, or authentication. (Deliberately deferred, not rejected — see "what scales later" above.)
- Multi-device sync and multi-parent shared households. (Same device only in v1; the data model is ready for this, the sync mechanism is not built.)
- Public or shared collections, social feeds, follower graphs, comments, and any form of publishing.
- Regional/social discovery, trend aggregation, and personalised or curated recommendations.
- Affiliate links, retailer integration, and any commercial book-discovery surface.
- General book-cover recognition and cloud vision uploads.
- Child accounts and child authentication.
- Native iOS/Android applications, unless PWA real-device evaluation shows an unresolvable capability gap.

Reintroducing sync/backend features later is expected and designed for; reintroducing discovery/sharing/affiliate features is a fresh product decision requiring its own scoping.

## Pre-build gates

1. Complete the no-code retention/positioning test (workstream 1) and record the outcome, including the school-reading-record and competitor findings.
2. Confirm a trimmed Open Library children's-books subset is workable to bundle/cache client-side for coverage and size, using representative UK children's books as the test set.
3. Decide and document the export/backup reminder cadence in onboarding, given that local storage is the only copy of the data in v1.
4. When (not if, if you proceed to sync) cloud sync/backup is introduced later: choose and contract hosting/database/auth providers, and complete a DPIA and privacy notice at that point — this gate is intentionally not required for v1 as scoped.

## Delivery risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Logging is abandoned after the first week or two | Validate with the no-code test before building; design reminders and low-friction repeat-logging (search over the household's own books) as core features, not add-ons. |
| Local storage is cleared, or the device is lost/replaced, with no other copy of the data | Prominent, easy, and reminded-about full JSON export; treat this as the primary data-loss mitigation in v1, since there is deliberately no server copy. |
| iOS evicts IndexedDB/PWA storage after a period of inactivity | This is a materially higher-stakes risk now than in a cloud-backed design, since local storage is the *only* copy. Test real iOS devices for eviction behaviour; make the add-to-home-screen step explicit in onboarding (this reduces eviction likelihood); prompt for export before long gaps if detectable. |
| No multi-device or multi-parent access in v1 | Documented as an accepted v1 limitation, not a bug; the storage-adapter/ID/change-log seams exist specifically so this can be added later without a rewrite. |
| Retrofitting sync later turns out to be harder than expected despite the seams | Keep the three seams (stable IDs, append-only change log, storage-adapter boundary) enforced by code review/tests from the start, not added opportunistically; treat any deviation (e.g. an auto-increment ID slipping in) as a defect. |
| Catalogue coverage for UK picture books and older children's titles is incomplete | Use Open Library as the primary source with Google Books as gap-filler; let parents edit editions; monitor lookup-miss rate. |
| iOS browser scan quality varies | Treat search as primary and scanning as a convenience; measure real failure rates before considering any commercial scanning SDK. |
