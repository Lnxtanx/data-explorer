// =============================================================================
// Production-safe application logger
// All console output is silenced in production builds so end users never see
// application internals, error payloads, or cache handles in the browser
// console. Full detail is available during development (vite dev / test).
// =============================================================================

const enabled = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (enabled) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (enabled) console.info(...args);
  },
  log: (...args: unknown[]) => {
    if (enabled) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (enabled) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (enabled) console.error(...args);
  },
};