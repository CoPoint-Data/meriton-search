// Force Node.js runtime - Pinecone SDK is not compatible with Edge runtime
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PineconeError } from '@/lib/pinecone';
import { validateMetadataFilter } from '@/lib/pinecone-retry';
import { SearchResponse, SearchResult, ROLE_HIERARCHY } from '@/lib/types';
import { validateSession, roleToString } from '@/lib/auth';
import { Role } from '@prisma/client';

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

// Detect if query is about regional/geographic data
function isRegionalQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const regionalPatterns = [
    /\b(region|regions|regional)\b/,
    /\b(by state|by region|per state|per region)\b/,
    /\b(geographic|geographical|geography)\b/,
    /\b(location|locations|where)\b.*\b(most|highest|lowest|distribution)\b/,
    /\b(compare|comparison)\b.*\b(states?|regions?)\b/,
    /\b(states?|regions?)\b.*\b(compare|comparison)\b/,
    /\b(breakdown|distribution|split)\b.*\b(by|per)\b.*\b(state|region|location)\b/,
    /\b(state|region|location)\b.*\b(breakdown|distribution|split)\b/,
    /\b(northwest|northeast|southwest|southeast|midwest|west|south central|north central)\b/,
    /\b(map|mapping|mapped)\b/,
    /\bby (state|region)\b/,
    /\b(across|throughout)\b.*\b(states?|regions?|country)\b/,
  ];

  return regionalPatterns.some(pattern => pattern.test(lowerQuery));
}

