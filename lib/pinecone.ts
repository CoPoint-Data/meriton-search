import { Pinecone, Index } from '@pinecone-database/pinecone';

// Note: No singletons - each request creates fresh clients for serverless compatibility

/**
 * Enhanced error class for Pinecone operations
 */
export class PineconeError extends Error {
  public readonly originalError: any;
  public readonly operation: string;
  public readonly details: Record<string, any>;

  constructor(message: string, operation: string, originalError?: any, details?: Record<string, any>) {
    super(message);
    this.name = 'PineconeError';
    this.operation = operation;
    this.originalError = originalError;
    this.details = details || {};
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      operation: this.operation,
      details: this.details,
      originalError: this.originalError ? {
        message: this.originalError.message,
        name: this.originalError.name,
        status: this.originalError.status,
        statusCode: this.originalError.statusCode,
        code: this.originalError.code,
        cause: this.originalError.cause,
        body: this.originalError.body,
      } : null,
    };
  }
}

/**
 * Wrap Pinecone operations with detailed error handling
 */
export async function withPineconeErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Extract all possible error details
    const errorDetails = {
      ...context,
      errorMessage: error?.message,
      errorName: error?.name,
      errorCode: error?.code,
      errorStatus: error?.status || error?.statusCode,
      errorBody: error?.body,
      errorCause: error?.cause ? JSON.stringify(error.cause) : undefined,
      errorResponse: error?.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
      } : undefined,
    };

    // Create a more descriptive error message
    let message = `Pinecone ${operation} failed: ${error?.message || 'Unknown error'}`;

    // Add specific context based on error type
    if (error?.status === 401 || error?.statusCode === 401) {
      message = `Pinecone authentication failed: Invalid API key. Check PINECONE_API_KEY environment variable.`;
    } else if (error?.status === 403 || error?.statusCode === 403) {
      message = `Pinecone access denied: API key may not have access to this index.`;
    } else if (error?.status === 404 || error?.statusCode === 404) {
      message = `Pinecone index not found: Check PINECONE_INDEX_NAME environment variable.`;
    } else if (error?.status === 429 || error?.statusCode === 429) {
      message = `Pinecone rate limit exceeded: Too many requests.`;
    } else if (error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('Connection')) {
      message = `Pinecone network error: Unable to connect to Pinecone API. ${error?.message}`;
    }

    console.error(`[PineconeError] ${operation}:`, JSON.stringify(errorDetails, null, 2));

    throw new PineconeError(message, operation, error, errorDetails);
  }
}

/**
 * Get Pinecone client
 * Creates a fresh client for each request to avoid stale connection issues in serverless
 */
export function getPineconeClient(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;

  if (!apiKey) {
    throw new PineconeError(
      'PINECONE_API_KEY environment variable is not set',
      'initialization',
      null,
      { envVarSet: false }
    );
  }

  // Validate API key format
  if (apiKey.length < 20) {
    throw new PineconeError(
      `PINECONE_API_KEY appears to be invalid (length: ${apiKey.length}, expected: 70+)`,
      'initialization',
      null,
      { apiKeyLength: apiKey.length }
    );
  }

  // Check for common issues
  const trimmedKey = apiKey.trim();

  if (/[\r\n]/.test(apiKey)) {
    throw new PineconeError(
      'PINECONE_API_KEY contains newline characters - this will cause authentication failures',
      'initialization',
      null,
      { hasNewlines: true, apiKeyLength: apiKey.length }
    );
  }

  try {
    // Create fresh client for each request (serverless-friendly)
    const client = new Pinecone({
      apiKey: trimmedKey,
    });
    console.log('[Pinecone] Client created (fresh instance)');
    return client;
  } catch (error: any) {
    throw new PineconeError(
      `Failed to create Pinecone client: ${error?.message}`,
      'initialization',
      error,
      { apiKeyLength: apiKey.length }
    );
  }
}

/**
 * Get index name from environment with validation
 */
export function getIndexName(): string {
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!indexName) {
    throw new Error('PINECONE_INDEX_NAME environment variable is not set');
  }

  // Validate index name format (lowercase, alphanumeric, hyphens)
  if (!/^[a-z0-9-]+$/.test(indexName)) {
    throw new Error(
      `Invalid index name: ${indexName}. Must be lowercase alphanumeric with hyphens.`
    );
  }

  return indexName;
}

/**
 * Get index instance (fresh for each request in serverless)
 */
export function getIndex(indexName?: string): Index {
  const name = indexName || getIndexName();
  const pc = getPineconeClient();
  console.log(`[Pinecone] Index reference created: ${name}`);
  return pc.Index(name);
}

/**
 * Validate that index dimensions match embedding model
 */
export async function validateIndexDimensions(
  expectedDimension: number
): Promise<void> {
  const pc = getPineconeClient();
  const indexName = getIndexName();

  try {
    const indexDescription = await pc.describeIndex(indexName);
    const actualDimension = indexDescription.dimension;

    if (actualDimension !== expectedDimension) {
      throw new Error(
        `Dimension mismatch: Index '${indexName}' has ${actualDimension} dimensions, ` +
        `but embedding model produces ${expectedDimension} dimensions. ` +
        `Please recreate the index or use a different embedding model.`
      );
    }

    console.log(`✓ Index dimension validated: ${actualDimension}`);
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error(
        `Index '${indexName}' not found. Please create the index before running the application.`
      );
    }
    throw error;
  }
}

/**
 * Check if index exists and is ready
 */
export async function checkIndexReady(): Promise<boolean> {
  const pc = getPineconeClient();
  const indexName = getIndexName();

  try {
    const indexDescription = await pc.describeIndex(indexName);
    return indexDescription.status.ready;
  } catch (error: any) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

// Constants
export const EMBEDDING_DIMENSION = 1536; // text-embedding-3-small
export const EMBEDDING_MODEL = 'text-embedding-3-small';
