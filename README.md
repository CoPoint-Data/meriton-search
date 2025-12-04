# Meriton Search

AI-powered semantic search for HVAC business data. Search across invoices, CRM contacts, deals, inventory, marketing campaigns, and more using natural language.

## Features

- **Semantic Search**: Natural language queries powered by OpenAI embeddings and Pinecone vector database
- **Multi-domain Data**: Search across financial, CRM, inventory, marketing, and regional data
- **Smart Visualizations**: Auto-generated charts based on search results
- **Role-based Access**: Multi-tenant RBAC with OpCo isolation

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Vector DB**: Pinecone
- **AI**: OpenAI (embeddings), GPT-4o-mini (function calling)
- **Auth**: Session-based with Prisma

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Pinecone account
- OpenAI API key

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/meriton-search.git
   cd meriton-search
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file with:
   - Supabase database URLs (Settings > Database > Connection string)
   - OpenAI API key
   - Pinecone API key and index name

5. Push database schema:
   ```bash
   npm run db:push
   ```

6. Start development server:
   ```bash
   npm run dev
   ```

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables for Vercel

- `DATABASE_URL` - Supabase pooled connection string
- `DIRECT_URL` - Supabase direct connection string
- `OPENAI_API_KEY` - OpenAI API key
- `PINECONE_API_KEY` - Pinecone API key
- `PINECONE_INDEX_NAME` - Pinecone index name
- `DEFAULT_USER_EMAIL` - Default demo user email

## License

MIT
