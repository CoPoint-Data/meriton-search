# Hybrid RAG Architecture Evolution Plan

> **Document Version**: 1.0
> **Created**: 2024-12-04
> **Status**: Draft
> **Author**: Winston (Architect Agent)

## Executive Summary

This document outlines the evolution of the Meriton Search platform from a **Pinecone-only semantic search POC** to a **production-grade hybrid RAG system** combining Pinecone (semantic) + Elasticsearch (structured) with an intelligent query orchestrator.

The goal: Enable users to ask questions like *"What's the history of our relationship with Acme, and why are they consistently paying late on invoices?"* and receive answers that combine:
- **Structured facts** (invoice amounts, payment dates, AR balances) from Elasticsearch
- **Narrative context** (account manager notes, email threads, ticket history) from Pinecone
- **Computed aggregations** (totals, averages, trends) from SQL warehouse

---

## How Embeddings Work

### Overview

**OpenAI creates the embeddings** that get stored in Pinecone. The embedding is a 1536-dimensional vector that represents the semantic meaning of text. Similar concepts have vectors that are close together in vector space, enabling semantic search.

### Embedding Flow Sequence Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Source    │     │  Ingestion  │     │   OpenAI    │     │  Pinecone   │
│   System    │     │   Service   │     │ Embeddings  │     │   Index     │
│ (QuickBooks)│     │             │     │     API     │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │  1. Raw Invoice   │                   │                   │
       │   Data (JSON)     │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │ 2. Extract text   │                   │
       │                   │    for embedding  │                   │
       │                   │ ┌───────────────┐ │                   │
       │                   │ │ "Invoice 1001 │ │                   │
       │                   │ │ for Acme Corp.│ │                   │
       │                   │ │ Amount: $5000.│ │                   │
       │                   │ │ HVAC repair   │ │                   │
       │                   │ │ service..."   │ │                   │
       │                   │ └───────────────┘ │                   │
       │                   │                   │                   │
       │                   │ 3. POST /embeddings                   │
       │                   │    model: text-embedding-3-small      │
       │                   │    input: <text>  │                   │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │                   │                   │ 4. Generate       │
       │                   │                   │    1536-dim       │
       │                   │                   │    vector         │
       │                   │                   │ ┌───────────────┐ │
       │                   │                   │ │ [0.023, -0.11,│ │
       │                   │                   │ │  0.847, 0.002,│ │
       │                   │                   │ │  ... 1536 ... │ │
       │                   │                   │ │  0.156, -0.44]│ │
       │                   │                   │ └───────────────┘ │
       │                   │                   │                   │
       │                   │  5. Return embedding                  │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │ 6. Upsert to Pinecone                 │
       │                   │    {                                  │
       │                   │      id: "INV_1001",                  │
       │                   │      values: [0.023, -0.11, ...],     │
       │                   │      metadata: {                      │
       │                   │        text: "Invoice 1001...",       │
       │                   │        customer_id: "CUST_123",       │
       │                   │        amount: 5000,                  │
       │                   │        payment_status: "outstanding", │
       │                   │        domain: "financial",           │
       │                   │        record_type: "invoice"         │
       │                   │      }                                │
       │                   │    }                                  │
       │                   │──────────────────────────────────────>│
       │                   │                   │                   │
       │                   │                   │     7. Index      │
       │                   │                   │     vector in     │
       │                   │                   │     HNSW graph    │
       │                   │                   │                   │
       │                   │                 8. Success            │
       │                   │<──────────────────────────────────────│
       │                   │                   │                   │
```

### Query-Time Embedding Flow

When a user searches, the **same embedding model** converts their query to a vector:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │     │  Search API │     │   OpenAI    │     │  Pinecone   │
│             │     │   Route     │     │ Embeddings  │     │   Index     │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ 1. "Show overdue  │                   │                   │
       │     invoices for  │                   │                   │
       │     Acme Corp"    │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │ 2. POST /embeddings                   │
       │                   │    input: "overdue invoices Acme"     │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │                   │  3. Return query embedding            │
       │                   │     [0.018, -0.09, 0.812, ...]        │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │ 4. Query Pinecone with:               │
       │                   │    - vector: [0.018, -0.09, ...]      │
       │                   │    - filter: {payment_status: overdue}│
       │                   │    - topK: 10                         │
       │                   │──────────────────────────────────────>│
       │                   │                   │                   │
       │                   │                   │   5. Cosine       │
       │                   │                   │   similarity      │
       │                   │                   │   search across   │
       │                   │                   │   all vectors     │
       │                   │                   │                   │
       │                   │ 6. Return top 10 most similar         │
       │                   │    vectors + metadata                 │
       │                   │<──────────────────────────────────────│
       │                   │                   │                   │
       │  7. Formatted     │                   │                   │
       │     results       │                   │                   │
       │<──────────────────│                   │                   │
       │                   │                   │                   │
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Embedding** | A dense vector (1536 floats) representing the semantic meaning of text |
| **Model** | `text-embedding-3-small` - OpenAI's efficient embedding model |
| **Cosine Similarity** | Measures how similar two vectors are (1.0 = identical, 0 = orthogonal) |
| **HNSW Index** | Pinecone's graph structure for fast approximate nearest neighbor search |
| **Metadata** | Structured fields stored alongside the vector for filtering |

### Why This Works for Semantic Search

1. **Similar concepts → similar vectors**: "overdue invoice" and "unpaid bill" produce vectors close together
2. **Context matters**: The embedding captures meaning, not just keywords
3. **Cross-language**: Works across synonyms and paraphrases
4. **Metadata filters**: Narrow search space before vector similarity (e.g., only `domain=financial`)

---

## Current State Assessment

### What Exists Today

| Component | Implementation | Status |
|-----------|---------------|--------|
| **Frontend** | Next.js 15 + React 19 + Tailwind | Production-ready |
| **Vector Search** | Pinecone (`legacy-search` index, 1536-dim) | Working |
| **Embeddings** | OpenAI `text-embedding-3-small` | Working |
| **LLM Router** | GPT-4o-mini with function calling | Working |
| **Auth** | Session-based, multi-tenant (OpCo) | Working (security disabled for demo) |
| **Database** | PostgreSQL/Neon (auth tables only) | Working |
| **Elasticsearch** | Not present | Gap |
| **Data Ingestion** | Not present | Gap |
| **Query Orchestrator** | Basic (LLM tool selection only) | Partial |

### Current Search Flow

```
User Query
    ↓
