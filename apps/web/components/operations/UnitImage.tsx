import { cn } from '@rvf/ui';

/**
 * UnitImage — schematic of a skid-mounted multiphase well-testing unit,
 * drawn in the style of a one-line process P&ID rather than an illustration.
 *
 * Discipline:
 *   - single neutral stroke color (text-secondary via currentColor)
 *   - uniform 1 px strokes, non-scaling
 *   - dashed centerlines on vessels (CL convention)
 *   - no fills, no color spots, no decoration
 *
 * Sized via Tailwind classes by the caller (e.g. `w-14 h-9`).
 */
export const UnitImage = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 120 60"
    className={cn('text-text-secondary shrink-0', className)}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="square"
    strokeLinejoin="miter"
  >
    {/* Skid base — flat line + two short legs */}
    <line x1="6" y1="46" x2="114" y2="46" vectorEffect="non-scaling-stroke" />
    <line x1="16" y1="46" x2="16" y2="52" vectorEffect="non-scaling-stroke" />
    <line x1="104" y1="46" x2="104" y2="52" vectorEffect="non-scaling-stroke" />

    {/* Horizontal separator vessel */}
    <rect x="14" y="22" width="58" height="22" rx="11" vectorEffect="non-scaling-stroke" />
    {/* Centerline */}
    <line x1="14" y1="33" x2="72" y2="33" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
    {/* Internal bulkheads */}
    <line x1="28" y1="22" x2="28" y2="44" vectorEffect="non-scaling-stroke" />
    <line x1="58" y1="22" x2="58" y2="44" vectorEffect="non-scaling-stroke" />

    {/* Vertical surge tank */}
    <rect x="80" y="14" width="22" height="30" rx="1.5" vectorEffect="non-scaling-stroke" />
    {/* Tank centerline + level tap */}
    <line x1="91" y1="14" x2="91" y2="44" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
    <line x1="80" y1="22" x2="102" y2="22" vectorEffect="non-scaling-stroke" />

    {/* Pipework — inlet, transfer, outlet */}
    <line x1="6" y1="33" x2="14" y2="33" vectorEffect="non-scaling-stroke" />
    <line x1="72" y1="33" x2="80" y2="33" vectorEffect="non-scaling-stroke" />
    <path d="M 102 30 L 109 30 L 109 14" vectorEffect="non-scaling-stroke" />

    {/* Wellhead riser on the inlet side */}
    <line x1="6" y1="46" x2="6" y2="28" vectorEffect="non-scaling-stroke" />
    <line x1="2" y1="28" x2="10" y2="28" vectorEffect="non-scaling-stroke" />
    {/* Christmas-tree gate symbol */}
    <rect x="4" y="22" width="4" height="6" vectorEffect="non-scaling-stroke" />

    {/* Flare stack — line only, no flame */}
    <line x1="109" y1="14" x2="109" y2="6" vectorEffect="non-scaling-stroke" />
    <line x1="106" y1="6" x2="112" y2="6" vectorEffect="non-scaling-stroke" />

    {/* Inlet pressure gauge symbol — small circle on the inlet pipe */}
    <circle cx="11" cy="29" r="1.6" vectorEffect="non-scaling-stroke" />
  </svg>
);
