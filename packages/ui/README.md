# @rvf/ui

Foundation of the RVF Malinois industrial design system.

## What is here (Phase F0)

| Piece                            | Purpose                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `src/tokens/tokens.css`          | All design tokens as CSS variables. `data-theme="dark"` and `data-theme="light"`.      |
| `src/tailwind/preset.ts`         | Tailwind preset that maps every utility back to a token.                               |
| `src/primitives/Card.tsx`        | Base container — flat surface, 1 px border, no shadow.                                 |
| `src/primitives/StatusDot.tsx`   | Single point of truth for state color (normal / warn / alarm / critical / stale).      |
| `src/primitives/Button.tsx`      | Industrial-restyled button. No pill shapes, no soft shadows.                           |
| `src/primitives/ConnectionBanner.tsx` | Persistent banner that never lies about data freshness.                          |
| `src/utils/cn.ts`                | `clsx` + `tailwind-merge` helper for safe class composition.                           |

## What is NOT here yet

- `KpiTile`, `TrendChart`, `AlarmRow`, `DataTable`, `MimicCanvas`, `QualityBadge` — these come in F1 once we wire the data primitives and the chart abstraction (uPlot).
- A formatter package — numeric formatting with per-tag precision is needed in F1 for `KpiTile`.

## How a consumer uses this package

### 1. Import the tokens stylesheet once (in the app shell)

```ts
// apps/web/app/layout.tsx
import '@rvf/ui/tokens.css';
```

### 2. Mount the Tailwind preset

```ts
// apps/web/tailwind.config.ts
import preset from '@rvf/ui/tailwind-preset';

export default {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
```

### 3. Set the theme on the HTML root

```tsx
<html data-theme="dark">
```

The same components render in both themes. To switch themes, flip the attribute — no component change.

## Authoring rules

- **Never write a hex color.** A lint rule fails the build. Reach for a semantic token.
- **Never paint a whole card with a state color.** State is communicated with a `StatusDot`, a chip, or a 2 px accent border.
- **Numeric values must be tabular.** Apply `tabular-nums` (Tailwind `font-variant-numeric: tabular-nums`) on any live-updating number.
