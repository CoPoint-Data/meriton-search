// Debug endpoint to test Pinecone connectivity
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  // Check environment
  results.runtime = process.env.NEXT_RUNTIME;
  results.isNode = !!process.versions?.node;
  results.nodeVersion = process.versions?.node;

  // Check env vars (without revealing secrets)
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;

  results.envVars = {
    PINECONE_API_KEY_SET: !!apiKey,
    PINECONE_API_KEY_LENGTH: apiKey?.length,
    PINECONE_API_KEY_PREFIX: apiKey?.substring(0, 10),
    PINECONE_API_KEY_HAS_WHITESPACE: apiKey ? /\s/.test(apiKey) : null,
    PINECONE_API_KEY_HAS_NEWLINES: apiKey ? /[\r\n]/.test(apiKey) : null,
    PINECONE_INDEX_NAME: indexName,
  };

  // Test 1: Raw fetch to Pinecone API
  try {
    console.log('Testing raw fetch to Pinecone...');
    const response = await fetch('https://api.pinecone.io/indexes', {
      method: 'GET',
      headers: {
        'Api-Key': apiKey || '',
        'X-Pinecone-API-Version': '2025-01',
      },
    });

    const text = await response.text();
    results.rawFetch = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: response.ok ? JSON.parse(text) : text.substring(0, 500),
    };
  } catch (error: any) {
    results.rawFetch = {
      error: true,
      message: error.message,
      name: error.name,
      cause: error.cause,
    };
  }

  // Test 2: Pinecone SDK
  try {
    console.log('Testing Pinecone SDK...');
    const { Pinecone } = await import('@pinecone-database/pinecone');

    const pc = new Pinecone({
      apiKey: apiKey || '',
    });

    results.sdkInit = { success: true };

    // List indexes
    const indexes = await pc.listIndexes();
    results.sdkListIndexes = {
      success: true,
      indexes: indexes,
    };

    // Get index stats
    if (indexName) {
      const index = pc.Index(indexName);
      const stats = await index.describeIndexStats();
      results.sdkIndexStats = {
        success: true,
        stats: stats,
      };
    }
  } catch (error: any) {
    results.sdkError = {
      message: error.message,
      name: error.name,
      cause: error.cause ? JSON.stringify(error.cause) : undefined,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    };
  }

  return NextResponse.json(results, { status: 200 });
}
