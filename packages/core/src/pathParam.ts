/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 */

/** Thrown for a path parameter that cannot stay inside one upstream segment. */
export class InvalidPathParamError extends Error {
  readonly status = 400;

  constructor(readonly param?: string) {
    super(
      param ? `Invalid route parameter "${param}"` : "Invalid route parameter",
    );
    this.name = "InvalidPathParamError";
  }
}

/**
 * `.` and `..` survive encodeURIComponent unchanged, and fetch then resolves
 * them, moving the upstream request (and the token it carries) to another path.
 */
export function isDotSegment(value: string): boolean {
  return value === "." || value === "..";
}

/**
 * Encodes a decoded route parameter as a single upstream path segment, refusing
 * empty and dot-segment values.
 */
export function encodePathParam(value: string, param?: string): string {
  if (typeof value !== "string" || value === "" || isDotSegment(value)) {
    throw new InvalidPathParamError(param);
  }

  return encodeURIComponent(value);
}
