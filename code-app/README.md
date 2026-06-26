# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Activation: routing, reachability gate, and verification

This app fans out from a single entry (`src/main.tsx`). Two governance aids keep the
surface honest:

### Reachability gate — `npm run audit:reachability`
`scripts/reachability-audit.mjs` walks static + dynamic relative imports from
`src/main.tsx` and reports reachable vs orphaned non-test sources. Any orphan that is
**not** allow-listed in `src/navigation/intentionallyUnrouted.ts` (each entry carries a
`reason` + `plannedPhase`) fails the gate, so orphaning can only ever go down. As a
subsystem is routed, regenerate/trim the allow-list and the gate tightens automatically.

### Feature surfaces — `/surfaces/:surfaceKey`
Previously-unrouted subsystems are surfaced read-only behind **default-off** route flags
(`src/navigation/featureSurfaceFlags.ts`) and the owning workspace's `WorkspaceGate`
(`src/navigation/featureSurfaces.tsx`). Flag off → an honest "not yet enabled" state;
flag on → a read-only preview wrapped in a fail-soft error boundary. These flags are
routing/visibility only — they enable **no** writes. `featureSurfaceGovernance.test.ts`
fails if a routed surface's entry module is still orphaned (claimed-wired vs reachable).

### One-shot gate — `npm run verify`
Chains `power:schemas:ensure → tsc -b → vitest run → audit:reachability → vite build`.
(`npm run lint` is run separately; the repo currently carries pre-existing eslint-10 rule
debt in files outside this work.)

### Deploy manifest
`.power/schemas/appschemas/dataSourcesInfo.ts` is gitignored. `npm run build` writes a
**build-only fallback** via the preflight; a real deployment must use the genuine
`pac code` artifact for the target environment (the fallback is offline-only and carries
no secrets).
