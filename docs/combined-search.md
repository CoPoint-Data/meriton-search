# Enterprise LLM Search: Final Data Stores

This focuses on the **final retrieval and serving layers** (vector, lexical, graph, etc.) used in an enterprise LLM-powered search system — not upstream systems of record.

The key idea: these are **complementary indexes over the same canonical documents**, not competitors.

---

## 1. Vector Databases (Semantic Index)

**Examples**
- Pinecone  
- Weaviate  
- Milvus  
- pgvector (Postgres)  
- OpenSearch Vector  
- Azure AI Search (vector mode)

### Role
**Semantic recall layer**  
> “Find things *about* X, even if X isn’t mentioned verbatim.”

Used for:
- Conceptual search
- Clause similarity
- “Find similar contracts / invoices / emails”
- RAG grounding

### Strengths
- Captures meaning, paraphrase, and intent
- Excellent for messy natural language
- Language-agnostic
- Works well on PDFs and OCR’d text
- Enables chunk-level retrieval

### Tradeoffs
- No notion of *truth* or authority
- Weak at:
  - exact dates
  - IDs
  - invoice numbers
  - legal precision
- Embedding drift over time
- Costly at scale (memory + compute)
- Hard to debug false positives

### Best Practices
- Chunk by **semantic units**, not pages
- Store rich metadata (doc_id, section, date)
- Use vectors for *candidate generation*, not final answers
- Re-rank with lexical or rules

---

## 2. Lexical / Inverted Index Search (Elastic-style)

**Examples**
- Elasticsearch  
- OpenSearch  
- Solr  
- Azure AI Search (BM25 mode)

### Role
**Precision & determinism layer**  
> “Find documents that *explicitly say* X.”

Used for:
- Contract names
- Invoice numbers
- Dates
- Parties
- Legal citations
- Audit & compliance search

### Strengths
- Exact match and phrase match
- Deterministic and explainable
- Excellent metadata filtering
- Mature tooling and operations
- Fast at large scale

### Tradeoffs
- Poor semantic understanding
- Synonym management is manual
- Brittle to OCR noise
- Doesn’t “understand” intent

### Best Practices
- Index:
  - raw text
  - extracted fields
  - normalized entities
- Heavy use of filters and facets
- Combine with vector recall

---

## 3. Hybrid Search (Vector + Lexical)

**Examples**
- Elasticsearch hybrid queries  
- OpenSearch neural + BM25  
- Azure AI Search hybrid  
- Custom fusion layers

### Role
**Primary enterprise search workhorse**  
> “Find the *right* documents reliably.”

Used for:
- Contract discovery
- Diligence review
- Invoice investigations
- Email search

### Strengths
- High recall + high precision
- Better trust with legal and finance users
- Reduced hallucinations in RAG
- Flexible ranking strategies

### Tradeoffs
- More complex tuning
- Query orchestration required
- Requires observability to debug

### Typical Pattern
1. Vector search → top N candidates  
2. Lexical filter → narrow and validate  
3. Re-rank (cross-encoder or rules)  
4. Send top K to LLM  

---

## 4. Knowledge Graphs (Relational Memory)

**Examples**
- Neo4j  
- Neptune  
- ArangoDB  
- TigerGraph  

### Role
**Entity & relationship layer**  
> “How are these things connected?”

Used for:
- M&A entity relationships
- Contract parties and subsidiaries
- Obligation chains
- Email ↔ deal ↔ document links

### Strengths
- Explicit relationships
- Temporal reasoning
- Excellent for:
  - ownership
  - counterparty networks
  - deal structures
- Explainable reasoning paths

### Tradeoffs
- Expensive to build correctly
- Requires high-quality extraction
- Poor at raw text search
- Not a drop-in replacement for search

### Best Practices
- Graph is *derived*, not primary
- Store IDs and edges, not text blobs
- Query graph → fetch documents via search

---

## 5. Relational Databases (Structured Authority)

**Examples**
- Postgres  
- SQL Server  
- Aurora  
- CockroachDB  

### Role
**Source of truth for facts**  
> “What is actually true?”

Used for:
- Invoice totals
- Contract dates
- Renewal flags
- Deal milestones

### Strengths
- Strong consistency
- Constraints and validation
- Ideal for audit workflows
- Cheap relative to vector stores

### Tradeoffs
- Not suitable for text retrieval
- Schema evolution is costly
- Needs orchestration with search

### Best Practices
- LLM should **query**, not summarize blindly
- Use as validation layer post-retrieval

---

## 6. Object Storage + Chunk Indexes

**Examples**
- S3 + metadata database  
- GCS / Azure Blob  
- Content-addressed stores  

### Role
**Cold storage & traceability**  
> “This exact document version was used.”

### Strengths
- Cheap
- Immutable
- Required for audit and replay
- Supports versioning

### Tradeoffs
- Not searchable alone
- Requires indexes on top

---

## 7. Reranking & Scoring Layer (Often Overlooked)

**Examples**
- Cross-encoder models
- LLM scoring
- Rules engines

### Role
**Final relevance judgment**  
> “Which of these is actually best?”

### Strengths
- Massive relevance lift
- Reduces hallucinations
- Aligns results with user intent

### Tradeoffs
- Compute heavy
- Latency impact
- Needs careful caching

---

## Putting It Together: A Proven Enterprise Pattern


