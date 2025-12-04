/**
 * Structured logging for Pinecone operations
 * Enables better observability and debugging
 */

interface QueryMetrics {
  operation: 'query' | 'upsert' | 'delete' | 'fetch';
  indexName: string;
  namespace?: string;
  topK?: number;
  filterKeys?: string[];
  durationMs: number;
  resultCount?: number;
  error?: string;
  userId?: string;
  opCoCode?: string;
}

/**
 * Log Pinecone query metrics
 */
export function logPineconeMetrics(metrics: QueryMetrics): void {
  const logData = {
    timestamp: new Date().toISOString(),
    service: 'pinecone',
    ...metrics,
  };

  if (metrics.error) {
    console.error('Pinecone operation failed:', logData);
  } else {
    console.log('Pinecone operation:', logData);
  }

  // In production, send to monitoring service (Datadog, New Relic, etc.)
  // Example: sendToMonitoring(logData);
}

/**
 * Wrapper to measure and log Pinecone operations
 */
export async function measureOperation<T>(
  operation: () => Promise<T>,
  metrics: Omit<QueryMetrics, 'durationMs' | 'resultCount' | 'error'>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;

    // Extract result count if available
    let resultCount: number | undefined;
    if (result && typeof result === 'object') {
      if ('matches' in result && Array.isArray((result as any).matches)) {
        resultCount = (result as any).matches.length;
      } else if (Array.isArray(result)) {
        resultCount = result.length;
      }
    }

    logPineconeMetrics({
      ...metrics,
      durationMs,
      resultCount,
    });

    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    logPineconeMetrics({
      ...metrics,
      durationMs,
      error: error?.message || 'Unknown error',
    });

    throw error;
  }
}
