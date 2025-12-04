import { Pinecone, Index } from '@pinecone-database/pinecone';

let pineconeClient: Pinecone | null = null;
let indexCache: Map<string, Index> = new Map();

/**
 * Get singleton Pinecone client
 * Reuses connection pool across requests
 */
export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;

    if (!apiKey) {
      throw new Error('PINECONE_API_KEY environment variable is not set');
    }

    // Validate API key format
    if (apiKey.length < 20) {
      throw new Error('PINECONE_API_KEY appears to be invalid (too short)');
    }

    pineconeClient = new Pinecone({
      apiKey,
      // Note: maxRetries is not supported in this SDK version
      // Retry logic is implemented via retryOperation wrapper instead
    });

    console.log('Pinecone client initialized successfully');
  }

  return pineconeClient;
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
 * Get cached index instance
 * Reuses index connection for better performance
 */
export function getIndex(indexName?: string): Index {
  const name = indexName || getIndexName();

  if (!indexCache.has(name)) {
    const pc = getPineconeClient();
    indexCache.set(name, pc.Index(name));
    console.log(`Index connection created: ${name}`);
  }

  return indexCache.get(name)!;
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
