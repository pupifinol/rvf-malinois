# @rvf/config

Shared development configuration for the RVF Malinois monorepo.

- **ESLint configs** — `eslint/base.js`, `eslint/react.js`, `eslint/next.js`, `eslint/nest.js`
- **TypeScript presets** — `tsconfig/base.json`, `tsconfig/library.json`, `tsconfig/nextjs.json`, `tsconfig/nestjs.json`

### Enforced architectural rules

| Rule                       | Where               | Why                                                                |
| -------------------------- | ------------------- | ------------------------------------------------------------------ |
| No hex color literals      | `eslint/base.js`    | ISA-101 — components must reference semantic tokens                |
| No cross-layer imports     | `eslint/next.js`    | Engineering doc §4 — primitives never import features/screens     |
| `no-explicit-any`          | `eslint/base.js`    | Engineering doc §8 — telemetry types are contracts                |
| Consistent type-only import| `eslint/base.js`    | Reduces accidental runtime imports in client bundles               |