OpenAI GPT-4o-mini (function calling, tool_choice: auto)
    ↓
Routes to: search_all | search_invoices | search_customers | search_equipment
    ↓
Generate embedding → Query Pinecone with metadata filters
    ↓
Format results → LLM summarization
    ↓
Response + Visualizations
```

### Current Metadata Schema (Pinecone)

```typescript
{
  // Core identifiers
  opco_id: string,           // Multi-tenant isolation
  domain: string,            // financial, crm, field_service, inventory, marketing
  record_type: string,       // invoice, expense, contact, deal, equipment, etc.

  // Common fields
  date: string,
  vendor: string,
  amount: number,
  account: string,
  company_name: string,
  region: string,
  state: string,

  // Domain-specific (varies by record_type)
  payment_status?: string,
  service_type?: string,
  customer_type?: string,
  equipment_type?: string,
  manufacturer?: string,
  // ... etc
}
```

### Gaps Identified

1. **No structured query engine** - Cannot do exact filters, range queries, or aggregations without vector similarity
2. **No data pipeline** - Pinecone is pre-populated externally; no CDC/ETL
3. **No hybrid retrieval** - Single-engine search only
4. **No entity resolution** - Fuzzy names not mapped to canonical IDs
5. **No SQL warehouse tool** - Cannot compute aggregations
6. **Single namespace** - No Pinecone namespace separation by tenant

---

## Target Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                                 │
│                    (Next.js Chat UI / CRM Sidebar)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         QUERY ORCHESTRATOR                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Analyze    │→ │   Entity    │→ │  Retrieve   │→ │   Merge &   │    │
│  │  Question   │  │  Resolver   │  │  (ES + PC)  │  │   Rank      │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│         │                                                    │          │
│         ▼                                                    ▼          │
│  ┌─────────────┐                                    ┌─────────────┐    │
│  │   Answer    │←───────────────────────────────────│  Fallback/  │    │
│  │ Synthesizer │                                    │   Clarify   │    │
│  └─────────────┘                                    └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PINECONE      │  │  ELASTICSEARCH  │  │  SQL WAREHOUSE  │
│  (Semantic)     │  │  (Structured)   │  │  (Aggregations) │
│                 │  │                 │  │                 │
│ • Embeddings    │  │ • Exact filters │  │ • SUM, AVG      │
│ • Similarity    │  │ • Date ranges   │  │ • GROUP BY      │
│ • Narrative     │  │ • Aggregations  │  │ • Complex joins │
│ • Context       │  │ • Full-text     │  │ • Time series   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  QuickBooks │  │    CRM      │  │    ERP      │  │   Email/    │    │
│  │  Connector  │  │  Connector  │  │  Connector  │  │   Tickets   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                    ┌──────────────┴──────────────┐                      │
│                    ▼                             ▼                      │
│           ┌─────────────┐               ┌─────────────┐                 │
│           │  Embedding  │               │  Transform  │                 │
│           │  Generator  │               │  & Normalize│                 │
│           └─────────────┘               └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Engine Responsibilities

| Engine | Purpose | Query Types |
|--------|---------|-------------|
| **Pinecone** | "System of Meaning" | Semantic similarity, narrative search, root-cause analysis, summarization over text |
| **Elasticsearch** | "System of Record" | Exact filters, date ranges, numeric comparisons, aggregations, full-text keyword search |
| **SQL Warehouse** | "System of Computation" | Complex aggregations, cross-entity joins, time-series analysis, financial calculations |

### Decision Rules: When to Use Which Engine

| Question Pattern | Primary Engine | Secondary |
|-----------------|----------------|-----------|
| "Show me all overdue invoices for Contoso this quarter" | Elasticsearch | - |
| "What's our AR balance by customer segment?" | SQL Warehouse | - |
| "Why did our relationship with Contoso deteriorate?" | Pinecone | ES for entity IDs |
| "What are the key termination clauses in our MSA with Acme?" | Pinecone | - |
| "Which high-value customers with late payments mentioned cash-flow in emails?" | **Hybrid** | ES filters → Pinecone semantic |
| "Total revenue per customer this year" | SQL Warehouse | - |

---

## Implementation Phases

## Phase 1: Pinecone Optimization

**Goal**: Maximize semantic search capabilities before adding complexity
**Effort**: Low (1-2 weeks)
**Risk**: Low

### 1.1 Enable Pinecone Namespaces

Separate data by tenant for better isolation and performance.

```typescript
// Current: Single namespace (default)
const index = pc.Index('legacy-search');

