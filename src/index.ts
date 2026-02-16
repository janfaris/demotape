// Public API
export { record, type RecordOptions } from "./recorder.js";
export {
  loadConfig,
  validateConfig,
  DemotapeConfigSchema,
  type DemotapeConfig,
  type Segment,
  type AuthConfig,
  type OutputConfig,
  type OverlayConfig,
} from "./config.js";
export { createCLI } from "./cli.js";
export {
  enforceLicense,
  validateLicenseKey,
  detectProFeatures,
  LicenseError,
} from "./license.js";
