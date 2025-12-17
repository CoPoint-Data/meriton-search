// Debug endpoint to test Pinecone connectivity
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  // Check environment
  results.runtime = process.env.NEXT_RUNTIME;
  results.isNode = !!process.versions?.node;
  results.nodeVersion = process.versions?.node;

  // Check env vars (without revealing secrets)
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;

  const openaiKey = process.env.OPENAI_API_KEY;
  results.envVars = {
    PINECONE_API_KEY_SET: !!apiKey,
    PINECONE_API_KEY_LENGTH: apiKey?.length,
    PINECONE_API_KEY_PREFIX: apiKey?.substring(0, 10),
    PINECONE_API_KEY_HAS_WHITESPACE: apiKey ? /\s/.test(apiKey) : null,
    PINECONE_API_KEY_HAS_NEWLINES: apiKey ? /[\r\n]/.test(apiKey) : null,
    PINECONE_INDEX_NAME: indexName,
    OPENAI_API_KEY_SET: !!openaiKey,
    OPENAI_API_KEY_LENGTH: openaiKey?.length,
    OPENAI_API_KEY_PREFIX: openaiKey?.substring(0, 10),
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

      // Test 3: Query with a random vector (1536 dimensions)
      try {
        console.log('Testing Pinecone query with random vector...');
        const randomVector = Array.from({ length: 1536 }, () => Math.random() - 0.5);
        const queryResult = await index.query({
          vector: randomVector,
          topK: 3,
          includeMetadata: true,
        });
        results.sdkQueryRandom = {
          success: true,
          matchCount: queryResult.matches?.length || 0,
          firstMatch: queryResult.matches?.[0] ? {
            id: queryResult.matches[0].id,
            score: queryResult.matches[0].score,
            hasMetadata: !!queryResult.matches[0].metadata,
          } : null,
        };
      } catch (queryError: any) {
        results.sdkQueryRandomError = {
          message: queryError.message,
          name: queryError.name,
          cause: queryError.cause ? JSON.stringify(queryError.cause) : undefined,
          stack: queryError.stack?.split('\n').slice(0, 5).join('\n'),
        };
      }

      // Test 4: OpenAI embedding + Pinecone query - test each step separately
      // Step 4a: Test raw fetch to OpenAI first
      try {
        console.log('Testing raw fetch to OpenAI...');
        const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: 'test query for invoices',
          }),
        });
        const openaiData = await openaiResponse.json();
        if (openaiResponse.ok) {
          results.openaiRawFetch = {
            success: true,
            status: openaiResponse.status,
            dimensions: openaiData.data?.[0]?.embedding?.length,
          };
        } else {
          results.openaiRawFetch = {
            success: false,
            status: openaiResponse.status,
            error: openaiData,
          };
        }
      } catch (rawOpenaiError: any) {
        results.openaiRawFetchError = {
          message: rawOpenaiError.message,
          name: rawOpenaiError.name,
        };
      }

      // Step 4b: Create OpenAI embedding using SDK
      try {
        console.log('Testing OpenAI SDK embedding...');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: 'test query for invoices',
        });
        const embedding = embeddingResponse.data[0].embedding;
        results.openaiSdkEmbedding = {
          success: true,
          dimensions: embedding.length,
          first5Values: embedding.slice(0, 5),
        };

        // Step 4b: Query Pinecone WITHOUT filter using real embedding
        // Create a NEW Pinecone client to avoid any connection reuse issues
        try {
          console.log('Testing Pinecone query with real embedding (fresh client, no filter)...');
          const { Pinecone: Pinecone2 } = await import('@pinecone-database/pinecone');
          const pc2 = new Pinecone2({ apiKey: apiKey || '' });
          const index2 = pc2.Index(indexName!);

          const queryNoFilter = await index2.query({
            vector: embedding,
            topK: 5,
            includeMetadata: true,
          });

          results.queryWithEmbeddingNoFilter = {
            success: true,
            pineconeMatches: queryNoFilter.matches?.length || 0,
            firstMatch: queryNoFilter.matches?.[0] ? {
              id: queryNoFilter.matches[0].id,
              score: queryNoFilter.matches[0].score,
            } : null,
          };
        } catch (noFilterError: any) {
          results.queryWithEmbeddingNoFilterError = {
            message: noFilterError.message,
            name: noFilterError.name,
            cause: noFilterError.cause ? JSON.stringify(noFilterError.cause) : undefined,
            stack: noFilterError.stack?.split('\n').slice(0, 5).join('\n'),
          };
        }

        // Step 4c: Query Pinecone WITH filter using real embedding
        // Create ANOTHER fresh Pinecone client
        try {
          console.log('Testing Pinecone query with real embedding (fresh client, WITH filter)...');
          const { Pinecone: Pinecone3 } = await import('@pinecone-database/pinecone');
          const pc3 = new Pinecone3({ apiKey: apiKey || '' });
          const index3 = pc3.Index(indexName!);

          const queryWithFilter = await index3.query({
            vector: embedding,
            topK: 5,
            includeMetadata: true,
            filter: {
              domain: { $eq: 'financial' },
              record_type: { $eq: 'invoice' },
            },
          });

          results.queryWithEmbeddingWithFilter = {
            success: true,
            pineconeMatches: queryWithFilter.matches?.length || 0,
            firstMatch: queryWithFilter.matches?.[0] ? {
              id: queryWithFilter.matches[0].id,
              score: queryWithFilter.matches[0].score,
            } : null,
          };
        } catch (withFilterError: any) {
          results.queryWithEmbeddingWithFilterError = {
            message: withFilterError.message,
            name: withFilterError.name,
            cause: withFilterError.cause ? JSON.stringify(withFilterError.cause) : undefined,
            stack: withFilterError.stack?.split('\n').slice(0, 5).join('\n'),
          };
        }
      } catch (embeddingError: any) {
        results.openaiSdkEmbeddingError = {
          message: embeddingError.message,
          name: embeddingError.name,
        };
      }
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
