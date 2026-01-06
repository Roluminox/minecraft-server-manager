/**
 * Result type for operations that might fail
 * Alternative to throwing exceptions for expected failures
 *
 * Usage:
 *   const result = await someOperation();
 *   if (result.ok) {
 *     console.log(result.value);
 *   } else {
 *     console.error(result.error);
 *   }
 */

/**
 * Create a success result
 * @template T
 * @param {T} value
 * @returns {{ok: true, value: T}}
 */
function ok(value) {
  return { ok: true, value };
}

/**
 * Create a failure result
 * @template E
 * @param {E} error
 * @returns {{ok: false, error: E}}
 */
function err(error) {
  return { ok: false, error };
}

/**
 * Wrap an async function to return Result instead of throwing
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ok: true, value: T} | {ok: false, error: Error}>}
 */
async function tryCatch(fn) {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(error);
  }
}

/**
 * Wrap a sync function to return Result instead of throwing
 * @template T
 * @param {() => T} fn
 * @returns {{ok: true, value: T} | {ok: false, error: Error}}
 */
function tryCatchSync(fn) {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    return err(error);
  }
}

/**
 * Unwrap a result, throwing if it's an error
 * @template T
 * @param {{ok: boolean, value?: T, error?: Error}} result
 * @returns {T}
 */
function unwrap(result) {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 * @template T
 * @param {{ok: boolean, value?: T, error?: Error}} result
 * @param {T} defaultValue
 * @returns {T}
 */
function unwrapOr(result, defaultValue) {
  return result.ok ? result.value : defaultValue;
}

/**
 * Map over a result value
 * @template T, U
 * @param {{ok: boolean, value?: T, error?: Error}} result
 * @param {(value: T) => U} fn
 * @returns {{ok: boolean, value?: U, error?: Error}}
 */
function map(result, fn) {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Chain results (flatMap)
 * @template T, U
 * @param {{ok: boolean, value?: T, error?: Error}} result
 * @param {(value: T) => {ok: boolean, value?: U, error?: Error}} fn
 * @returns {{ok: boolean, value?: U, error?: Error}}
 */
function flatMap(result, fn) {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

module.exports = {
  ok,
  err,
  tryCatch,
  tryCatchSync,
  unwrap,
  unwrapOr,
  map,
  flatMap,
};
