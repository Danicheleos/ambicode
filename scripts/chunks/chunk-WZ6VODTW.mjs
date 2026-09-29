#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);

// src/util/errors.ts
var AmbicodeError = class extends Error {
  code;
  field;
  details;
  constructor(code, message, options = {}) {
    super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = "AmbicodeError";
    this.code = code;
    this.field = options.field;
    this.details = options.details ?? [];
  }
};
function isAmbicodeError(value) {
  return value instanceof AmbicodeError;
}

export {
  AmbicodeError,
  isAmbicodeError
};
