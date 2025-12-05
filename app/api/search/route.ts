// Force Node.js runtime - Pinecone SDK is not compatible with Edge runtime
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getIndexName, withPineconeErrorHandling, PineconeError } from '@/lib/pinecone';
import { retryOperation, validateMetadataFilter } from '@/lib/pinecone-retry';
import { measureOperation } from '@/lib/pinecone-logger';
import { SearchResponse, SearchResult, ROLE_HIERARCHY } from '@/lib/types';
import { validateSession, roleToString } from '@/lib/auth';
import { Role } from '@prisma/client';
import OpenAI from 'openai';

// Dynamic import for Pinecone to avoid bundling issues on Vercel
async function getPineconeIndex(indexName: string) {
  const { Pinecone } = await import('@pinecone-database/pinecone');
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY environment variable is not set');
  }
  const pc = new Pinecone({ apiKey: apiKey.trim() });
  return pc.Index(indexName);
}

// Lazy-load OpenAI client
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Entity detection: check if user is asking for entity-level view
function detectEntityQuery(query: string): 'vendor' | 'customer' | 'equipment' | null {
  const lowerQuery = query.toLowerCase();

  // Vendor patterns
  if (
    /\b(vendor|vendors|supplier|suppliers|contractor|contractors)\b/.test(lowerQuery) &&
    !/\b(invoice|invoices|bill|bills|payment|payments)\b/.test(lowerQuery)
  ) {
    return 'vendor';
  }

  // Customer patterns
  if (
    /\b(customer|customers|client|clients|facility|facilities)\b/.test(lowerQuery) &&
    !/\b(invoice|invoices)\b/.test(lowerQuery)
  ) {
    return 'customer';
  }

  // Equipment patterns
  if (
    /\b(equipment|unit|units|machine|machines|system|systems)\b/.test(lowerQuery) &&
    !/\b(invoice|invoices)\b/.test(lowerQuery)
  ) {
    return 'equipment';
  }

  return null;
}