// Generate visualization data for various result types - ADDITIVE approach
function generateVisualization(
  sources: SearchResult[],
  entityType: 'vendor' | 'customer' | 'equipment' | null,
  query: string
): any {
  if (!sources || sources.length === 0) return null;

  // Check if this is a regional query - only then should we consider using maps
  const isRegional = isRegionalQuery(query);

  // Collect ALL applicable charts - additive approach
  const charts: any[] = [];

  // === COLLECT DATA FROM ALL SOURCES ===
  const recordTypeData: Record<string, number> = {};
  const regionData: Record<string, number> = {};
  const vendorData: Record<string, number> = {};
  const paymentStatusData: Record<string, number> = {};
  const serviceTypeData: Record<string, number> = {};
  const monthlyData: Record<string, number> = {};
  const leadSourceData: Record<string, number> = {};
  const stageData: Record<string, number> = {};
  const channelData: Record<string, number> = {};
  const manufacturerData: Record<string, number> = {};
  const warehouseData: Record<string, number> = {};
  const conditionData: Record<string, number> = {};
  const equipmentTypeData: Record<string, number> = {};
  const reorderData: Record<string, number> = { 'Needs Reorder': 0, 'Stock OK': 0 };
  let hasReorderData = false;

  sources.forEach(s => {
    // Record type
    const recordType = s.metadata?.record_type || 'unknown';
    if (recordType !== 'unknown') {
      recordTypeData[recordType] = (recordTypeData[recordType] || 0) + 1;
    }

    // Region/State
    const region = s.metadata?.region || 'unknown';
    if (region !== 'unknown') {
      regionData[region] = (regionData[region] || 0) + 1;
    }

    // Vendor
    const vendor = s.metadata?.vendor;
    if (vendor) {
      vendorData[vendor] = (vendorData[vendor] || 0) + 1;
    }

    // Payment status (financial)
    const paymentStatus = s.metadata?.payment_status;
    if (paymentStatus) {
      paymentStatusData[paymentStatus] = (paymentStatusData[paymentStatus] || 0) + 1;
    }

    // Service type (financial)
    const serviceType = s.metadata?.service_type;
    if (serviceType) {
      serviceTypeData[serviceType] = (serviceTypeData[serviceType] || 0) + 1;
    }

    // Monthly trend
    if (s.metadata?.date && s.metadata?.amount) {
      const month = s.metadata.date.substring(0, 7); // YYYY-MM
      monthlyData[month] = (monthlyData[month] || 0) + s.metadata.amount;
    }

    // Lead source (CRM/marketing)
    const leadSource = s.metadata?.lead_source;
    if (leadSource) {
      leadSourceData[leadSource] = (leadSourceData[leadSource] || 0) + 1;
    }

    // Deal stage (CRM)
    const stage = s.metadata?.stage;
    if (stage) {
      stageData[stage] = (stageData[stage] || 0) + 1;
    }

    // Marketing channel
    const channel = s.metadata?.channel;
    if (channel) {
      channelData[channel] = (channelData[channel] || 0) + 1;
    }

    // Manufacturer (inventory)
    const manufacturer = s.metadata?.manufacturer;
    if (manufacturer) {
      manufacturerData[manufacturer] = (manufacturerData[manufacturer] || 0) + 1;
    }

    // Warehouse (inventory)
    const warehouse = s.metadata?.warehouse_location;
    if (warehouse) {
      warehouseData[warehouse] = (warehouseData[warehouse] || 0) + 1;
    }

    // Equipment condition
    const condition = s.metadata?.condition;
    if (condition) {
      conditionData[condition] = (conditionData[condition] || 0) + 1;
    }

    // Equipment type
    const equipmentType = s.metadata?.equipment_type;
    if (equipmentType) {
      equipmentTypeData[equipmentType] = (equipmentTypeData[equipmentType] || 0) + 1;
    }

    // Reorder status
    if (s.metadata?.needs_reorder !== undefined) {
      hasReorderData = true;
      if (s.metadata.needs_reorder) {
        reorderData['Needs Reorder']++;
      } else {
        reorderData['Stock OK']++;
      }
    }
  });

  // === VENDOR ENTITY VIEW ===
  if (entityType === 'vendor') {
    charts.push({
      type: 'bar',
      title: 'Invoices by Vendor',
      data: sources.slice(0, 10).map(s => ({
        label: s.metadata?.vendor_name || 'Unknown',
        value: s.metadata?.invoice_count || 0,
      })),
      xAxis: 'Vendor',
      yAxis: 'Invoice Count',
    });
    charts.push({
      type: 'bar',
      title: 'Total Amount by Vendor',
      data: sources.slice(0, 10).map(s => ({
        label: s.metadata?.vendor_name || 'Unknown',
        value: s.metadata?.total_amount || 0,
      })),
      xAxis: 'Vendor',
      yAxis: 'Total Amount ($)',
    });
  }

  // === MAP CHART (only for regional queries) ===
  if (isRegional && Object.keys(regionData).length > 1) {
    charts.push({
      type: 'map',
      title: 'Results by Region',
      data: Object.entries(regionData)
        .sort(([,a], [,b]) => b - a)
        .map(([label, value]) => ({
          label,
          value,
        })),
    });
  }

  // === RECORD TYPE PIE (if multiple types) ===
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

  // === PAYMENT STATUS PIE (financial) ===
  if (Object.keys(paymentStatusData).length > 1) {
    charts.push({
      type: 'pie',
      title: 'Payment Status',
      data: Object.entries(paymentStatusData).map(([label, value]) => ({
        label: label.replace(/_/g, ' '),
        value,
      })),
    });
  }

  // === SERVICE TYPE BAR (financial) ===
  if (Object.keys(serviceTypeData).length > 1) {
    charts.push({
      type: 'bar',
      title: 'By Service Type',
      data: Object.entries(serviceTypeData)
        .filter(([label]) => label !== 'unknown')
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
      xAxis: 'Service Type',
      yAxis: 'Count',
    });
  }

  // === MONTHLY LINE CHART (financial with amounts) ===
  if (Object.keys(monthlyData).length > 2) {
    charts.push({
      type: 'line',
      title: 'Monthly Amounts',
      data: Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, value]) => ({
          label,
          value,
        })),
      xAxis: 'Month',
      yAxis: 'Amount ($)',
    });
  }

  // === TOP VENDORS BAR (if not already showing vendor entity view) ===
  if (entityType !== 'vendor' && Object.keys(vendorData).length > 1) {
    charts.push({
      type: 'bar',
      title: 'Top Vendors',
      data: Object.entries(vendorData)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .map(([label, value]) => ({
          label,
          value,
        })),
      xAxis: 'Vendor',
      yAxis: 'Count',
    });
  }

  // === LEAD SOURCE PIE (CRM/marketing) ===
  if (Object.keys(leadSourceData).length > 1) {
    charts.push({
      type: 'pie',
      title: 'Lead Sources',
      data: Object.entries(leadSourceData)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 6)
        .map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
    });
  }

  // === DEAL STAGES BAR (CRM) ===
  if (Object.keys(stageData).length > 1) {
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

  // === MARKETING CHANNELS PIE ===
  if (Object.keys(channelData).length > 1) {
    charts.push({
      type: 'pie',
      title: 'Marketing Channels',
      data: Object.entries(channelData).map(([label, value]) => ({
        label: label.replace(/_/g, ' '),
        value,
      })),
    });
  }

  // === MANUFACTURER PIE (inventory) ===
  if (Object.keys(manufacturerData).length > 1) {
    charts.push({
      type: 'pie',
      title: 'By Manufacturer',
      data: Object.entries(manufacturerData)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 7)
        .map(([label, value]) => ({
          label,
          value,
        })),
    });
  }

  // === WAREHOUSE BAR (inventory) ===
  if (Object.keys(warehouseData).length > 1) {
    charts.push({
      type: 'bar',
      title: 'By Warehouse',
      data: Object.entries(warehouseData).map(([label, value]) => ({
        label,
        value,
      })),
      xAxis: 'Warehouse',
      yAxis: 'Count',
    });
  }

  // === EQUIPMENT CONDITION PIE ===
  if (Object.keys(conditionData).length > 1) {
    charts.push({
      type: 'pie',
      title: 'Equipment Condition',
      data: Object.entries(conditionData).map(([label, value]) => ({
        label,
        value,
      })),
    });
  }

  // === EQUIPMENT TYPE BAR ===
  if (Object.keys(equipmentTypeData).length > 1) {
    charts.push({
      type: 'bar',
      title: 'Equipment Types',
      data: Object.entries(equipmentTypeData).map(([label, value]) => ({
        label: label.replace(/_/g, ' '),
        value,
      })),
      xAxis: 'Type',
      yAxis: 'Count',
    });
  }

  // === REORDER STATUS PIE (inventory) ===
  if (hasReorderData && (reorderData['Needs Reorder'] > 0 || reorderData['Stock OK'] > 0)) {
    charts.push({
      type: 'pie',
      title: 'Reorder Status',
      data: Object.entries(reorderData).map(([label, value]) => ({
        label,
        value,
      })),
    });
  }

  // Limit to most relevant charts (max 4 to avoid clutter)
  const maxCharts = 4;
  if (charts.length > maxCharts) {
    // Prioritize: map first (if regional), then pie, then bar, then line
    const prioritized = charts.sort((a, b) => {
      const priority: Record<string, number> = { map: 0, pie: 1, bar: 2, line: 3 };
      return (priority[a.type] || 4) - (priority[b.type] || 4);
    });
    return { charts: prioritized.slice(0, maxCharts) };
  }

  if (charts.length > 0) {
    return { charts };
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

// Tool definitions for OpenAI function calling
const tools: any[] = [
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
          amount_min: {
            type: 'number',
            description: 'Minimum amount filter. Use for queries like "over $1000", "greater than 5000", "more than $500", "at least $100"',
          },
          amount_max: {
            type: 'number',
            description: 'Maximum amount filter. Use for queries like "under $1000", "less than 5000", "below $500", "at most $100"',
          },
          vendor: {
            type: 'string',
            description: 'Filter by vendor/supplier name. Use for queries like "invoices from Carrier", "American Standard purchases"',
          },
          region: {
            type: 'string',
            description: 'Filter by region. Use for queries like "Southwest region", "Northeast data"',
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
          amount_min: {
            type: 'number',
            description: 'Minimum amount filter. Use for queries like "over $1000", "greater than 5000", "at least $500"',
          },
          amount_max: {
            type: 'number',
            description: 'Maximum amount filter. Use for queries like "under $1000", "less than 5000", "at most $500"',
          },
          vendor: {
            type: 'string',
            description: 'Filter by vendor/supplier name. Use for queries like "Carrier invoices", "American Standard"',
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
  console.log('[executeToolCall] Step 1: Starting...');

  // Create Pinecone client inline (exactly like debug endpoint that works)
  console.log('[executeToolCall] Step 3: Importing Pinecone...');
  const { Pinecone } = await import('@pinecone-database/pinecone');
  console.log('[executeToolCall] Step 4: Pinecone imported');

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY environment variable is not set');
  }
  const indexName = process.env.PINECONE_INDEX_NAME || 'legacy-search';
  console.log('[executeToolCall] Step 5: Creating Pinecone client...');
  const pc = new Pinecone({ apiKey: apiKey.trim() });
  console.log('[executeToolCall] Step 6: Pinecone client created');
  const index = pc.Index(indexName);
  console.log('[executeToolCall] Step 7: Index reference created:', indexName);

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

  // Generate embedding using raw fetch (OpenAI SDK has connection issues on Vercel)
  console.log('[executeToolCall] Step 8: Generating embedding for query:', searchQuery.substring(0, 50));
  let queryEmbedding: number[];
  try {
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: searchQuery,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json();
      throw new Error(`OpenAI embedding API error: ${embeddingResponse.status} - ${JSON.stringify(errorData)}`);
    }

    const embeddingData = await embeddingResponse.json();
    queryEmbedding = embeddingData.data[0].embedding;
    console.log('[executeToolCall] Step 9: Embedding generated, dimensions:', queryEmbedding.length);
  } catch (embError: any) {
    console.error('[executeToolCall] EMBEDDING ERROR:', embError.message);
    throw embError;
  }

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

  // Amount range filters (for numeric filtering)
  if (args.amount_min !== undefined && args.amount_min !== null) {
    filter.amount = filter.amount || {};
    filter.amount.$gte = args.amount_min;
    console.log('[executeToolCall] Applying amount_min filter:', args.amount_min);
  }
  if (args.amount_max !== undefined && args.amount_max !== null) {
    filter.amount = filter.amount || {};
    filter.amount.$lte = args.amount_max;
    console.log('[executeToolCall] Applying amount_max filter:', args.amount_max);
  }

  // Vendor filter (text match)
  if (args.vendor) {
    filter.vendor = { $eq: args.vendor };
    console.log('[executeToolCall] Applying vendor filter:', args.vendor);
  }

  // Region filter
  if (args.region) {
    filter.region = { $eq: args.region };
    console.log('[executeToolCall] Applying region filter:', args.region);
  }

  // Note: Year filtering is done via query text (semantic search), not metadata filter
  // because invoice records only have 'date' string field, not 'year' number field

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
  console.log('[executeToolCall] Step 10: About to query Pinecone');
  console.log('[Search] Querying Pinecone index:', indexName);
  console.log('[Search] Filter:', JSON.stringify(filter));
  console.log('[Search] TopK:', userMaxResults || args.top_k || (toolName === 'search_all' ? 25 : 10));

  let queryResponse;
  try {
    queryResponse = await index.query({
      vector: queryEmbedding,
      topK: userMaxResults || args.top_k || (toolName === 'search_all' ? 25 : 10),
      includeMetadata: true,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });
    console.log('[executeToolCall] Step 11: Pinecone query successful, matches:', queryResponse.matches?.length);
  } catch (pcError: any) {
    console.error('[executeToolCall] PINECONE QUERY ERROR:', pcError.message);
    console.error('[executeToolCall] PINECONE ERROR DETAILS:', JSON.stringify({
      name: pcError.name,
      message: pcError.message,
      cause: pcError.cause,
    }));
    throw pcError;
  }

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

    console.log('Calling OpenAI API via raw fetch...');

    // Helper function for OpenAI chat completions via raw fetch (SDK has connection issues on Vercel)
    async function callOpenAIChatCompletion(requestBody: any) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return response.json();
    }

    // Initial LLM call with function calling
    const initialResponse = await callOpenAIChatCompletion({
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
   - IMPORTANT: For date/year/quarter filtering, include the time period in the query text (e.g., "Q4 2023 invoices", "2024 records", "October-December invoices")

2. **search_invoices** - Search billing, payment, and service transaction records
   - Use filters like payment_status, service_type when explicitly mentioned
   - IMPORTANT: For date/year/quarter filtering, include the time period in the query text (e.g., "Q4 invoices", "2023 bills")

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

User: "Invoices over $1000" or "purchases greater than 1000"
→ Call: search_invoices(query="invoices", amount_min=1000)

User: "Invoices under $500"
→ Call: search_invoices(query="invoices", amount_max=500)

User: "Expenses between $100 and $1000"
→ Call: search_all(query="expenses", record_type="expense", amount_min=100, amount_max=1000)

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
    const toolMessages: any[] = [];
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
    const finalResponse = await callOpenAIChatCompletion({
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
