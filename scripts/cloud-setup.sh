#!/usr/bin/env bash
# Prepares a fresh machine (a Claude Code cloud session, a new laptop) to run
# every check: dependencies, then a Chromium for Playwright. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules ] || npm ci

# Playwright's own Chromium, if it is installed or can be downloaded.
# --with-deps also installs the system libraries, which takes root and a
# network that allows apt; without it the browser alone may lack a library.
if node -e "process.exit(require('fs').existsSync(require('@playwright/test').chromium.executablePath()) ? 0 : 1)" 2>/dev/null; then
  exit 0
fi
if npx playwright install --with-deps chromium >/dev/null 2>&1 || npx playwright install chromium >/dev/null 2>&1; then exit 0; fi

# Downloads can be blocked (cloud sessions allow only some hosts). Any Chromium
# will do for these tests, whatever its version, so use one already on the
# machine: Playwright's config reads PLAYWRIGHT_CHROMIUM_EXECUTABLE.
for candidate in "${PLAYWRIGHT_BROWSERS_PATH:-}"/chromium-*/chrome-linux*/chrome "$(command -v chromium chromium-browser google-chrome 2>/dev/null | head -n1)"; do
  if [ -x "$candidate" ]; then
    echo "cloud-setup: could not download Chromium; using $candidate (set PLAYWRIGHT_CHROMIUM_EXECUTABLE to it)." >&2
    # Claude Code sessions: make it visible to every later command.
    [ -z "${CLAUDE_ENV_FILE:-}" ] || echo "export PLAYWRIGHT_CHROMIUM_EXECUTABLE='$candidate'" >>"$CLAUDE_ENV_FILE"
    exit 0
  fi
done
echo "cloud-setup: no Chromium available: download failed and none is installed." >&2
exit 1
