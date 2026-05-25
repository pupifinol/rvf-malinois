import nest from '@rvf/config/eslint/nest';

// F4.2B quarantine: the feature directories below depend on the F1/F1.5
// Prisma client (removed in F4.2) and are excluded from typecheck/build via
// `tsconfig.json`. They must also be ignored by ESLint because the typed-lint
// preset (`recommendedTypeChecked`) attempts to type-check every file it
// touches; the quarantined files would fail on removed `@prisma/client`
// exports. The directories are preserved in git for reference during the
// F4.4 rewrite. See
// docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md.
export default [
  ...nest,
  {
    ignores: ['src/equipment/**', 'src/jobs/**', 'src/telemetry/**'],
  },
];