// Generate visualization data for various result types
function generateVisualization(
  sources: SearchResult[],
  entityType: 'vendor' | 'customer' | 'equipment' | null,
  query: string
): any {
  if (!sources || sources.length === 0) return null;

  // Vendor visualizations
  if (entityType === 'vendor') {
    return {
      charts: [
        {
          type: 'bar',
          title: 'Invoices by Vendor',
          data: sources.map(s => ({
            label: s.metadata?.vendor_name || 'Unknown',
            value: s.metadata?.invoice_count || 0,
          })),
          xAxis: 'Vendor',
          yAxis: 'Invoice Count',
        },
        {
          type: 'bar',
          title: 'Total Amount by Vendor',
          data: sources.map(s => ({
            label: s.metadata?.vendor_name || 'Unknown',
            value: s.metadata?.total_amount || 0,
          })),
          xAxis: 'Vendor',
          yAxis: 'Total Amount ($)',
        },
      ],
    };
  }

  // Financial/Invoice visualizations
  if (sources.some(s => s.metadata?.domain === 'financial')) {
    const paymentStatusData: Record<string, number> = {};
    const serviceTypeData: Record<string, number> = {};
    const monthlyData: Record<string, number> = {};

    sources.forEach(s => {
      // Payment status
      const status = s.metadata?.payment_status || 'unknown';
      paymentStatusData[status] = (paymentStatusData[status] || 0) + 1;

      // Service type
      const serviceType = s.metadata?.service_type || 'unknown';
      serviceTypeData[serviceType] = (serviceTypeData[serviceType] || 0) + 1;

      // Monthly trend
      if (s.metadata?.date) {
        const month = s.metadata.date.substring(0, 7); // YYYY-MM
        monthlyData[month] = (monthlyData[month] || 0) + (s.metadata?.amount || 0);
      }
    });

    return {
      charts: [
        {
          type: 'pie',
          title: 'Payment Status Distribution',
          data: Object.entries(paymentStatusData).map(([label, value]) => ({
            label,
            value,
          })),
        },
        {
          type: 'bar',
          title: 'Service Type Distribution',
          data: Object.entries(serviceTypeData).map(([label, value]) => ({
            label,
            value,
          })),
          xAxis: 'Service Type',
          yAxis: 'Count',
        },
        {
          type: 'line',
          title: 'Monthly Invoice Amounts',
          data: Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, value]) => ({
              label,
              value,
            })),
          xAxis: 'Month',
          yAxis: 'Amount ($)',
        },
      ],
    };
  }

  // CRM visualizations (contacts, deals, activities)
  if (sources.some(s => s.metadata?.domain === 'crm')) {
    const recordTypeData: Record<string, number> = {};
    const leadSourceData: Record<string, number> = {};
    const stageData: Record<string, number> = {};
    const stateData: Record<string, number> = {};

    sources.forEach(s => {
      const recordType = s.metadata?.record_type || 'unknown';
      recordTypeData[recordType] = (recordTypeData[recordType] || 0) + 1;

      // Lead source for contacts and leads
      const leadSource = s.metadata?.lead_source;
      if (leadSource) {
        leadSourceData[leadSource] = (leadSourceData[leadSource] || 0) + 1;
      }

      // Stage for deals
      const stage = s.metadata?.stage;
      if (stage) {
        stageData[stage] = (stageData[stage] || 0) + 1;
      }

      const state = s.metadata?.state || 'unknown';
      if (state !== 'unknown') {
        stateData[state] = (stateData[state] || 0) + 1;
      }
    });

    const charts: any[] = [];

    // Show record type distribution if mixed CRM types
    if (Object.keys(recordTypeData).length > 1) {
      charts.push({
        type: 'pie',
        title: 'CRM Record Types',
        data: Object.entries(recordTypeData).map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
      });
    }

    // Show lead source distribution if available
    if (Object.keys(leadSourceData).length > 0) {
      charts.push({
        type: 'pie',
        title: 'Lead Source Distribution',
        data: Object.entries(leadSourceData).map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
      });
    }

    // Show deal stages if available
    if (Object.keys(stageData).length > 0) {
      charts.push({
        type: 'bar',
        title: 'Deals by Stage',
        data: Object.entries(stageData).map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
        xAxis: 'Stage',
        yAxis: 'Count',
      });
    }

    // Show state distribution if available
    if (Object.keys(stateData).length > 1) {
      charts.push({
        type: 'bar',
        title: 'By State',
        data: Object.entries(stateData)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([label, value]) => ({
            label,
            value,
          })),
        xAxis: 'State',
        yAxis: 'Count',
      });
    }

    if (charts.length > 0) {
      return { charts };
    }
  }

  // Equipment visualizations (legacy field_service domain)
  if (sources.some(s => s.metadata?.domain === 'field_service')) {
    const conditionData: Record<string, number> = {};
    const typeData: Record<string, number> = {};

    sources.forEach(s => {
      const condition = s.metadata?.condition || 'unknown';
      conditionData[condition] = (conditionData[condition] || 0) + 1;

      const type = s.metadata?.equipment_type || 'unknown';
      typeData[type] = (typeData[type] || 0) + 1;
    });

    return {
      charts: [
        {
          type: 'pie',
          title: 'Equipment Condition Distribution',
          data: Object.entries(conditionData).map(([label, value]) => ({
            label,
            value,
          })),
        },
        {
          type: 'bar',
          title: 'Equipment by Type',
          data: Object.entries(typeData).map(([label, value]) => ({
            label,
            value,
          })),
          xAxis: 'Equipment Type',
          yAxis: 'Count',
        },
      ],
    };
  }

  // Inventory visualizations (stock_item records)
  if (sources.some(s => s.metadata?.domain === 'inventory' || s.metadata?.record_type === 'stock_item')) {
    const manufacturerData: Record<string, number> = {};
    const warehouseData: Record<string, number> = {};
    const reorderData: Record<string, number> = { 'Needs Reorder': 0, 'Stock OK': 0 };
    let totalValue = 0;

    sources.forEach(s => {
      const manufacturer = s.metadata?.manufacturer || 'unknown';
      manufacturerData[manufacturer] = (manufacturerData[manufacturer] || 0) + 1;

      const warehouse = s.metadata?.warehouse_location || 'unknown';
      warehouseData[warehouse] = (warehouseData[warehouse] || 0) + 1;

      if (s.metadata?.needs_reorder) {
        reorderData['Needs Reorder']++;
      } else {
        reorderData['Stock OK']++;
      }

      totalValue += s.metadata?.total_value || 0;
    });

    return {
      charts: [
        {
          type: 'pie',
          title: 'Items by Manufacturer',
          data: Object.entries(manufacturerData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 7)
            .map(([label, value]) => ({
              label,
              value,
            })),
        },
        {
          type: 'bar',
          title: 'Items by Warehouse',
          data: Object.entries(warehouseData).map(([label, value]) => ({
            label,
            value,
          })),
          xAxis: 'Warehouse',
          yAxis: 'Count',
        },
        {
          type: 'pie',
          title: 'Reorder Status',
          data: Object.entries(reorderData).map(([label, value]) => ({
            label,
            value,
          })),
        },
      ],
    };
  }

  // Marketing visualizations
  if (sources.some(s => s.metadata?.domain === 'marketing')) {
    const channelData: Record<string, number> = {};
    const sourceData: Record<string, number> = {};

    sources.forEach(s => {
      const channel = s.metadata?.channel || 'unknown';
      channelData[channel] = (channelData[channel] || 0) + 1;

      const leadSource = s.metadata?.lead_source || 'unknown';
      sourceData[leadSource] = (sourceData[leadSource] || 0) + 1;
    });

    return {
      charts: [
        {
          type: 'pie',
          title: 'Marketing Channel Distribution',
          data: Object.entries(channelData).map(([label, value]) => ({
            label,
            value,
          })),
        },
        {
          type: 'bar',
          title: 'Lead Sources',
          data: Object.entries(sourceData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 7)
            .map(([label, value]) => ({
              label,
              value,
            })),
          xAxis: 'Source',
          yAxis: 'Count',
        },
      ],
    };
  }

  // Generic visualization for mixed results - by record type
  const recordTypeData: Record<string, number> = {};
  const regionData: Record<string, number> = {};

  sources.forEach(s => {
    const recordType = s.metadata?.record_type || 'unknown';
    recordTypeData[recordType] = (recordTypeData[recordType] || 0) + 1;

    const region = s.metadata?.region || s.metadata?.state || 'unknown';
    if (region !== 'unknown') {
      regionData[region] = (regionData[region] || 0) + 1;
    }
  });

  // Only return charts if we have meaningful data
  if (Object.keys(recordTypeData).length > 1 || Object.keys(regionData).length > 1) {
    const charts: any[] = [];

    if (Object.keys(recordTypeData).length > 1) {
      charts.push({
        type: 'pie',
        title: 'Results by Record Type',
        data: Object.entries(recordTypeData).map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
      });
    }

    if (Object.keys(regionData).length > 1) {
      charts.push({
        type: 'bar',
        title: 'Results by Region',
        data: Object.entries(regionData)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([label, value]) => ({
            label,
            value,
          })),
        xAxis: 'Region',
        yAxis: 'Count',
      });
    }

    if (charts.length > 0) {
      return { charts };
    }
  }

  return null;
}

