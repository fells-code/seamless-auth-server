/**
 * Where this package writes its diagnostics.
 *
 * Only the two levels it actually uses. Keeping the interface at what is needed
 * means an adopter can satisfy it with an object literal, and a platform logger
 * (`pino`, `console`, a Fastify `request.log`) already does.
 */
export interface SeamlessLogger {
  warn(message: string): void;
  error(message: string): void;
}

const consoleLogger: SeamlessLogger = {
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

let activeLogger: SeamlessLogger = consoleLogger;

/**
 * Routes this package's diagnostics somewhere other than `console`.
 *
 * Serverless and edge runtimes often ship logs through a platform logger, and a
 * structured setup wants these as events rather than strings. Without this an
 * adopter cannot capture, level, or silence them: an adapter that logs through
 * its own logger still leaks core's lines to `console`, so one request produces
 * output in two places.
 *
 * Pass nothing to go back to `console`.
 */
export function setSeamlessLogger(logger?: SeamlessLogger): void {
  activeLogger = logger ?? consoleLogger;
}

/** The logger in effect. Read per call, so a later swap takes effect. */
export function getSeamlessLogger(): SeamlessLogger {
  return activeLogger;
}