// Target: Namespace per OpCo
const index = pc.Index('legacy-search').namespace(`opco-${opcoId}`);

// Or namespace per domain
const index = pc.Index('legacy-search').namespace('financial');
const index = pc.Index('legacy-search').namespace('crm');
```

**Implementation**:
1. Update `executeToolCall()` to use namespace based on user's OpCo
2. Update ingestion to write to appropriate namespace
3. Keep a "global" namespace for cross-tenant admin queries

### 1.2 Add Foreign Key Metadata

Enable precise joins between Pinecone results and structured data.

```typescript
// Current metadata (partial)
{
  vendor: "Carrier",
  amount: 5000,
  date: "2024-03-15"
}

// Enhanced metadata with foreign keys
{
  // Canonical IDs (immutable, joinable)
  customer_id: "CUST_123",
  invoice_id: "INV_1001",
  vendor_id: "VND_456",
  contact_id: "CON_789",

  // Existing fields
  vendor: "Carrier",
  amount: 5000,
  date: "2024-03-15"
}
```

**Implementation**:
1. Define canonical ID format: `{ENTITY_TYPE}_{UUID}` or `{ENTITY_TYPE}_{SOURCE_SYSTEM_ID}`
2. Update ingestion to generate/map IDs
3. Store ID mapping table in PostgreSQL

### 1.3 Enable Hybrid Search (Dense + Sparse)

Pinecone supports hybrid queries combining vector similarity with keyword matching.

```typescript
// Current: Dense vectors only
const results = await index.query({
  vector: embedding,
  topK: 10,
  filter: { domain: { $eq: 'financial' } }
});

// Target: Hybrid with sparse vectors
const results = await index.query({
  vector: embedding,
  sparseVector: {
    indices: [102, 3001, 15234],  // Token IDs
    values: [0.8, 0.5, 0.3]       // TF-IDF weights
  },
  topK: 10,
  filter: { domain: { $eq: 'financial' } }
});
```

**Implementation**:
1. Generate sparse vectors during ingestion (BM25 or SPLADE)
2. Update query to include sparse component for keyword matching
3. Tune alpha parameter (dense vs sparse weight)

### 1.4 Deliverables

- [ ] Namespace isolation by OpCo
- [ ] Foreign key metadata on all records
- [ ] Hybrid search enabled
- [ ] Updated ingestion scripts

---

## Phase 2: Elasticsearch Integration

**Goal**: Add structured query capabilities for exact filters and aggregations
**Effort**: Medium (3-4 weeks)
**Risk**: Medium

### 2.1 Elasticsearch Cluster Setup

**Options**:
1. **Elastic Cloud** (managed) - Recommended for initial deployment
2. **Self-hosted on AWS/GCP** - More control, more operational overhead
3. **OpenSearch** (AWS) - If already in AWS ecosystem

**Recommended**: Start with Elastic Cloud (14-day trial, then ~$95/month for basic tier)

### 2.2 Index Design

Create indexes that mirror the data domains in Pinecone but optimized for structured queries.

#### Index: `invoices`

```json
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "customer_id": { "type": "keyword" },
      "customer_name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "invoice_id": { "type": "keyword" },
      "invoice_number": { "type": "keyword" },
      "issue_date": { "type": "date" },
      "due_date": { "type": "date" },
      "payment_date": { "type": "date" },
      "status": { "type": "keyword" },
      "payment_status": { "type": "keyword" },
      "currency": { "type": "keyword" },
      "total_amount": { "type": "double" },
      "balance_due": { "type": "double" },
      "days_late": { "type": "integer" },
      "service_type": { "type": "keyword" },
      "vendor_id": { "type": "keyword" },
      "vendor_name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "line_items": {
        "type": "nested",
        "properties": {
          "sku": { "type": "keyword" },
          "description": { "type": "text" },
          "quantity": { "type": "double" },
          "unit_price": { "type": "double" }
        }
      },
      "notes": { "type": "text" },
      "tags": { "type": "keyword" },
      "source_system": { "type": "keyword" },
      "opco_id": { "type": "keyword" },
      "region": { "type": "keyword" },
      "state": { "type": "keyword" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" }
    }
  }
}
```

#### Index: `customers`

```json
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "customer_id": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "customer_type": { "type": "keyword" },
      "industry": { "type": "keyword" },
      "address": {
        "properties": {
          "street": { "type": "text" },
          "city": { "type": "keyword" },
          "state": { "type": "keyword" },
          "zip": { "type": "keyword" },
          "country": { "type": "keyword" }
        }
      },
      "contact_email": { "type": "keyword" },
      "contact_phone": { "type": "keyword" },
      "lifetime_value": { "type": "double" },
      "open_invoice_count": { "type": "integer" },
      "total_ar_balance": { "type": "double" },
      "avg_days_to_pay": { "type": "float" },
      "risk_score": { "type": "float" },
      "tags": { "type": "keyword" },
      "account_manager_id": { "type": "keyword" },
      "opco_id": { "type": "keyword" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" }
    }
  }
}
```

#### Index: `crm_notes`

```json
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "note_id": { "type": "keyword" },
      "customer_id": { "type": "keyword" },
      "author_id": { "type": "keyword" },
      "author_name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "note_type": { "type": "keyword" },
      "title": { "type": "text" },
      "body": { "type": "text" },
      "related_invoice_ids": { "type": "keyword" },
      "related_deal_ids": { "type": "keyword" },
      "sentiment": { "type": "keyword" },
      "created_at": { "type": "date" },
      "opco_id": { "type": "keyword" }
    }
  }
}
```

#### Index: `payments`

```json
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "payment_id": { "type": "keyword" },
      "customer_id": { "type": "keyword" },
      "invoice_id": { "type": "keyword" },
      "amount": { "type": "double" },
      "payment_date": { "type": "date" },
      "payment_method": { "type": "keyword" },
      "reference_number": { "type": "keyword" },
      "opco_id": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}
