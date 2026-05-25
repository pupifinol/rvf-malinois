import nest from '@rvf/config/eslint/nest';

// F4.4F closes the F4.2B quarantine: every feature directory is now back on
// the F4 client and lint-clean. This config no longer needs to layer
// additional `ignores` over the inherited Nest config. See
// docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md.
export default nest;
