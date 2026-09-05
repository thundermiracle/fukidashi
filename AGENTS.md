# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the extension source code.
- `src/entrypoints/` defines extension entrypoints (content, popup, etc.).
- `src/core/` holds pure logic — note types, text anchoring, formatting; tests live alongside as `.spec.ts`.
- `src/components/` contains React UI pieces; `src/services/` hosts shared service logic
  (storage, highlight rendering, messaging).
- `src/services/sync/` holds the cross-device sync layer: the `SyncBackend` interface,
  the pull-merge-push engine, its scheduler, and the per-device config and status
  (`fukidashi:sync:config`, `fukidashi:sync-status`). The scheduler registers its
  listeners synchronously and looks the backend up lazily through
  `loadSyncBackend(config)`, which still returns null — so the background entrypoint
  stays idle. The Drive backend is designed in `docs/sync-design.md`.
- `src/testing/` holds test helpers: fakes for `chrome.storage`, `chrome.alarms`, the
  runtime's start-up events and the sync backend, and the Vitest setup file that fills in `Range.getBoundingClientRect` and
  `Element.scrollIntoView`, which jsdom does not implement.
- `src/assets/` stores assets imported from code; `public/` stores files copied as-is
  (`public/icon/*.png` is picked up by WXT as the extension icon).
- Build output lands in `dist/`; coverage reports in `coverage/`.

## Build, Test, and Development Commands
- `pnpm install` installs dependencies and runs `wxt prepare`. The pnpm version is pinned
  by `packageManager` in `package.json`; Node is pinned by `.nvmrc`.
- `pnpm run dev` starts the WXT dev server for Chrome.
- `pnpm run dev:firefox` runs the dev server for Firefox.
- `pnpm run build` / `pnpm run build:firefox` produce production builds in `dist/`.
- `pnpm run zip` / `pnpm run zip:firefox` create release archives.
- `pnpm run compile` runs a TypeScript type check.
- `pnpm run test` runs Vitest once with coverage; `pnpm run test:watch` watches.
- `pnpm run lint` lints with Biome; `pnpm run format` formats with Biome.
- `pnpm run check` applies Biome's safe fixes (lint + format + import sorting).
- `pnpm run ci` runs Biome in CI mode (no writes, non-zero exit on any issue).

## Coding Style & Naming Conventions
- TypeScript + React with ESM (`"type": "module"`).
- Biome is the single source of truth for formatting and linting; config lives in `biome.json`.
- 2-space indentation, double quotes, 100-column lines — let Biome enforce it.
- Functions and variables use `camelCase`; React components use `PascalCase`.
- Import in-project modules through the `@/` alias (mapped to `src/`).
- Test files end with `.spec.ts` / `.spec.tsx` and mirror the module name.

## Testing Guidelines
- Framework: Vitest with the `jsdom` environment and globals enabled.
- Co-locate tests with the module under test.
- Stub `chrome.*` APIs with `vi.stubGlobal` and `createFakeChromeStorage`
  (see `src/services/notes.spec.ts`).
- `src/entrypoints/content/ContentApp.spec.tsx` drives the real UI in jsdom; extend it when
  a change affects the selection, composer or bubble flow.
- `src/entrypoints/popup/App.spec.tsx` does the same for the popup; extend it when a change
  affects the note list, the site list or moving between them.
- Run `pnpm run test` before PRs.

## Commit & Pull Request Guidelines
- Commit messages use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `style:`).
- PRs should include a clear summary, tests run, and screenshots for UI changes.
- Link related issues when applicable.

## Releasing
- `.github/workflows/release.yaml` releases on a push to `main` when **the last commit**
  touched `package.json` (`HEAD~1..HEAD`), and on a manual run from the Actions tab,
  which releases whatever `target` says whether or not the version moved.
- Because a push only looks at one commit, the version bump has to be the commit that
  lands last — or merge with `--no-ff` so the merge commit carries it. Any other edit to
  `package.json` starts a release too.
- The notes are GitHub's own list of the pull requests merged since the previous
  release. Work pushed straight to `main` is not a pull request and never appears
  there, so anything that should be named in the notes has to land through one.
- A store that already holds the version fails the submission rather than skipping it, so
  retry a half-finished release with a manual run targeting the store that is behind
  (`chrome` or `firefox`), not by re-running the failed job.
- `CHROME_REFRESH_TOKEN` dies after six months without a release: Google revokes refresh
  tokens left unused that long, whatever the consent screen's publishing status. The
  symptom is `invalid_grant` from `oauth2.googleapis.com/token` — `invalid_client` would
  mean the client ID or secret is wrong instead, which is a different repair.
- Get a new one with `node scripts/get-chrome-refresh-token.mjs`, then update that one
  secret. Do not reach for `wxt submit init`: it asks Google for the out-of-band
  redirect, which Google stopped accepting in January 2023, and 6.1.1 still does.

## Security & Configuration Tips
- Extension settings live in `wxt.config.ts`; keep permissions minimal.
- Keep logic in `src/core/` pure and side-effect free for easier review.
- `pnpm-workspace.yaml` lists the only dependencies allowed to run install scripts
  (`allowBuilds`); add an entry deliberately rather than approving everything.
- pnpm rejects lockfile entries published within the last 24 hours (its default minimum
  release age). If a brand-new release trips this, either wait or run
  `pnpm clean --lockfile && pnpm install` to re-resolve.