```

### 2.3 Add `search_elastic` Tool

New tool definition for the LLM:

```typescript
{
  name: "search_elastic",
  description: "Search structured business data with exact filters, date ranges, and aggregations. Use for precise queries like 'all invoices over $5000 in Q4' or 'customers in Texas with overdue balances'.",
  parameters: {
    type: "object",
    properties: {
      index: {
        type: "string",
        enum: ["invoices", "customers", "payments", "crm_notes", "equipment"],
        description: "Which index to search"
      },
      query: {
        type: "string",
        description: "Optional full-text search query"
      },
      filters: {
        type: "object",
        description: "Exact match filters (e.g., { customer_id: 'CUST_123', status: 'overdue' })"
      },
      date_range: {
        type: "object",
        properties: {
          field: { type: "string" },
          gte: { type: "string", description: "ISO date string" },
          lte: { type: "string", description: "ISO date string" }
        }
      },
      numeric_range: {
        type: "object",
        properties: {
          field: { type: "string" },
          gte: { type: "number" },
          lte: { type: "number" }
        }
      },
      aggregations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["sum", "avg", "min", "max", "count", "terms"] },
            field: { type: "string" }
          }
        },
        description: "Aggregations to compute (e.g., sum of amounts, count by status)"
      },
      sort: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            order: { type: "string", enum: ["asc", "desc"] }
          }
        }
      },
      top_k: {
        type: "integer",
        default: 50
      }
    },
    required: ["index"]
  }
}
```

### 2.4 Elasticsearch Client Integration

```typescript
// lib/elasticsearch.ts
import { Client } from '@elastic/elasticsearch';

let esClient: Client | null = null;

export function getElasticsearchClient(): Client {
  if (!esClient) {
    esClient = new Client({
      cloud: {
        id: process.env.ELASTIC_CLOUD_ID!
      },
      auth: {
        apiKey: process.env.ELASTIC_API_KEY!
      }
    });
  }
  return esClient;
}

export async function searchElastic(params: {
  index: string;
  query?: string;
  filters?: Record<string, any>;
  dateRange?: { field: string; gte?: string; lte?: string };
  numericRange?: { field: string; gte?: number; lte?: number };
  aggregations?: Array<{ name: string; type: string; field: string }>;
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  topK?: number;
  tenantId: string;
}) {
  const client = getElasticsearchClient();

  // Build query
  const must: any[] = [];
  const filter: any[] = [
    { term: { tenant_id: params.tenantId } } // Always enforce tenant isolation
  ];

  // Full-text query
  if (params.query) {
    must.push({
      multi_match: {
        query: params.query,
        fields: ['*'],
        type: 'best_fields'
      }
    });
  }

  // Exact filters
  if (params.filters) {
    for (const [field, value] of Object.entries(params.filters)) {
      filter.push({ term: { [field]: value } });
    }
  }

  // Date range
  if (params.dateRange) {
    filter.push({
      range: {
        [params.dateRange.field]: {
          ...(params.dateRange.gte && { gte: params.dateRange.gte }),
          ...(params.dateRange.lte && { lte: params.dateRange.lte })
        }
      }
    });
  }

  // Numeric range
  if (params.numericRange) {
    filter.push({
      range: {
        [params.numericRange.field]: {
          ...(params.numericRange.gte !== undefined && { gte: params.numericRange.gte }),
          ...(params.numericRange.lte !== undefined && { lte: params.numericRange.lte })
        }
      }
    });
  }

  // Build aggregations
  const aggs: Record<string, any> = {};
  if (params.aggregations) {
    for (const agg of params.aggregations) {
      if (agg.type === 'terms') {
        aggs[agg.name] = { terms: { field: agg.field, size: 20 } };
      } else {
        aggs[agg.name] = { [agg.type]: { field: agg.field } };
      }
    }
  }

  const response = await client.search({
    index: params.index,
    body: {
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter
        }
      },
      ...(Object.keys(aggs).length > 0 && { aggs }),
      sort: params.sort?.map(s => ({ [s.field]: s.order })) || [{ _score: 'desc' }],
      size: params.topK || 50
    }
  });

  return {
    hits: response.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source
    })),
    total: typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value || 0,
    aggregations: response.aggregations
  };
}
```

### 2.5 Deliverables

- [ ] Elasticsearch cluster deployed (Elastic Cloud)
- [ ] Index templates created (invoices, customers, payments, crm_notes)
- [ ] `search_elastic` tool implemented
- [ ] ES client library with tenant isolation
- [ ] Environment variables configured

---

## Phase 3: Query Orchestrator

**Goal**: Build intelligent routing layer that decides when to use Pinecone, ES, or both
**Effort**: Medium-High (3-4 weeks)
**Risk**: Medium

### 3.1 Orchestrator Architecture

```typescript
// Orchestrator graph nodes
interface OrchestratorState {
  userQuery: string;
  conversationHistory: Message[];
  plan: QueryPlan | null;
  entityIds: Record<string, string>;
  elasticResults: any[] | null;
  pineconeResults: any[] | null;
  mergedResults: any[] | null;
  answer: string | null;
  error: string | null;
}