// Aggregate invoice results into vendor entities
function aggregateVendorEntities(results: any[]): SearchResult[] {
  const vendorMap = new Map<string, {
    invoices: any[];
    totalAmount: number;
    dates: string[];
    services: Set<string>;
    paymentStatuses: string[];
  }>();

  // Group by vendor
  for (const result of results) {
    const vendorName = result.manufacturer || result.vendor || 'Unknown Vendor';

    if (!vendorMap.has(vendorName)) {
      vendorMap.set(vendorName, {
        invoices: [],
        totalAmount: 0,
        dates: [],
        services: new Set(),
        paymentStatuses: [],
      });
    }

    const vendor = vendorMap.get(vendorName)!;
    vendor.invoices.push(result);
    vendor.totalAmount += result.total_amount || result.amount || 0;

    if (result.service_date || result.date_display) {
      vendor.dates.push(result.service_date || result.date_display);
    }

    if (result.service_type) {
      vendor.services.add(result.service_type);
    }

    if (result.payment_status) {
      vendor.paymentStatuses.push(result.payment_status);
    }
  }

  // Convert to entity cards
  const entities: SearchResult[] = [];

  for (const [vendorName, data] of vendorMap.entries()) {
    const paidCount = data.paymentStatuses.filter(s => s === 'paid').length;
    const lastDate = data.dates.sort().reverse()[0] || '';

    entities.push({
      id: `vendor-${vendorName.toLowerCase().replace(/\s+/g, '-')}`,
      text: `${vendorName}: ${data.invoices.length} invoices, $${data.totalAmount.toFixed(2)} total`,
      metadata: {
        // Required base fields
        date: lastDate,
        vendor: vendorName,
        amount: data.totalAmount,
        account: 'aggregated',
        opco_id: 'all',
        role_required: 'employee',
        // Vendor aggregation fields
        entity_type: 'vendor',
        vendor_name: vendorName,
        invoice_count: data.invoices.length,
        total_amount: data.totalAmount,
        avg_amount: data.totalAmount / data.invoices.length,
        last_service_date: lastDate,
        services: Array.from(data.services).join(', '),
        paid_count: paidCount,
        outstanding_count: data.invoices.length - paidCount,
        payment_rate: ((paidCount / data.invoices.length) * 100).toFixed(0) + '%',
      },
      score: data.invoices.length, // Use count as score for sorting
    });
  }

  // Sort by invoice count (descending)
  return entities.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// Function tool definitions for OpenAI
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_all',
      description: 'General search across ALL data types - invoices, expenses, CRM contacts, deals, activities, inventory, marketing campaigns, leads, and regional data. Use this for broad queries or when the user wants to search across multiple domains.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'REQUIRED: The user\'s search query. Examples: "list all equipment", "show me everything from Q4", "all records for Carrier".',
          },
          record_type: {
            type: 'string',
            enum: ['invoice', 'expense', 'gl_entry', 'contact', 'deal', 'activity', 'campaign', 'lead', 'stock_item', 'regional_summary'],
            description: 'Optionally filter by specific record type',
          },
          top_k: {
            type: 'number',
            description: 'Number of results to return (default 25, max 100)',
            default: 25,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_invoices',
      description: 'Search for invoices and service transactions. Use this to find billing information, payment status, service history, and financial records.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'REQUIRED: The user\'s search query or question about invoices. This must always contain the user\'s actual search terms. Examples: "overdue invoices", "preventive maintenance in June", "invoices over $5000". Never leave this empty or null.',
          },
          payment_status: {
            type: 'string',
            enum: ['paid', 'outstanding', 'overdue'],
            description: 'Filter by payment status (optional)',
          },
          service_type: {
            type: 'string',
            enum: ['emergency_repair', 'scheduled_repair', 'preventive_maintenance', 'installation_new', 'retrofit', 'diagnostic'],
            description: 'Filter by type of service (optional)',
          },
          fiscal_year: {
            type: 'string',
            description: 'Filter by fiscal year (e.g., "2024") (optional)',
          },
          fiscal_quarter: {
            type: 'string',
            enum: ['Q1', 'Q2', 'Q3', 'Q4'],
            description: 'Filter by fiscal quarter (optional)',
          },
          top_k: {
            type: 'number',
            description: 'Number of results to return (default 10)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_customers',
      description: 'Search for customer information. Use this to find customer details, locations, facility types, and contact information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'REQUIRED: The user\'s search query or question about customers. This must always contain the user\'s actual search terms. Examples: "office buildings in Phoenix", "large facilities over 50000 sq ft", "hospitals". Never leave this empty or null.',
          },
          customer_type: {
            type: 'string',
            enum: ['office_building', 'retail_store', 'warehouse', 'hospital', 'school', 'data_center', 'restaurant', 'hotel', 'manufacturing_plant', 'shopping_mall', 'municipal_building', 'sports_arena', 'senior_living', 'apartment_complex'],
            description: 'Filter by customer facility type (optional)',
          },
          city: {
            type: 'string',
            description: 'Filter by city (optional)',
          },
          state: {
            type: 'string',
            description: 'Filter by state abbreviation (e.g., "AZ", "CA") (optional)',
          },
          top_k: {
            type: 'number',
            description: 'Number of results to return (default 10)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_equipment',
      description: 'Search for HVAC equipment inventory. Use this to find equipment details, condition, age, warranty status, and maintenance needs.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'REQUIRED: The user\'s search query or question about equipment. This must always contain the user\'s actual search terms. Examples: "Carrier rooftop units", "equipment needing replacement", "units with expired warranty". Never leave this empty or null.',
          },
          equipment_type: {
            type: 'string',
            enum: ['rooftop_unit', 'split_system', 'chiller', 'boiler', 'furnace', 'heat_pump', 'air_handler', 'vrf_system', 'package_unit'],
            description: 'Filter by equipment type (optional)',
          },
          manufacturer: {
            type: 'string',
            description: 'Filter by manufacturer (e.g., "Carrier", "Trane", "Lennox") (optional)',
          },
          condition: {
            type: 'string',
            enum: ['excellent', 'good', 'fair', 'poor', 'critical'],
            description: 'Filter by equipment condition (optional)',
          },
          warranty_status: {
            type: 'string',
            enum: ['active', 'expired'],
            description: 'Filter by warranty status (optional)',
          },
          top_k: {
            type: 'number',
            description: 'Number of results to return (default 10)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
  },
];

