# @macro-recorder/localization

Comprehensive English-source identity localization and full Russian coverage package for Macro Recorder.

## Overview

- **Source Language:** English (`en`), acting as the identity mapping key.
- **Target Language:** Russian (`ru`), with every key translated.
- **Placeholder Formatting:** Numbered format placeholders (`{0}`, `{1}`, etc.) with double-brace escaping (`{{`, `}}`) and cross-language arity validation.
- **Documented Non-Linguistic Legends:** Keyboard physical keycaps, gamepad buttons (`A`, `B`, `LB`, `RB`, etc.), and analog axes (`LS X`, `RT`, etc.) preserve standardized hardware legends and intentionally bypass translation. Mouse button names are fully localized.
- **Live Multi-Window Synchronization:** Reactive language switching in React (`LocalizationProvider`) synchronizes open renderer windows via `BroadcastChannel` without needing an application restart.
- **Static Extraction & Coverage Checks:** Extractor and checker tools scan TypeScript and React code to ensure every user-visible key has a non-empty translation and matching placeholder arity.

## Architecture

```
packages/localization/
├── src/
│   ├── catalogs/
│   │   ├── ru.json           # Russian catalog
│   │   ├── en.json           # English identity catalog
│   │   └── index.ts          # Catalog loader & helpers
│   ├── types.ts              # LanguageCode, LanguageOption, CoverageReport, etc.
│   ├── keys.ts               # LocalizationKey union type and constants
│   ├── format.ts             # formatPlaceholder, extractPlaceholders, validatePlaceholderArity
│   ├── legends.ts            # Non-linguistic hardware legends and mouse button localization
│   ├── manager.ts            # LocalizationManager class, singleton, and t/format helpers
│   ├── react/
│   │   ├── context.ts        # LocalizationContext
│   │   ├── provider.ts       # LocalizationProvider with cross-window broadcast sync
│   │   ├── use-localization.ts
│   │   ├── use-translation.ts
│   │   └── Tr.ts             # <Tr text="..." args={[...]} /> component
│   ├── extraction/
│   │   ├── patterns.ts       # Unescaping and regex patterns
│   │   └── extractor.ts      # Static key extractor
│   ├── checks/
│   │   ├── checker.ts        # Coverage validation engine
│   │   └── cli.ts            # CLI runner for CI / pre-commit checks
│   └── index.ts              # Main entry point
└── tests/
    ├── catalogs.test.ts      # Non-empty and supported language tests
    ├── format.test.ts        # Interpolation, escaping, and arity validation tests
    ├── legends.test.ts       # Virtual keys, gamepad, mouse buttons, legend tests
    ├── manager.test.ts       # State, switching, identity, and fallback tests
    ├── react.test.ts         # React components, hooks, and provider tests
    ├── extraction.test.ts    # Key extraction tests
    └── coverage.test.ts      # Full codebase coverage check & CLI verification
```

## Usage

### Main Process / Vanilla TypeScript

```typescript
import { localizationManager, t, format } from '@macro-recorder/localization';

// English is default identity
console.log(t('Gamepad')); // "Gamepad"
console.log(format('Slot {0}', 1)); // "Slot 1"

// Switch to Russian
localizationManager.setLanguage('ru');
console.log(t('Gamepad')); // "Геймпад"
console.log(format('Slot {0}', 1)); // "Слот 1"
```

### React Renderer

```tsx
import { LocalizationProvider, useLocalization, Tr } from '@macro-recorder/localization';

function App() {
  return (
    <LocalizationProvider syncAcrossWindows={true}>
      <Header />
      <Tr text="Install HidHide" />
      <Tr text="Slot {0}" args={[2]} />
    </LocalizationProvider>
  );
}

function Header() {
  const { language, setLanguage, t } = useLocalization();
  return (
    <button onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}>{t('Settings')}</button>
  );
}
```

### Coverage Check CLI

```bash
# Run coverage checks across codebase
pnpm --filter @macro-recorder/localization run check:coverage
```