interface QueryPlan {
  intent: string;
  entities: Record<string, string>;
  timeRange?: { from: string; to: string };
  needsStructured: boolean;
  needsSemantic: boolean;
  needsAggregation: boolean;
  structuredQueries: StructuredQuery[];
  semanticQueries: SemanticQuery[];
  aggregationQueries: AggregationQuery[];
}
```

### 3.2 Node Implementations

#### N1: Analyze Question

```typescript
async function analyzeQuestion(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Analyze the user's question and create a query plan.

Output a JSON object with:
- intent: The type of question (customer_summary, invoice_lookup, trend_analysis, root_cause, etc.)
- entities: Mentioned entities (customer_name, vendor_name, invoice_number, etc.)
- timeRange: Date range if mentioned ({ from, to } in ISO format)
- needsStructured: true if question needs exact filters, dates, amounts, counts
- needsSemantic: true if question needs narrative context, reasons, summaries
- needsAggregation: true if question needs computed totals, averages, trends
- structuredQueries: Array of ES queries to run
- semanticQueries: Array of Pinecone queries to run
- aggregationQueries: Array of SQL aggregations to run`
      },
      {
        role: 'user',
        content: state.userQuery
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  });

  const plan = JSON.parse(response.choices[0].message.content!);
  return { plan };
}
```

#### N2: Entity Resolver

```typescript
async function resolveEntities(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  if (!state.plan?.entities) return {};

  const entityIds: Record<string, string> = {};

  for (const [entityType, fuzzyName] of Object.entries(state.plan.entities)) {
    if (entityType === 'customer_name') {
      // Fuzzy search in ES to find canonical customer_id
      const results = await searchElastic({
        index: 'customers',
        query: fuzzyName as string,
        topK: 1,
        tenantId: state.tenantId
      });

      if (results.hits.length > 0) {
        entityIds['customer_id'] = results.hits[0].customer_id;
        entityIds['customer_name'] = results.hits[0].name;
      }
    }
    // Similar logic for vendor, invoice, etc.
  }

  return { entityIds };
}
```

#### N3: Elastic Retriever

```typescript
async function retrieveFromElastic(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  if (!state.plan?.needsStructured) return { elasticResults: [] };

  const allResults: any[] = [];

  for (const query of state.plan.structuredQueries) {
    const results = await searchElastic({
      index: query.index,
      filters: {
        ...query.filters,
        ...(state.entityIds.customer_id && { customer_id: state.entityIds.customer_id })
      },
      dateRange: query.dateRange || state.plan.timeRange,
      aggregations: query.aggregations,
      tenantId: state.tenantId
    });

    allResults.push({ queryName: query.name, ...results });
  }

  return { elasticResults: allResults };
}
```

#### N4: Pinecone Retriever

```typescript
async function retrieveFromPinecone(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  if (!state.plan?.needsSemantic) return { pineconeResults: [] };

  const allResults: any[] = [];

  for (const query of state.plan.semanticQueries) {
    const embedding = await generateEmbedding(query.query);

    const filter: Record<string, any> = {
      ...query.filter,
      ...(state.entityIds.customer_id && { customer_id: { $eq: state.entityIds.customer_id } })
    };

    const results = await index.namespace(state.tenantId).query({
      vector: embedding,
      topK: query.topK || 20,
      filter,
      includeMetadata: true
    });

    allResults.push({
      queryName: query.name,
      matches: results.matches
    });
  }

  return { pineconeResults: allResults };
}
```

#### N5: Merge and Rank

```typescript
async function mergeAndRank(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  const structured = state.elasticResults || [];
  const semantic = state.pineconeResults || [];

  // Format structured data as context
  const structuredContext = {
    type: 'structured_facts',
    data: structured.map(r => ({
      source: r.queryName,
      count: r.total,
      aggregations: r.aggregations,
      sample: r.hits.slice(0, 10)
    }))
  };

  // Format semantic data as context
  const semanticContext = {
    type: 'narrative_context',
    snippets: semantic.flatMap(r =>
      r.matches.map((m: any) => ({
        source: r.queryName,
        text: m.metadata.text,
        score: m.score,
        metadata: m.metadata
      }))
    ).slice(0, 15) // Limit to prevent context overflow
  };

  return {
    mergedResults: [structuredContext, semanticContext]
  };
}
```

#### N6: Answer Synthesizer

```typescript
async function synthesizeAnswer(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',  // Use stronger model for synthesis
    messages: [
      {
        role: 'system',
        content: `You are a business analyst assistant. Answer the user's question using ONLY the provided data.

STRUCTURED_FACTS: Contains exact numbers, dates, and aggregations from the database. These are ground truth.
NARRATIVE_CONTEXT: Contains relevant text snippets from notes, emails, and documents. Use for explanations and context.

Rules:
1. NEVER invent numbers - only use values from STRUCTURED_FACTS
2. Cite specific records when making claims (e.g., "Invoice INV-1001 dated 2024-03-15")
3. If data is insufficient, say so clearly
4. Provide actionable insights when appropriate`
      },
      {
        role: 'user',
        content: state.userQuery
      },
      {
        role: 'assistant',
        content: `Here is the retrieved data:\n\n${JSON.stringify(state.mergedResults, null, 2)}`
      }
    ],
    temperature: 0.3
  });

  return { answer: response.choices[0].message.content };
}
```

### 3.3 Graph Wiring

```typescript
import { StateGraph } from '@langchain/langgraph';

const graph = new StateGraph<OrchestratorState>({
  channels: {
    userQuery: null,
    conversationHistory: null,
    plan: null,
    entityIds: null,
    elasticResults: null,
    pineconeResults: null,
    mergedResults: null,
    answer: null,
    error: null
  }
});

graph.addNode('analyze_question', analyzeQuestion);
graph.addNode('resolve_entities', resolveEntities);
graph.addNode('retrieve_elastic', retrieveFromElastic);
graph.addNode('retrieve_pinecone', retrieveFromPinecone);
graph.addNode('merge_and_rank', mergeAndRank);
graph.addNode('synthesize_answer', synthesizeAnswer);

graph.setEntryPoint('analyze_question');

graph.addEdge('analyze_question', 'resolve_entities');

graph.addConditionalEdges('resolve_entities', (state) => {
  if (state.plan?.needsStructured && state.plan?.needsSemantic) {
    return 'both';
  } else if (state.plan?.needsStructured) {
    return 'structured_only';
  } else if (state.plan?.needsSemantic) {
    return 'semantic_only';
  }
  return 'direct_answer';
}, {
  both: 'retrieve_elastic',
  structured_only: 'retrieve_elastic',
  semantic_only: 'retrieve_pinecone',
  direct_answer: 'synthesize_answer'
});

// If both: ES → Pinecone → Merge
graph.addEdge('retrieve_elastic', 'retrieve_pinecone');
graph.addEdge('retrieve_pinecone', 'merge_and_rank');
graph.addEdge('merge_and_rank', 'synthesize_answer');

// If structured only: ES → Merge → Answer
// If semantic only: Pinecone → Merge → Answer

graph.addEdge('synthesize_answer', '__end__');

export const orchestrator = graph.compile();
```

### 3.4 Deliverables

- [ ] Query analyzer with intent classification
- [ ] Entity resolver with fuzzy matching
- [ ] Parallel ES + Pinecone retrieval
- [ ] Hybrid fusion (RRF or weighted)
- [ ] Answer synthesis with grounding
- [ ] LangGraph (or custom) orchestration flow

---

## Phase 4: Data Ingestion Pipeline

**Goal**: Production-grade ETL/CDC from source systems
**Effort**: High (4-6 weeks)
**Risk**: High (depends on source system access)

### 4.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SOURCE SYSTEMS                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  QuickBooks │  │  Salesforce │  │    ERP      │  │   Email     │    │
│  │   Online    │  │     CRM     │  │  (NetSuite) │  │  (O365/GSW) │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONNECTORS LAYER                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  QBO        │  │  Salesforce │  │  NetSuite   │  │  Graph API  │    │
│  │  Connector  │  │  Connector  │  │  Connector  │  │  Connector  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                                   ▼                                      │
│                          ┌─────────────────┐                            │
│                          │   Message Queue │                            │
│                          │   (SQS/Kafka)   │                            │
│                          └────────┬────────┘                            │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PROCESSING LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Transform & Normalize                         │   │
│  │  • Entity resolution (fuzzy matching → canonical IDs)           │   │
│  │  • Schema normalization (source → canonical)                    │   │
│  │  • Data validation & cleansing                                  │   │
│  │  • PII detection & handling                                     │   │
│  └────────────────────────────────┬────────────────────────────────┘   │
│                                   │                                      │
│                    ┌──────────────┴──────────────┐                      │
│                    ▼                             ▼                      │
│           ┌─────────────────┐          ┌─────────────────┐             │
│           │    Embedding    │          │   Structured    │             │
│           │    Generator    │          │   Transformer   │             │
│           │  (OpenAI API)   │          │                 │             │
│           └────────┬────────┘          └────────┬────────┘             │
│                    │                            │                       │
└────────────────────┼────────────────────────────┼───────────────────────┘
                     │                            │
                     ▼                            ▼
              ┌─────────────┐              ┌─────────────┐
              │  Pinecone   │              │Elasticsearch│
              │  Upsert     │              │  Index      │
              └─────────────┘              └─────────────┘
```

### 4.2 Connector Specifications

#### QuickBooks Online Connector

```typescript
interface QBOConnectorConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;

  // Entities to sync
  entities: ('Invoice' | 'Payment' | 'Customer' | 'Vendor' | 'Account' | 'JournalEntry')[];

  // Sync mode
  mode: 'full' | 'incremental';

  // For incremental: track last sync time
  lastSyncTime?: string;
}

