<div style="text-align: center; margin-bottom: 20px">
  <img style="max-width: 200px" src="./src/assets/fukidashi.png" alt="Fukidashi" />
</div>

# Fukidashi

A Chrome extension.

## Development

- Written in TypeScript and React
- Built with the [WXT](https://wxt.dev) framework
- Formatted and linted with [Biome](https://biomejs.dev)

```shell
pnpm install
pnpm run dev
```

## Commands

| Command            | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `pnpm run dev`     | Start the dev server for Chrome                        |
| `pnpm run build`   | Produce a production build in `dist/`                  |
| `pnpm run zip`     | Create a store-ready archive                           |
| `pnpm run compile` | Type check with TypeScript                             |
| `pnpm run test`    | Run Vitest once with coverage                          |
| `pnpm run check`   | Apply Biome's fixes (format, lint, import sorting)     |
| `pnpm run ci`      | Run Biome in check-only mode (for CI)                  |

## Structure

```
src/
├── entrypoints/   Extension entrypoints (background / content / popup)
├── components/    React components
├── services/      Shared logic for browser APIs, storage, messaging
└── assets/        Assets imported from code
public/icon/       Extension icons (picked up automatically by WXT)
```

## License

MIT
