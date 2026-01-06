/**
 * Retry utility with exponential backoff
 */

const RetryConfig = {
  maxAttempts: 10,
  initialDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
  totalTimeout: 180000, // 3 minutes
  backoffFactor: 1.5,
};

/**
 * Execute a function with retry and exponential backoff
 * @param {function} fn - Async function to execute (receives attempt number)
 * @param {object} options
 * @param {number} options.maxAttempts - Maximum attempts (default: 10)
 * @param {number} options.initialDelay - Initial delay in ms (default: 2000)
 * @param {number} options.maxDelay - Maximum delay between retries in ms (default: 30000)
 * @param {number} options.totalTimeout - Total timeout in ms (default: 180000)
 * @param {number} options.backoffFactor - Backoff multiplier (default: 1.5)
 * @param {function} options.onRetry - Callback on each retry
 * @param {function} options.shouldRetry - Function to determine if should retry (default: always)
 * @returns {Promise<any>}
 */
async function withRetry(fn, options = {}) {
  const config = { ...RetryConfig, ...options };
  let delay = config.initialDelay;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    // Check total timeout
    if (Date.now() - startTime > config.totalTimeout) {
      throw new Error(`Retry timeout exceeded (${config.totalTimeout}ms)`);
    }

    try {
      return await fn(attempt);
    } catch (error) {
      // Check if we should retry
      if (config.shouldRetry && !config.shouldRetry(error, attempt)) {
        throw error;
      }

      // Last attempt - throw error
      if (attempt === config.maxAttempts) {
        throw error;
      }

      // Notify retry callback
      if (config.onRetry) {
        config.onRetry({
          attempt,
          maxAttempts: config.maxAttempts,
          error,
          nextDelayMs: delay,
          elapsedMs: Date.now() - startTime,
        });
      }

      // Wait before retry
      await sleep(delay);

      // Increase delay with backoff
      delay = Math.min(delay * config.backoffFactor, config.maxDelay);
    }
  }
}

/**
 * Retry with simple configuration
 * @param {function} fn
 * @param {number} attempts
 * @param {number} delayMs
 * @returns {Promise<any>}
 */
async function retrySimple(fn, attempts = 3, delayMs = 1000) {
  return withRetry(fn, {
    maxAttempts: attempts,
    initialDelay: delayMs,
    maxDelay: delayMs,
    backoffFactor: 1,
    totalTimeout: attempts * delayMs * 2,
  });
}

/**
 * Sleep for specified duration
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a debounced function
 * @param {function} fn
 * @param {number} delayMs
 * @returns {function}
 */
function debounce(fn, delayMs) {
  let timeoutId = null;

  return function (...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Create a throttled function
 * @param {function} fn
 * @param {number} limitMs
 * @returns {function}
 */
function throttle(fn, limitMs) {
  let lastRun = 0;

  return function (...args) {
    const now = Date.now();

    if (now - lastRun >= limitMs) {
      lastRun = now;
      return fn.apply(this, args);
    }
  };
}

module.exports = {
  RetryConfig,
  withRetry,
  retrySimple,
  sleep,
  debounce,
  throttle,
};