// Polling-based sync (QBO doesn't have webhooks for all entities)
async function syncFromQBO(config: QBOConnectorConfig) {
  const qbo = await getQBOClient(config);

  for (const entity of config.entities) {
    const query = config.mode === 'incremental'
      ? `SELECT * FROM ${entity} WHERE MetaData.LastUpdatedTime > '${config.lastSyncTime}'`
      : `SELECT * FROM ${entity}`;

    const records = await qbo.query(query);

    for (const record of records) {
      await publishToQueue({
        source: 'quickbooks',
        entity,
        operation: 'upsert',
        data: record,
        timestamp: new Date().toISOString()
      });
    }
  }
}
```

#### Salesforce CRM Connector

```typescript
interface SalesforceConnectorConfig {
  instanceUrl: string;
  accessToken: string;
  refreshToken: string;

  // Objects to sync
  objects: ('Account' | 'Contact' | 'Opportunity' | 'Case' | 'Task' | 'EmailMessage')[];

  // Use Salesforce CDC (Change Data Capture) for real-time
  useCDC: boolean;
}

// CDC-based sync for real-time updates
async function setupSalesforceCDC(config: SalesforceConnectorConfig) {
  const conn = await getSalesforceConnection(config);

  // Subscribe to CDC events
  const channel = `/data/${config.objects.map(o => o + 'ChangeEvent').join(',')}`;

  conn.streaming.topic(channel).subscribe((event) => {
    publishToQueue({
      source: 'salesforce',
      entity: event.payload.entityName,
      operation: event.payload.ChangeEventHeader.changeType,
      data: event.payload,
      timestamp: event.payload.ChangeEventHeader.commitTimestamp
    });
  });
}
```

### 4.3 Transform & Normalize

```typescript
interface CanonicalInvoice {
  // System fields
  id: string;                    // UUID
  source_system: string;         // 'quickbooks', 'netsuite', etc.
  source_id: string;             // Original ID in source system
  tenant_id: string;
  opco_id: string;

