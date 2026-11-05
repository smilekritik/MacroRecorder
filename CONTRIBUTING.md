# Contributing to Macro Recorder

Bug reports and focused pull requests are welcome.

## Setup

Install the tools listed under [Build from source](README.md#build-from-source), then run:

```bat
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```

The examples below use `pnpm`. Run `corepack enable` once to use it directly, or prefix each command with `corepack`.

## Running the app from source

```bat
pnpm run build
pnpm start
```

After changing only TypeScript, `pnpm run build:ui` skips the slower Rust compile. There is no hot reload, so rebuild and restart to see a change.

> [!WARNING]
> `pnpm start` uses your real library in `%LocalAppData%\MacroRecorder`. To keep development data apart, test with the portable build, which stores data beside its exe.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run build` | Compiles the native addon and bundles the app into `artifacts\desktop\bundle` |
| `pnpm run build:ui` | The same, without recompiling Rust |
| `pnpm run package` | Creates the portable build, installer and ZIP in `artifacts\packages` |
| `pnpm run verify:package` | Checks embedded EXE icons, package contents, size budgets, checksums and that the native addon loads |
| `pnpm run typecheck` | Type-checks the TypeScript code |
| `pnpm run lint` | Runs ESLint |
| `pnpm run format` | Formats the code with Prettier |
| `pnpm test` | Unit tests |
| `pnpm run test:compatibility` | Checks that macro files and settings from earlier versions still load and behave the same |
| `pnpm run test:rust` | Rust tests |
| `pnpm run test:ui:packaged` | End-to-end tests on the packaged exe. They send real input, so leave the PC alone |
| `pnpm run test:ui:simulated` | End-to-end tests with a simulated native layer |
| `pnpm run bench` | Measures playback timing of the native engine |
| `pnpm run check` | Type check, lint, unit, compatibility and Rust tests |
| `pnpm run release` | Check, build and package verification (`build.bat --full`); no UI tests |

Run `pnpm run check` before opening a pull request.

## Optional UI tests

UI tests launch Electron windows. The packaged suite also sends real keyboard and mouse input. They are excluded from `pnpm test`, `pnpm run check`, `pnpm run release` and both `build.bat` modes.

Run them only when you want to check interface workflows and can leave the PC idle:

```bat
pnpm run test:ui:simulated
```

To test the actual executable, build and package it first, then run:

```bat
pnpm run build
pnpm run package
pnpm run test:ui:packaged
```

Both suites use isolated test profiles. They open windows on your desktop, so choose when to run them.

## Where things go

See [Project layout](README.md#project-layout) and [docs/architecture.md](docs/architecture.md). The dependency direction is:

```text
apps/desktop  ->  packages/*  ->  packages/contracts
apps/desktop  ->  native addon (main process only)
```

- The renderer never touches Node, Electron or the native addon directly. It goes through the preload bridge and the IPC schemas in `packages/contracts`.
- Timing-sensitive code belongs in `native/`, never in JavaScript.
- Unit tests sit next to the code in `__tests__` folders. `tests/` holds suites that span packages.

## Conventions

- **English** for code, comments, commit messages and documentation.
- **Interface text** uses the English string as its key: `t('Save changes')`. Add the Russian translation to `packages/localization/src/catalogs/ru.json`. A test fails if a key has no translation.
- **Time** is stored in microseconds everywhere and shown in milliseconds in the editor.
- Match the surrounding style and keep changes small. Formatting follows `.editorconfig` and Prettier, and `cargo fmt` for Rust files you touch.
- Add or update tests when behavior changes.

## Bundled drivers

Packaging uses the pinned `resedit` and `pe-library` development dependencies to embed `apps/desktop/resources/icon.ico` in the app and setup executables. The package check compares every embedded icon image against that file without launching application windows.

`apps/desktop/resources/drivers` holds the ViGEmBus and HidHide installers. They are committed so the app can install them without a download. The first source build still downloads Node and Rust dependencies. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Pull requests

- Keep each pull request to one change, and describe what changed and how you checked it.
- Use [Conventional Commits](https://www.conventionalcommits.org/) style messages, such as `fix(playback): release held keys on stop`.
- Report security problems privately, as described in [SECURITY.md](SECURITY.md).