// Execute a tool call (with server-side security enforcement)
async function executeToolCall(
  toolName: string,
  args: any,
  userOpCoCode: string | null,
  userRole: Role,
  vendorId: string | null,
  originalUserQuery: string,
  userMaxResults?: number
): Promise<any> {
  const openai = getOpenAI();

  // Create Pinecone client inline (exactly like debug endpoint that works)
  const { Pinecone } = await import('@pinecone-database/pinecone');
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY environment variable is not set');
  }
  const indexName = process.env.PINECONE_INDEX_NAME || 'legacy-search';
  const pc = new Pinecone({ apiKey: apiKey.trim() });
  const index = pc.Index(indexName);
  console.log('[Search] Pinecone client created inline, index:', indexName);

  // Use original user query as fallback if LLM didn't provide one
  // This handles cases where OpenAI function calling fails to populate the query parameter
  const searchQuery = (args.query && typeof args.query === 'string' && args.query.trim())
    ? args.query.trim()
    : originalUserQuery.trim();

  if (!searchQuery) {
    throw new Error('Missing or invalid query parameter. The search query is required.');
  }

  // Log if we're using fallback query (for debugging)
  if (searchQuery === originalUserQuery.trim() && args.query !== searchQuery) {
    console.log(`Using fallback query for ${toolName}: LLM provided "${args.query}", using original "${searchQuery}"`);
  }

  // Generate embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: searchQuery,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // Build filter with SERVER-SIDE security enforcement
  const filter: any = {};

  // Domain filter based on tool
  if (toolName === 'search_invoices') {
    filter.domain = { $eq: 'financial' };
    filter.record_type = { $eq: 'invoice' };
  } else if (toolName === 'search_customers') {
    filter.domain = { $eq: 'crm' };
    filter.record_type = { $eq: 'customer' };
  } else if (toolName === 'search_equipment') {
    filter.domain = { $eq: 'field_service' };
    filter.record_type = { $eq: 'equipment' };
  } else if (toolName === 'search_all') {
    // search_all: Only apply record_type filter if explicitly specified
    if (args.record_type) {
      filter.record_type = { $eq: args.record_type };
    }
    // No domain filter for broad search
  }

  // NOTE: Security filters disabled for demo - all data is accessible
  // In production, uncomment to enable OpCo isolation and role-based filtering:
  //
  // if (userOpCoCode && userRole !== 'ADMIN') {
  //   filter.opco_id = { $eq: userOpCoCode };
  // }
  // if (userRole === 'VENDOR_PORTAL' && vendorId) {
  //   filter.vendor_id = { $eq: vendorId };
  // }
  // if (userRole !== 'ADMIN') {
  //   const roleString = roleToString(userRole);
  //   const roleLevel = ROLE_HIERARCHY[roleString] || 1;
  //   const allowedRoles: string[] = [];
  //   for (const [roleName, level] of Object.entries(ROLE_HIERARCHY)) {
  //     if (level <= roleLevel) {
  //       allowedRoles.push(roleName);
  //     }
  //   }
  //   filter.role_required = { $in: allowedRoles };
  // }

  // Apply user-requested filters (from LLM tool call - these are safe)
  if (args.payment_status) {
    filter.payment_status = { $eq: args.payment_status };
  }
  if (args.service_type) {
    filter.service_type = { $eq: args.service_type };
  }
  if (args.fiscal_year) {
    filter.fiscal_year = { $eq: args.fiscal_year };
  }
  if (args.fiscal_quarter) {
    filter.fiscal_quarter = { $eq: args.fiscal_quarter };
  }
  if (args.customer_type) {
    filter.customer_type = { $eq: args.customer_type };
  }
  if (args.city) {
    filter.city = { $eq: args.city };
  }
  if (args.state) {
    filter.state = { $eq: args.state };
  }
  if (args.equipment_type) {
    filter.equipment_type = { $eq: args.equipment_type };
  }
  if (args.manufacturer) {
    filter.manufacturer = { $eq: args.manufacturer };
  }
  if (args.condition) {
    filter.condition = { $eq: args.condition };
  }
  if (args.warranty_status) {
    filter.warranty_status = { $eq: args.warranty_status };
  }

  // Validate filter before querying
  if (Object.keys(filter).length > 0) {
    try {
      validateMetadataFilter(filter);
    } catch (error: any) {
      console.error('Invalid metadata filter:', error.message, filter);
      throw new Error(`Filter validation failed: ${error.message}`);
    }
  }

  // Query Pinecone - simplified direct call (matches working debug endpoint)
  console.log('[Search] Querying Pinecone index:', indexName);
  console.log('[Search] Filter:', JSON.stringify(filter));
  console.log('[Search] TopK:', userMaxResults || args.top_k || (toolName === 'search_all' ? 25 : 10));

  const queryResponse = await index.query({
    vector: queryEmbedding,
    topK: userMaxResults || args.top_k || (toolName === 'search_all' ? 25 : 10),
    includeMetadata: true,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  // Format results for LLM - include all metadata from Pinecone
  const results = (queryResponse.matches || []).map((match) => {
    const meta = match.metadata || {};
    return {
      id: match.id,
      score: match.score,
      // Use 'text' field as primary content (all our data has this)
      text: meta.text,
      // Common fields
      domain: meta.domain,
      record_type: meta.record_type,
      opco_id: meta.opco_id,
      company_name: meta.company_name,
      region: meta.region,
      state: meta.state,
      date: meta.date,
      // Financial fields
      vendor: meta.vendor,
      amount: meta.amount,
      payment_status: meta.payment_status,
      service_type: meta.service_type,
      invoice_number: meta.invoice_number,
      // Accounting fields
      category: meta.category,
      description: meta.description,
      account_name: meta.account_name,
      debit: meta.debit,
      credit: meta.credit,
      // CRM fields
      first_name: meta.first_name,
      last_name: meta.last_name,
      email: meta.email,
      title: meta.title,
      status: meta.status,
      deal_name: meta.deal_name,
      deal_value: meta.deal_value,
      stage: meta.stage,
      activity_type: meta.activity_type,
      // Inventory fields
      sku: meta.sku,
      item_name: meta.item_name,
      manufacturer: meta.manufacturer,
      quantity_on_hand: meta.quantity_on_hand,
      unit_cost: meta.unit_cost,
      total_value: meta.total_value,
      warehouse_location: meta.warehouse_location,
      needs_reorder: meta.needs_reorder,
      // Marketing fields
      campaign_name: meta.campaign_name,
      channel: meta.channel,
      budget: meta.budget,
      leads_generated: meta.leads_generated,
      lead_source: meta.lead_source,
      lead_score: meta.score,  // renamed to avoid overwriting similarity score
      // Regional fields
      year: meta.year,
      quarter: meta.quarter,
      total_revenue: meta.total_revenue,
    };
  });

  return {
    results,
    count: results.length,
    filters_applied: filter,
  };
}

export async function POST(request: NextRequest) {
  console.log('Search API called');
  console.log('Runtime:', process.env.NEXT_RUNTIME);
  console.log('Is Node.js:', !!process.versions?.node);
  console.log('Node version:', process.versions?.node);
  try {
    // Validate session
    const token = request.cookies.get('session')?.value;
    console.log('Session token present:', !!token);
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.log('Validating session...');
    const user = await validateSession(token);
    console.log('Session validated:', user ? 'valid' : 'invalid');
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { query, maxResults } = body;
    const userMaxResults = Math.min(100, Math.max(1, maxResults || 25));

    if (!query) {
      return NextResponse.json(
        { error: 'Missing required field: query' },
        { status: 400 }
      );
    }

    // Check OpCo access
    if (!user.opCoCode && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'User has no OpCo assigned' },
        { status: 403 }
      );
    }

    console.log('Initializing OpenAI...');
    const openai = getOpenAI();
    console.log('OpenAI initialized, calling API...');

    // Initial LLM call with function calling
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant for searching historical HVAC business data.

# Available Tools

You have access to four search tools. Each tool REQUIRES a query parameter:

1. **search_all** - PREFERRED for broad searches across ALL data types (invoices, expenses, contacts, deals, activities, inventory, marketing, leads, regional data)
   - Use this for queries like "list all equipment", "show me everything", "find all records", "list everything from Carrier"
   - Returns up to 25 results by default
   - Can optionally filter by record_type: invoice, expense, gl_entry, contact, deal, activity, campaign, lead, stock_item, regional_summary

2. **search_invoices** - Search billing, payment, and service transaction records
   - Use filters like payment_status, service_type, fiscal_year when explicitly mentioned

3. **search_customers** - Search customer information and facility details
   - Use filters like customer_type, city, state when explicitly mentioned

4. **search_equipment** - Search HVAC equipment inventory (legacy data only)
   - Use filters like equipment_type, manufacturer, condition when explicitly mentioned

# Instructions

- CRITICAL: ALWAYS provide the user's question or search terms in the "query" parameter. Never call a tool with an empty or null query.
- For broad queries like "list all X" or "show me everything", use **search_all** - it searches across all data types.
- When in doubt, use search_all rather than a more specific tool.
- Extract filters from the user's query when mentioned (Q1, Q2, Q3, Q4, paid, overdue, etc.) but don't require them.
- You can call multiple tools if needed to fully answer the question.
- Be specific and cite source data in your responses.

# Examples

User: "List all equipment" or "Show me inventory"
→ Call: search_all(query="equipment inventory", record_type="stock_item")

User: "Show me everything from Carrier"
→ Call: search_all(query="Carrier")

User: "List all records"
→ Call: search_all(query="all records")

User: "Show me overdue invoices"
→ Call: search_invoices(query="overdue invoices", payment_status="overdue")

User: "Find CRM contacts"
→ Call: search_all(query="CRM contacts", record_type="contact")

User: "What deals are in the pipeline?"
→ Call: search_all(query="deals pipeline", record_type="deal")

User: "Show me marketing campaigns"
→ Call: search_all(query="marketing campaigns", record_type="campaign")

User: "Tell me about that"
→ Response: "I need more context. What would you like to know about?"`,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      tools,
      tool_choice: 'auto',
      temperature: 0,  // Use temperature 0 for consistent, deterministic function calling
      seed: 42,        // Optional: ensures reproducibility
    });

    const responseMessage = initialResponse.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    // If no tool calls, return direct response
    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({
        answer: responseMessage.content || 'I need more information to answer your question.',
        sources: [],
      });
    }

    // Execute tool calls (with server-side security)
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    const allSources: SearchResult[] = [];

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      // Execute with SERVER-SIDE security enforcement
      const result = await executeToolCall(
        functionName,
        functionArgs,
        user.opCoCode,
        user.role,
        user.vendorId,
        query,  // Pass original user query as fallback
        userMaxResults
      );

      // Collect sources for response with detailed metadata
      for (const r of result.results) {
        // Determine the best amount field based on record type
        let amount = 0;
        if (r.amount) amount = r.amount;
        else if (r.total_value) amount = r.total_value;
        else if (r.deal_value) amount = r.deal_value;
        else if (r.budget) amount = r.budget;
        else if (r.total_revenue) amount = r.total_revenue;
        else if (r.unit_cost) amount = r.unit_cost;

        const source: SearchResult = {
          id: r.id,
          text: r.text || r.summary || r.title || '',
          metadata: {
            // Required base fields
            date: r.date || '',
            vendor: r.vendor || r.manufacturer || '',
            amount: amount,
            account: r.account || r.category || '',
            opco_id: r.opco_id || '',
            role_required: r.role_required || 'employee',
            // Additional common metadata
            company_name: r.company_name || '',
            region: r.region || '',
            state: r.state || '',
            domain: r.domain || '',
            record_type: r.record_type || '',
            // Financial
            payment_status: r.payment_status,
            service_type: r.service_type,
            invoice_number: r.invoice_number,
            category: r.category,
            // CRM
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            title: r.title,
            status: r.status,
            deal_name: r.deal_name,
            stage: r.stage,
            activity_type: r.activity_type,
            // Inventory
            sku: r.sku,
            item_name: r.item_name,
            manufacturer: r.manufacturer,
            quantity_on_hand: r.quantity_on_hand,
            unit_cost: r.unit_cost,
            total_value: r.total_value,
            warehouse_location: r.warehouse_location,
            needs_reorder: r.needs_reorder,
            // Marketing
            campaign_name: r.campaign_name,
            channel: r.channel,
            budget: r.budget,
            leads_generated: r.leads_generated,
            lead_source: r.lead_source,
            // Regional
            year: r.year,
            quarter: r.quarter,
            total_revenue: r.total_revenue,
          },
          score: r.score || 0,
        };

        allSources.push(source);
      }

      // Add tool result to conversation
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result, null, 2),
      });
    }

    // Apply entity aggregation if this is an entity-level query
    const detectedEntityType = detectEntityQuery(query);
    let finalSources = allSources;
    let actualEntityType: 'vendor' | 'customer' | 'equipment' | null = null;

    if (detectedEntityType === 'vendor' && allSources.length > 0) {
      // Check if results are from invoices (can aggregate into vendors)
      const hasInvoiceResults = allSources.some(s => s.metadata?.domain === 'financial');

      if (hasInvoiceResults) {
        console.log(`Entity aggregation: Detected vendor query, aggregating ${allSources.length} invoice results into vendor cards`);

        // Convert allSources back to raw results format for aggregation
        const rawResults = allSources.map(s => ({
          id: s.id,
          summary: s.text,
          title: s.text,
          manufacturer: s.metadata?.vendor || '',
          vendor: s.metadata?.vendor || '',
          total_amount: s.metadata?.amount || 0,
          amount: s.metadata?.amount || 0,
          service_date: s.metadata?.date || '',
          date_display: s.metadata?.date || '',
          service_type: s.metadata?.service_type || '',
          payment_status: s.metadata?.payment_status || '',
          score: s.score,
        }));

        finalSources = aggregateVendorEntities(rawResults);
        actualEntityType = 'vendor'; // Only set if aggregation actually happened
      }
    } else if (detectedEntityType === 'customer' || detectedEntityType === 'equipment') {
      actualEntityType = detectedEntityType;
    }
    // Note: customers and equipment are already entity-level, no aggregation needed

    // Get final response from LLM
    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant for searching historical HVAC business data.

Instead of listing each result in detail, provide a high-level summary that includes:
1. The count of results found (e.g., "Found 6 invoices")
2. The type of records (invoices, customers, or equipment)
3. A brief overview of what the results show (e.g., key patterns, date ranges, amounts, common characteristics)

Do NOT create a detailed markdown list of each individual record. The detailed information will be displayed separately in the sources section. Keep your response concise, informative, and focused on the big picture.`,
        },
        {
          role: 'user',
          content: query,
        },
        responseMessage,
        ...toolMessages,
      ],
      temperature: 0.3,  // Slightly higher for more natural language responses, but still consistent
    });

    const answer = finalResponse.choices[0].message.content || 'Unable to generate response';

    // Generate visualization data when appropriate
    const visualization = generateVisualization(finalSources, actualEntityType, query);

    const response: SearchResponse = {
      answer,
      sources: finalSources,
      ...(visualization && { visualization }),
    };

    const jsonResponse = NextResponse.json(response);

    // CORS headers for local development
    jsonResponse.headers.set('Access-Control-Allow-Origin', 'http://localhost:4000');
    jsonResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    jsonResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    jsonResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return jsonResponse;
  } catch (error: any) {
    // Enhanced error logging
    const errorInfo: Record<string, any> = {
      message: error?.message,
      status: error?.status,
      name: error?.name,
      code: error?.code,
      cause: error?.cause,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
    };

    // If it's a PineconeError, include the detailed info
    if (error instanceof PineconeError || error?.name === 'PineconeError') {
      errorInfo.pineconeOperation = error.operation;
      errorInfo.pineconeDetails = error.details;
      errorInfo.originalError = error.originalError ? {
        message: error.originalError.message,
        name: error.originalError.name,
        status: error.originalError.status,
        code: error.originalError.code,
      } : null;
    }

    console.error('Search error:', JSON.stringify(errorInfo, null, 2));

    // Classify error type for better client-side handling
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    // PineconeError - use the detailed message
    if (error instanceof PineconeError || error?.name === 'PineconeError') {
      errorMessage = error.message;
      // Map to appropriate status code
      if (error.message.includes('authentication') || error.message.includes('API key')) {
        statusCode = 401;
      } else if (error.message.includes('access denied')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('rate limit')) {
        statusCode = 429;
      } else if (error.message.includes('network')) {
        statusCode = 503;
      }
    }
    // Authentication errors
    else if (error?.status === 401 || error?.status === 403) {
      statusCode = 401;
      errorMessage = 'Authentication failed. Please check your API keys.';
    }
    // Rate limiting
    else if (error?.status === 429) {
      statusCode = 429;
      errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
    }
    // Validation errors
    else if (error?.status === 400 || error?.message?.includes('validation') || error?.message?.includes('Filter validation')) {
      statusCode = 400;
      errorMessage = `Invalid request: ${error?.message}`;
    }
    // Dimension mismatch
    else if (error?.message?.includes('dimension')) {
      statusCode = 500;
      errorMessage = 'Embedding dimension mismatch. Please contact support.';
    }
    // Timeout errors
    else if (error?.status === 504 || error?.name?.includes('Timeout')) {
      statusCode = 504;
      errorMessage = 'Request timeout. The query took too long to process.';
    }
    // Service unavailable
    else if (error?.status === 503) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable. Please try again.';
    }
    // Missing query parameter (LLM didn't provide it)
    else if (error?.message?.includes('query') && error?.message?.includes('required')) {
      statusCode = 400;
      errorMessage = 'Unable to process the request. Please rephrase your question.';
    }
    // Connection errors - provide more specific feedback
    else if (error?.message?.includes('Connection error')) {
      statusCode = 503;
      errorMessage = `Pinecone connection failed. This may be due to network issues or invalid credentials. Details: ${error?.message}`;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        // Include detailed debug info for troubleshooting
        debug: {
          message: error?.message,
          name: error?.name,
          code: error?.code,
          operation: error?.operation,
          details: error?.details,
          originalError: error?.originalError ? {
            message: error.originalError.message,
            name: error.originalError.name,
            status: error.originalError.status,
          } : undefined,
        },
      },
      { status: statusCode }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', 'http://localhost:4000');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