  // Core fields
  invoice_number: string;
  customer_id: string;           // Canonical customer ID
  customer_name: string;
  vendor_id?: string;
  vendor_name?: string;

  // Dates
  issue_date: string;            // ISO format
  due_date: string;
  payment_date?: string;

  // Amounts
  subtotal: number;
  tax: number;
  total: number;
  balance_due: number;
  currency: string;

  // Status
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
  payment_status: 'outstanding' | 'paid' | 'overdue';
  days_late?: number;

  // Line items
  line_items: Array<{
    sku?: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;

  // Metadata
  notes?: string;
  tags?: string[];

  // Timestamps
  created_at: string;
  updated_at: string;
}

// Transformer for QuickBooks Invoice → Canonical
function transformQBOInvoice(qboInvoice: any, context: TransformContext): CanonicalInvoice {
  const customerId = context.entityMap.get(`qbo:customer:${qboInvoice.CustomerRef.value}`)
    || generateCanonicalId('customer', qboInvoice.CustomerRef.value);

  return {
    id: generateCanonicalId('invoice', qboInvoice.Id),
    source_system: 'quickbooks',
    source_id: qboInvoice.Id,
    tenant_id: context.tenantId,
    opco_id: context.opcoId,

    invoice_number: qboInvoice.DocNumber,
    customer_id: customerId,
    customer_name: qboInvoice.CustomerRef.name,

    issue_date: qboInvoice.TxnDate,
    due_date: qboInvoice.DueDate,
    payment_date: qboInvoice.LinkedTxn?.find(t => t.TxnType === 'Payment')?.TxnDate,

    subtotal: qboInvoice.TotalAmt - (qboInvoice.TxnTaxDetail?.TotalTax || 0),
    tax: qboInvoice.TxnTaxDetail?.TotalTax || 0,
    total: qboInvoice.TotalAmt,
    balance_due: qboInvoice.Balance,
    currency: qboInvoice.CurrencyRef?.value || 'USD',

    status: mapQBOStatus(qboInvoice),
    payment_status: qboInvoice.Balance > 0
      ? (new Date(qboInvoice.DueDate) < new Date() ? 'overdue' : 'outstanding')
      : 'paid',
    days_late: calculateDaysLate(qboInvoice.DueDate, qboInvoice.Balance),

    line_items: qboInvoice.Line
      .filter(l => l.DetailType === 'SalesItemLineDetail')
      .map(l => ({
        sku: l.SalesItemLineDetail.ItemRef?.value,
        description: l.Description,
        quantity: l.SalesItemLineDetail.Qty,
        unit_price: l.SalesItemLineDetail.UnitPrice,
        amount: l.Amount
      })),

    notes: qboInvoice.PrivateNote,
    tags: extractTags(qboInvoice),

    created_at: qboInvoice.MetaData.CreateTime,
    updated_at: qboInvoice.MetaData.LastUpdatedTime
  };
}
```

### 4.4 Dual-Write to Pinecone + Elasticsearch

```typescript
async function persistRecord(record: CanonicalInvoice) {
  // 1. Generate embedding for Pinecone
  const textForEmbedding = generateEmbeddingText(record);
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: textForEmbedding
  });

  // 2. Upsert to Pinecone
  await pineconeIndex.namespace(record.tenant_id).upsert([{
    id: record.id,
    values: embedding.data[0].embedding,
    metadata: {
      text: textForEmbedding,
      domain: 'financial',
      record_type: 'invoice',
      customer_id: record.customer_id,
      invoice_id: record.id,
      vendor_id: record.vendor_id,
      amount: record.total,
      payment_status: record.payment_status,
      date: record.issue_date,
      opco_id: record.opco_id,
      // ... other searchable metadata
    }
  }]);

  // 3. Index to Elasticsearch
  await esClient.index({
    index: 'invoices',
    id: record.id,
    body: record
  });

  // 4. Log for audit
  console.log(`Persisted invoice ${record.id} to Pinecone + ES`);
}

