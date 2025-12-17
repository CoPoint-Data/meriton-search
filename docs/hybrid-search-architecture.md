# Hybrid Search Architecture

## Problem Statement

The current Pinecone-only architecture has limitations for structured business data:

1. **Confidence scores don't reflect metadata matches** - A query for "vendor invoices by region in 2024" returns regional summary records with 25% confidence, even though the metadata (region, year) matches perfectly. The score is purely semantic similarity between text embeddings.

2. **Semantic search adds noise for structured queries** - "Invoices over $1000 from Carrier" is essentially a SQL query. Vector similarity doesn't help here.

3. **Cost** - Pinecone is expensive for data that would be better served by traditional search.

## Proposed Hybrid Architecture

Use the right tool for each data type:

```
┌─────────────────────────────────────────────────────────┐
│                    User Query                           │
│         "Find contracts mentioning liability"           │
│         "Carrier invoices over $1000 in 2024"           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              LLM (Query Router + Parser)                │
│  - Classifies query type                                │
│  - Extracts structured filters                          │
│  - Picks appropriate backend                            │
└─────────────────────────────────────────────────────────┘
                    ↓                    ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │   Pinecone (Vector)   │  │    Elasticsearch      │
    │                       │  │                       │
    │  • PDFs, contracts    │  │  • Invoices           │
    │  • Emails, notes      │  │  • CRM contacts/deals │
    │  • Support tickets    │  │  • Accounting (GL/AP) │
    │  • Unstructured docs  │  │  • Inventory          │
    │                       │  │  • Marketing/leads    │
    │  Semantic similarity  │  │  BM25 + aggregations  │
    └───────────────────────┘  └───────────────────────┘
                    ↓                    ↓
              ┌─────────────────────────────┐
              │   Combined results + LLM    │
              │   summary + visualizations  │
              └─────────────────────────────┘
```

## Technology Comparison

| Capability | Postgres | Elasticsearch | Pinecone |
|------------|----------|---------------|----------|
| Exact field match | ✅ Excellent | ✅ Excellent | ⚠️ Via filters |
| Range queries (amount > 1000) | ✅ Excellent | ✅ Excellent | ⚠️ Via filters |
| Full-text search | ⚠️ pg_trgm | ✅ Native BM25 | ❌ Not designed for this |
| Fuzzy match ("Carrier" ≈ "CARRIER Inc") | ⚠️ Limited | ✅ Native | Via embeddings |
| Aggregations (for charts) | Manual SQL | ✅ Built-in | ❌ None |
| Relevance tuning | ❌ | ✅ Field boosting | ❌ |
| Semantic/conceptual search | ❌ | ⚠️ Limited | ✅ Excellent |
| Cost at scale | 💲 Low | 💲💲 Medium | 💲💲💲 High |

## Data Routing

### Pinecone (Vector Search)
Best for unstructured content requiring semantic understanding:
- PDFs and contracts
- Email threads
- Meeting notes
- Support tickets
- Any document where you'd ask "find similar to this"

### Elasticsearch (Structured Search)
Best for structured records with known fields:
- Invoices, expenses, GL entries
- CRM contacts, deals, activities
- Inventory/stock items
- Marketing campaigns, leads
- Regional summaries

## Tool Definitions

```typescript
// Routes to Pinecone - semantic search
const search_documents = {
  name: "search_documents",
  description: "Search PDFs, contracts, emails, and unstructured documents. Use for conceptual queries like 'find contracts mentioning liability' or 'emails about project delays'.",
  // Implementation: embed query → Pinecone cosine similarity
}

// Routes to Elasticsearch - structured search
const search_invoices = {
  name: "search_invoices",
  description: "Search invoices with filters for vendor, amount, date, payment status, service type.",
  parameters: {
    query: "string - search terms",
    vendor: "string - filter by vendor name",
    amount_min: "number - minimum amount",
    amount_max: "number - maximum amount",
    payment_status: "enum - paid, outstanding, overdue",
    year: "number - filter by year"
  }
  // Implementation: Elasticsearch bool query with filters
}

const search_crm = {
  name: "search_crm",
  description: "Search CRM contacts, deals, and activities.",
  parameters: {
    query: "string - search terms",
    record_type: "enum - contact, deal, activity",
    stage: "string - deal stage filter",
    state: "string - state filter"
  }
  // Implementation: Elasticsearch with aggregations for pipeline views
}

const search_inventory = {
  name: "search_inventory",
  description: "Search inventory and stock items.",
  parameters: {
    query: "string - search terms",
    sku: "string - exact SKU match",
    manufacturer: "string - manufacturer filter",
    needs_reorder: "boolean - filter items needing reorder"
  }
  // Implementation: Elasticsearch with exact + fuzzy matching
}
```

## ETL Differences

| Data Type | Target | Processing |
|-----------|--------|------------|
| PDFs, contracts | Pinecone | Parse → chunk → embed → store with metadata |
| Invoices, expenses | Elasticsearch | Direct field mapping, index all fields |
| CRM records | Elasticsearch | Direct field mapping |
| Emails, notes | Pinecone | Embed full text + metadata |
| Inventory | Elasticsearch | Direct field mapping with analyzers |

## Benefits

1. **Appropriate relevance scoring**
   - Elasticsearch BM25 for text relevance (interpretable)
   - Pinecone cosine similarity for semantic similarity (where it matters)

2. **Native aggregations**
   - Elasticsearch powers charts/visualizations directly
   - No need to compute aggregations client-side

3. **Lower cost**
   - Elasticsearch is significantly cheaper than Pinecone for structured data
   - Reserve Pinecone for documents that need semantic search

4. **Better accuracy**
   - Exact field matches return 100% confidence
   - Fuzzy text matching handled by proven BM25
   - Semantic search only where conceptual matching is needed

5. **Simpler debugging**
   - Elasticsearch queries are inspectable
   - Can explain why a result matched

## Implementation Phases

### Phase 1: Add Elasticsearch for Structured Data
- Set up Elasticsearch cluster (or use Elastic Cloud)
- Create indices for invoices, CRM, inventory, accounting
- Add `search_invoices_es`, `search_crm_es` tools alongside existing Pinecone tools
- Compare results side-by-side

### Phase 2: Migrate Structured Data
- Update ETL to index structured data to Elasticsearch
- Remove structured data from Pinecone (keep documents only)
- Update tool definitions to route appropriately

### Phase 3: Optimize
- Add field boosting for better relevance
- Configure analyzers for fuzzy matching
- Build aggregation queries for visualizations
- Add cross-index searching if needed

## Decision Log

- **2024-12-04**: Identified that Pinecone's cosine similarity doesn't account for metadata matches, leading to low confidence scores for structurally-matching records
- **2024-12-04**: Recognized that for structured business data (invoices, CRM, accounting), traditional search (Elasticsearch) with LLM query parsing would be more appropriate
- **2024-12-04**: Proposed hybrid architecture: Pinecone for documents, Elasticsearch for structured data
