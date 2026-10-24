# Read With Them

A basic web-app to keep track of what you read with your children.

You can look up books by barcode, title/author, or add them manually.
The reading history is stored solely in browser cookies and can be
exported in different formats.

## Use it

directly in your (mobile) browser via
[readwiththem.vercel.app](https://readwiththem.vercel.app) or
[pazz.github.io/readwiththem](https://pazz.github.io/readwiththem/).

## Caution

This app is well meaning, somewhat pretty and functional but
was entirely vibe-coded. It has not been properly verified or systematically tested
and may explode at any moment. Use it low expectations.

## Privacy

There are no accounts, no server and no analytics. Everything you log stays in
your browser's storage on your device, which is why the app reminds you to
download a backup now and then. The only things that leave the device are
book lookups: a scanned ISBN or a search term goes to the public catalogues
listed above, and covers load from them.

## Development

Needs Node 22 or later.

```sh
npm ci
npm run dev        # local dev server (add -- --host to try it on a phone)
npm run check      # types, lint, formatting, unit tests
npm run test:e2e   # browser tests against the production build
```

The end-to-end tests use Playwright's Chromium (`npm run setup:browser`), or
any Chromium named by `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Every network call in
them is stubbed. `scripts/cloud-setup.sh` prepares a fresh machine, such as a
Claude Code cloud session, for all of the above.

React, TypeScript and Vite; IndexedDB through Dexie; a service worker from
vite-plugin-pwa. CI runs the checks on every push and pull request; each green
push to `main` is published to GitHub Pages, and Vercel deploys `main` too.

## Licence

[MIT](LICENSE)