function generateEmbeddingText(invoice: CanonicalInvoice): string {
  const lines = invoice.line_items.map(l => l.description).join('. ');
  return `Invoice ${invoice.invoice_number} for ${invoice.customer_name}. ` +
         `Amount: $${invoice.total}. Status: ${invoice.payment_status}. ` +
         `Services: ${lines}. ${invoice.notes || ''}`;
}
```

### 4.5 Deliverables

- [ ] QuickBooks Online connector
- [ ] Salesforce CDC connector (if applicable)
- [ ] Message queue setup (SQS or Kafka)
- [ ] Transform layer with canonical schemas
- [ ] Entity resolution / ID mapping service
- [ ] Dual-write to Pinecone + ES
- [ ] Monitoring & alerting for pipeline health
- [ ] Backfill scripts for historical data

---

## Appendix A: Environment Variables

```bash
# Existing
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=legacy-search

# Phase 2: Elasticsearch
ELASTIC_CLOUD_ID=deployment-name:base64...
ELASTIC_API_KEY=base64...

# Phase 4: Connectors
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REFRESH_TOKEN=...
QBO_REALM_ID=...

SALESFORCE_INSTANCE_URL=https://yourorg.salesforce.com
SALESFORCE_ACCESS_TOKEN=...
SALESFORCE_REFRESH_TOKEN=...

# Queue
AWS_REGION=us-west-2
SQS_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/...
```

---

## Appendix B: Pinecone Metadata Schema (Enhanced)

```typescript
interface PineconeMetadata {
  // Text content (for retrieval context)
  text: string;

  // Classification
  domain: 'financial' | 'crm' | 'field_service' | 'inventory' | 'marketing';
  record_type: string;

  // Canonical IDs (for joins)
  customer_id?: string;
  invoice_id?: string;
  vendor_id?: string;
  contact_id?: string;
  deal_id?: string;
  ticket_id?: string;

  // Multi-tenancy
  tenant_id: string;
  opco_id: string;

  // Access control
  role_required: string;
  confidentiality?: 'public' | 'internal' | 'confidential' | 'restricted';

  // Temporal
  date: string;           // Primary date (issue date, created date, etc.)
  effective_date?: string;
  expiry_date?: string;

  // Common attributes
  amount?: number;
  status?: string;
  region?: string;
  state?: string;

  // Source tracking
  source_system: string;
  source_id: string;
  created_at: string;
  updated_at: string;
}
```

---

## Appendix C: Cost Estimates

| Component | Phase | Monthly Cost (Estimate) |
|-----------|-------|------------------------|
| Pinecone (Starter) | Current | $0 (free tier) |
| Pinecone (Standard) | Phase 1+ | $70-150/month |
| Elastic Cloud (Basic) | Phase 2+ | $95/month |
| OpenAI API | All | $50-200/month (usage-dependent) |
| Vercel (Pro) | All | $20/month |
| PostgreSQL (Neon) | All | $0-25/month |
| AWS SQS | Phase 4 | $5-20/month |
| **Total (Post Phase 4)** | | **~$300-500/month** |

---

## Appendix D: Risk Register

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|------------|--------|------------|
| Source system API limits | 4 | High | High | Implement backoff, batch processing, caching |
| Embedding cost overrun | 1, 4 | Medium | Medium | Use smaller model, batch embeddings, cache |
| ES index size growth | 2+ | Medium | Medium | Implement retention policies, tiered storage |
| Query latency degradation | 3 | Medium | High | Add caching layer, optimize queries, monitor p95 |
| Data freshness SLA miss | 4 | Medium | Medium | CDC over polling where possible, alerting |
| LLM hallucination | All | High | High | Ground all answers in retrieved data, validate numerics |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize phases** based on business value vs. effort
3. **Phase 1 kickoff** - Enable Pinecone namespaces and hybrid search
4. **Evaluate Elasticsearch** - Trial Elastic Cloud, design indexes

---

*This document will be updated as implementation progresses.*
