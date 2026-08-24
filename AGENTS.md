# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the extension source code.
- `src/entrypoints/` defines extension entrypoints (background, content, popup, etc.).
- `src/core/` holds pure, side-effect-free logic (create as needed); tests live alongside as `.spec.ts`.
- `src/components/` contains React UI pieces; `src/services/` hosts shared service logic
  (browser APIs, storage, messaging).
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
- Stub `chrome.*` APIs with `vi.stubGlobal` (see `src/services/settings.spec.ts`).
- Run `pnpm run test` before PRs.

## Commit & Pull Request Guidelines
- Commit messages use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `style:`).
- PRs should include a clear summary, tests run, and screenshots for UI changes.
- Link related issues when applicable.

## Security & Configuration Tips
- Extension settings live in `wxt.config.ts`; keep permissions minimal.
- Keep logic in `src/core/` pure and side-effect free for easier review.
- `pnpm-workspace.yaml` lists the only dependencies allowed to run install scripts
  (`allowBuilds`); add an entry deliberately rather than approving everything.
- pnpm rejects lockfile entries published within the last 24 hours (its default minimum
  release age). If a brand-new release trips this, either wait or run
  `pnpm clean --lockfile && pnpm install` to re-resolve.
