/**
 * Retry utilities for Pinecone operations
 * Implements exponential backoff with jitter for transient errors
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableStatusCodes?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 60000, // 60 seconds
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Exponential backoff with jitter
 * Prevents thundering herd problem
 */
function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * exponentialDelay * 0.1; // 10% jitter
  return exponentialDelay + jitter;
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: any, retryableStatusCodes: number[]): boolean {
  // Check for status code in error
  const status = error?.status || error?.statusCode || error?.response?.status;

  if (status && retryableStatusCodes.includes(status)) {
    return true;
  }

  // Check for specific error types
  const errorName = error?.name || '';
  if (errorName.includes('Timeout') || errorName.includes('Unavailable')) {
    return true;
  }

  // Check error message for network issues
  const message = error?.message || '';
  if (
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    message.includes('network')
  ) {
    return true;
  }

  return false;
}

/**
 * Retry a Pinecone operation with exponential backoff
 *
 * @example
 * ```typescript
 * const results = await retryOperation(
 *   () => index.query({ vector: embedding, topK: 10 }),
 *   { maxRetries: 5 }
 * );
 * ```
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error, opts.retryableStatusCodes)) {
        console.error('Non-retryable error encountered:', {
          name: error?.name,
          status: error?.status,
          message: error?.message,
        });
        throw error;
      }

      // Calculate backoff and wait
      const delay = calculateBackoff(attempt, opts.baseDelay, opts.maxDelay);

      console.warn(`Pinecone operation failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${Math.round(delay)}ms...`, {
        error: error?.message,
        status: error?.status,
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.error('Pinecone operation failed after max retries:', {
    maxRetries: opts.maxRetries,
    lastError: lastError?.message,
  });

  throw lastError;
}

/**
 * Validates a metadata filter object before querying
 * Prevents common filter syntax errors
 */
export function validateMetadataFilter(filter: Record<string, any>): void {
  // Check for invalid top-level operators
  const topLevelKeys = Object.keys(filter);
  for (const key of topLevelKeys) {
    if (key.startsWith('$') && key !== '$and' && key !== '$or') {
      throw new Error(
        `Invalid top-level operator: ${key}. Only $and and $or are allowed at the top level.`
      );
    }
  }

  // Check for null values
  function checkForNull(obj: any, path: string = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (value === null) {
        throw new Error(
          `Null metadata value at ${currentPath}. Remove the key instead of setting it to null.`
        );
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        checkForNull(value, currentPath);
      }
    }
  }

  checkForNull(filter);
}
