'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { US_STATES, STATE_TO_REGION } from '@/lib/us-states-data';

// Metric Card Component
interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

function MetricCard({ label, value, trend, subtitle }: MetricCardProps) {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-meriton-gray',
  };

  return (
    <div className="bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-meriton-gray uppercase tracking-wide">{label}</div>
        {trend && (
          <span className={`text-xs font-medium ${trendColors[trend]}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
      <div className="text-xl font-semibold text-meriton-charcoal dark:text-white mb-1">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-meriton-silver">{subtitle}</div>
      )}
    </div>
  );
}

// Chart components
function BarChart({ chart }: { chart: Chart }) {
  const maxValue = Math.max(...chart.data.map(d => d.value));
  // Colorful palette for bar charts
  const barColors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-orange-500',
  ];
  const textColors = [
    'text-blue-600',
    'text-emerald-600',
    'text-violet-600',
    'text-amber-600',
    'text-rose-600',
    'text-cyan-600',
    'text-orange-600',
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-meriton-charcoal dark:text-white mb-4">{chart.title}</h3>
      <div className="space-y-3">
        {chart.data.map((item, idx) => {
          const percentage = (item.value / maxValue) * 100;
          const isSmallBar = percentage < 20;

          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-meriton-gray">{item.label}</span>
                <span className="font-medium text-meriton-charcoal dark:text-white">
                  {chart.yAxis?.includes('$') ? `$${item.value.toLocaleString()}` : item.value}
                </span>
              </div>
              <div className="w-full bg-meriton-light dark:bg-meriton-dark h-6 rounded relative">
                <div
                  className={`${barColors[idx % barColors.length]} h-full transition-all duration-500 rounded`}
                  style={{ width: `${percentage}%` }}
                />
                {/* Percentage label - outside bar for small values, inside for large */}
                <span
                  className={`absolute top-1/2 -translate-y-1/2 text-xs font-medium ${
                    isSmallBar
                      ? `left-[${percentage}%] ml-2 ${textColors[idx % textColors.length]} dark:text-meriton-silver`
                      : 'right-2 text-white'
                  }`}
                  style={isSmallBar ? { left: `${percentage}%` } : {}}
                >
                  {percentage.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {chart.xAxis && chart.yAxis && (
        <div className="flex justify-between text-xs text-meriton-silver mt-4">
          <span>{chart.xAxis}</span>
          <span>{chart.yAxis}</span>
        </div>
      )}
    </div>
  );
}

function PieChart({ chart }: { chart: Chart }) {
  const total = chart.data.reduce((sum, item) => sum + item.value, 0);
  // Colorful palette for pie charts
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-orange-500',
  ];
  const strokeColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4', '#f97316'];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-meriton-charcoal dark:text-white">{chart.title}</h3>
      <div className="flex items-center justify-center">
        <div className="relative w-48 h-48">
          <svg viewBox="0 0 100 100" className="transform -rotate-90">
            {chart.data.reduce((acc, item, idx) => {
              const percentage = (item.value / total) * 100;
              const strokeDasharray = `${percentage} ${100 - percentage}`;
              const strokeDashoffset = -acc.offset;
              const color = strokeColors[idx % strokeColors.length];

              acc.circles.push(
                <circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r="15.9155"
                  fill="transparent"
                  stroke={color}
                  strokeWidth="31.831"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                />
              );

              acc.offset += percentage;
              return acc;
            }, { circles: [] as React.ReactElement[], offset: 0 }).circles}
          </svg>
        </div>
      </div>
      <div className="space-y-2">
        {chart.data.map((item, idx) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={idx} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 ${colors[idx % colors.length]}`} />
                <span className="text-meriton-gray">{item.label}</span>
              </div>
              <span className="font-medium text-meriton-charcoal dark:text-white">
                {item.value} ({percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineChart({ chart }: { chart: Chart }) {
  const maxValue = Math.max(...chart.data.map(d => d.value));
  const minValue = Math.min(...chart.data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const points = chart.data.map((item, idx) => {
    const x = (idx / (chart.data.length - 1)) * 100;
    const y = 100 - ((item.value - minValue) / range) * 80;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-meriton-charcoal dark:text-white">{chart.title}</h3>
      <div className="relative h-48">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          {/* Gradient fill under the line */}
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,100 ${points} 100,100`}
            fill="url(#lineGradient)"
          />
          <polyline
            points={points}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            className="transition-all duration-500"
          />
          {chart.data.map((item, idx) => {
            const x = (idx / (chart.data.length - 1)) * 100;
            const y = 100 - ((item.value - minValue) / range) * 80;
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r="2"
                fill="#3b82f6"
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {chart.data.map((item, idx) => (
          <div key={idx} className="text-xs">
            <div className="text-meriton-silver">{item.label}</div>
            <div className="font-medium text-meriton-charcoal dark:text-white">
              {chart.yAxis?.includes('$') ? `$${item.value.toLocaleString()}` : item.value}
            </div>
          </div>
        ))}
      </div>
      {chart.xAxis && chart.yAxis && (
        <div className="flex justify-between text-xs text-meriton-silver">
          <span>{chart.xAxis}</span>
          <span>{chart.yAxis}</span>
        </div>
      )}
    </div>
  );
}

// US Region Map Component - Choropleth style with actual US state boundaries
function RegionMap({ chart }: { chart: Chart }) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  // Map region names to data values
  const regionData: Record<string, number> = {};
  const maxValue = Math.max(...chart.data.map(d => d.value), 1);
  chart.data.forEach(item => {
    regionData[item.label.toLowerCase()] = item.value;
  });

  // Get color intensity based on value (darker = higher value)
  const getRegionColor = (regionName: string) => {
    const value = regionData[regionName.toLowerCase()] || 0;
    const intensity = value / maxValue;
    // Blue color scale from light to dark
    const lightness = 90 - (intensity * 50); // 90% (light) to 40% (dark)
    return `hsl(217, 91%, ${lightness}%)`;
  };

  // Group states by region
  const statesByRegion: Record<string, string[]> = {};
  Object.entries(STATE_TO_REGION).forEach(([state, region]) => {
    if (!statesByRegion[region]) {
      statesByRegion[region] = [];
    }
    statesByRegion[region].push(state);
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-meriton-charcoal dark:text-white">{chart.title}</h3>

      {/* US Map with real state boundaries */}
      <div className="relative bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
        <svg viewBox="0 0 960 600" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Render each state */}
          {Object.entries(US_STATES).map(([stateCode, stateData]) => {
            const region = STATE_TO_REGION[stateCode] || '';
            const isRegionHovered = hoveredRegion?.toLowerCase() === region;
            const isStateHovered = hoveredState === stateCode;
            const hasData = regionData[region] !== undefined;

            return (
              <path
                key={stateCode}
                d={stateData.dimensions}
                fill={hasData ? getRegionColor(region) : '#e2e8f0'}
                stroke={isStateHovered || isRegionHovered ? '#1e40af' : '#94a3b8'}
                strokeWidth={isStateHovered ? 2 : isRegionHovered ? 1.5 : 0.5}
                className="transition-all duration-150 cursor-pointer"
                onMouseEnter={() => {
                  setHoveredState(stateCode);
                  setHoveredRegion(region);
                }}
                onMouseLeave={() => {
                  setHoveredState(null);
                  setHoveredRegion(null);
                }}
              >
                <title>{stateData.name} ({region})</title>
              </path>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredRegion && (
          <div className="absolute top-2 right-2 bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark rounded-lg shadow-lg p-3 z-10 min-w-[140px]">
            {hoveredState && (
              <div className="text-xs text-meriton-gray mb-1">
                {US_STATES[hoveredState]?.name}
              </div>
            )}
            <div className="text-sm font-semibold text-meriton-charcoal dark:text-white capitalize">
              {hoveredRegion.replace(/_/g, ' ')}
            </div>
            <div className="text-lg font-bold text-blue-600">
              {chart.yAxis?.includes('$')
                ? `$${(regionData[hoveredRegion.toLowerCase()] || 0).toLocaleString()}`
                : (regionData[hoveredRegion.toLowerCase()] || 0).toLocaleString()
              }
            </div>
          </div>
        )}

        {/* Color scale legend */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span>Low</span>
          <div className="flex h-2">
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((intensity) => (
              <div
                key={intensity}
                className="w-4 h-full"
                style={{ backgroundColor: `hsl(217, 91%, ${90 - intensity * 50}%)` }}
              />
            ))}
          </div>
          <span>High</span>
        </div>
      </div>

      {/* Data table */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {chart.data
          .sort((a, b) => b.value - a.value)
          .map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between py-1 px-2 rounded transition-colors cursor-pointer ${
              hoveredRegion?.toLowerCase() === item.label.toLowerCase()
                ? 'bg-blue-50 dark:bg-blue-900/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            onMouseEnter={() => setHoveredRegion(item.label)}
            onMouseLeave={() => setHoveredRegion(null)}
          >
            <span className="text-meriton-gray">{item.label}</span>
            <span className="font-semibold text-meriton-charcoal dark:text-white">
              {chart.yAxis?.includes('$') ? `$${item.value.toLocaleString()}` : item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartRenderer({ chart }: { chart: Chart }) {
  switch (chart.type) {
    case 'bar':
      return <BarChart chart={chart} />;
    case 'pie':
      return <PieChart chart={chart} />;
    case 'line':
      return <LineChart chart={chart} />;
    case 'map':
      return <RegionMap chart={chart} />;
    default:
      return null;
  }
}

interface SearchResult {
  id: string;
  text: string;
  metadata: {
    date: string;
    vendor: string;
    amount: number;
    account: string;
    opco_id: string;
  };
  score: number;
}

interface ChartData {
  label: string;
  value: number;
}

interface Chart {
  type: 'pie' | 'bar' | 'line' | 'map';
  title: string;
  data: ChartData[];
  xAxis?: string;
  yAxis?: string;
}

interface Visualization {
  charts: Chart[];
}

interface SearchResponse {
  answer: string;
  sources: SearchResult[];
  visualization?: Visualization;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  opCoCode: string | null;
}

export default function SearchInterface() {
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState(25);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [resultFilter, setResultFilter] = useState<string>('');
  const [expandedPanel, setExpandedPanel] = useState<'chart' | 'results' | null>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.user-menu-container')) {
          setUserMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Reset sort and filter when new results come in
  useEffect(() => {
    setSortBy('relevance');
    setResultFilter('');
  }, [results]);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Try to get current user
        const meResponse = await fetch('/api/auth/me');

        if (meResponse.ok) {
          const data = await meResponse.json();
          setUser(data.user);
        } else {
          // Not logged in, redirect to login page
          router.push('/login');
          return;
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        router.push('/login');
        return;
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setUserMenuOpen(false);
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Calculate metrics from results - context-aware based on record types
  const calculateMetrics = () => {
    if (!results || !results.sources || results.sources.length === 0) return null;

    const sources = results.sources;
    const count = sources.length;

    // Detect what types of records we have
    const recordTypes = new Set(sources.map(s => (s.metadata as any)?.record_type || 'unknown'));

    // Check if results have amounts (invoices, expenses, deals have amounts; contacts don't)
    const sourcesWithAmounts = sources.filter(s => {
      const amount = (s.metadata as any)?.amount;
      return amount !== undefined && amount !== null && amount > 0;
    });
    const hasAmounts = sourcesWithAmounts.length > 0;

    // Check for payment status (only relevant for invoices/expenses)
    const hasPaymentStatus = sources.some(s => (s.metadata as any)?.payment_status !== undefined);
    const paidCount = sources.filter(s => (s.metadata as any)?.payment_status === 'paid').length;
    const paidRate = hasPaymentStatus && count > 0 ? (paidCount / count) * 100 : 0;

    // Check for entity aggregation (vendor cards)
    const isVendorView = sources.some(s => (s.metadata as any)?.entity_type === 'vendor');

    // Check for contact-type records (contacts, leads)
    const isContactView = recordTypes.has('contact') || recordTypes.has('lead');
    const onlyContacts = isContactView && !hasAmounts;

    // Check for deals
    const isDealView = recordTypes.has('deal');

    // Calculate totals only if we have amounts
    const total = hasAmounts ? sourcesWithAmounts.reduce((sum, s) => sum + ((s.metadata as any)?.amount || 0), 0) : 0;
    const avg = hasAmounts && sourcesWithAmounts.length > 0 ? total / sourcesWithAmounts.length : 0;

    return {
      total,
      count,
      avg,
      paidRate,
      paidCount,
      isVendorView,
      hasAmounts,
      hasPaymentStatus,
      onlyContacts,
      isDealView,
      recordTypes: Array.from(recordTypes),
    };
  };

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-meriton-charcoal mx-auto"></div>
        <p className="mt-4 text-meriton-gray">Initializing...</p>
      </div>
    );
  }

  const metrics = calculateMetrics();

  // Helper function to get confidence bar color - colorful style
  const getConfidenceColor = (score: number) => {
    const percentage = score * 100;
    if (percentage >= 75) return 'bg-emerald-500';
    if (percentage >= 50) return 'bg-blue-500';
    if (percentage >= 25) return 'bg-amber-500';
    return 'bg-rose-400';
  };

  // Toggle expanded state for a result
  const toggleResultExpanded = (id: string) => {
    setExpandedResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Detect available sort options based on result metadata
  const getAvailableSortOptions = () => {
    if (!results || !results.sources || results.sources.length === 0) {
      return [{ value: 'relevance', label: 'Relevance' }];
    }

    const sources = results.sources;
    const options: { value: string; label: string }[] = [
      { value: 'relevance', label: 'Relevance' }
    ];

    // Check if any results have dates
    const hasDate = sources.some(s => (s.metadata as any)?.date);
    if (hasDate) {
      options.push({ value: 'date_desc', label: 'Date (Newest)' });
      options.push({ value: 'date_asc', label: 'Date (Oldest)' });
    }

    // Check if any results have amounts
    const hasAmount = sources.some(s => {
      const amount = (s.metadata as any)?.amount;
      return amount !== undefined && amount !== null && amount > 0;
    });
    if (hasAmount) {
      options.push({ value: 'amount_desc', label: 'Amount (Highest)' });
      options.push({ value: 'amount_asc', label: 'Amount (Lowest)' });
    }

    // Check for vendor/company name for alphabetical sort
    const hasVendor = sources.some(s => (s.metadata as any)?.vendor || (s.metadata as any)?.company_name);
    if (hasVendor) {
      options.push({ value: 'name_asc', label: 'Name (A-Z)' });
      options.push({ value: 'name_desc', label: 'Name (Z-A)' });
    }

    // Check for confidence/score sorting always available
    options.push({ value: 'confidence_desc', label: 'Confidence (High)' });
    options.push({ value: 'confidence_asc', label: 'Confidence (Low)' });

    return options;
  };

  // Parse date string to timestamp for reliable sorting
  const parseDate = (dateStr: string | undefined): number => {
    if (!dateStr) return 0;
    // Handle various date formats: YYYY-MM-DD, MM/DD/YYYY, etc.
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Sort results based on selected option
  const sortResults = (sources: SearchResult[]) => {
    if (!sources) return [];
    const sorted = [...sources];

    switch (sortBy) {
      case 'date_desc':
        return sorted.sort((a, b) => {
          const dateA = parseDate((a.metadata as any)?.date);
          const dateB = parseDate((b.metadata as any)?.date);
          return dateB - dateA;
        });
      case 'date_asc':
        return sorted.sort((a, b) => {
          const dateA = parseDate((a.metadata as any)?.date);
          const dateB = parseDate((b.metadata as any)?.date);
          return dateA - dateB;
        });
      case 'amount_desc':
        return sorted.sort((a, b) => {
          const amountA = (a.metadata as any)?.amount || 0;
          const amountB = (b.metadata as any)?.amount || 0;
          return amountB - amountA;
        });
      case 'amount_asc':
        return sorted.sort((a, b) => {
          const amountA = (a.metadata as any)?.amount || 0;
          const amountB = (b.metadata as any)?.amount || 0;
          return amountA - amountB;
        });
      case 'name_asc':
        return sorted.sort((a, b) => {
          const nameA = ((a.metadata as any)?.vendor || (a.metadata as any)?.company_name || '').toLowerCase();
          const nameB = ((b.metadata as any)?.vendor || (b.metadata as any)?.company_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
      case 'name_desc':
        return sorted.sort((a, b) => {
          const nameA = ((a.metadata as any)?.vendor || (a.metadata as any)?.company_name || '').toLowerCase();
          const nameB = ((b.metadata as any)?.vendor || (b.metadata as any)?.company_name || '').toLowerCase();
          return nameB.localeCompare(nameA);
        });
      case 'confidence_desc':
        return sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
      case 'confidence_asc':
        return sorted.sort((a, b) => (a.score || 0) - (b.score || 0));
      case 'relevance':
      default:
        return sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
  };

  // Filter results based on search term
  const filterResults = (sources: SearchResult[]) => {
    if (!resultFilter.trim()) return sources;

    const searchTerm = resultFilter.toLowerCase().trim();
    return sources.filter(source => {
      // Search in main text
      if (source.text.toLowerCase().includes(searchTerm)) return true;

      // Search in all metadata values
      const metadata = source.metadata as Record<string, any>;
      for (const key in metadata) {
        const value = metadata[key];
        if (value !== null && value !== undefined) {
          const stringValue = String(value).toLowerCase();
          if (stringValue.includes(searchTerm)) return true;
        }
      }

      return false;
    });
  };

  // Get record type badge color - colorful style
  const getRecordTypeBadge = (recordType: string) => {
    const colors: Record<string, string> = {
      invoice: 'bg-blue-500 text-white',
      expense: 'bg-rose-500 text-white',
      gl_entry: 'bg-violet-500 text-white',
      contact: 'bg-emerald-500 text-white',
      deal: 'bg-amber-500 text-white',
      activity: 'bg-cyan-500 text-white',
      campaign: 'bg-orange-500 text-white',
      lead: 'bg-teal-500 text-white',
      stock_item: 'bg-indigo-500 text-white',
      regional_summary: 'bg-purple-500 text-white',
    };
    return colors[recordType] || 'bg-gray-500 text-white';
  };

  return (
    <div>
      {/* User Account Dropdown - Aligned with content area */}
      {user && (
        <div className="fixed top-4 left-0 right-0 z-[60] pointer-events-none">
          <div className="max-w-7xl mx-auto px-6 flex justify-end">
            <div className="relative user-menu-container pointer-events-auto">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark rounded-lg px-3 py-2 hover:bg-meriton-offwhite dark:hover:bg-meriton-charcoal transition-colors shadow-sm"
            >
              <div className="w-8 h-8 bg-meriton-charcoal rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark rounded-lg shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-meriton-light dark:border-meriton-charcoal">
                  <p className="text-sm font-medium text-meriton-charcoal dark:text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-meriton-gray mt-1">
                    {user.email}
                  </p>
                  <p className="text-xs text-meriton-gray mt-1">
                    {user.role.replace('_', ' ')} {user.opCoCode && `• ${user.opCoCode}`}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm text-meriton-charcoal dark:text-meriton-silver hover:bg-meriton-offwhite dark:hover:bg-meriton-charcoal transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky search form - positioned directly below header */}
      <div className="sticky top-[73px] z-[45] bg-white dark:bg-meriton-charcoal border-b border-meriton-light dark:border-meriton-dark shadow-md" style={{ isolation: 'isolate' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Title section */}
          <div className="mb-4">
            <h1 className="text-2xl font-semibold text-meriton-charcoal dark:text-white tracking-tight">
              Search Archives
            </h1>
            <p className="text-sm text-meriton-gray dark:text-meriton-silver mt-1">
              Search and analyze historical financial records
            </p>
          </div>

          {/* Search form with muted Meriton colors */}
          <form onSubmit={handleSearch} className="bg-meriton-offwhite dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark rounded-lg p-4">
            <div className="mb-4">
              <label htmlFor="query" className="block text-sm font-medium text-meriton-charcoal dark:text-meriton-silver mb-2">
                Search Query
              </label>
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., Show me all invoices from last quarter"
                className="w-full px-4 py-3 border border-meriton-light dark:border-meriton-dark bg-white dark:bg-meriton-charcoal text-meriton-charcoal dark:text-white placeholder-meriton-silver rounded-md focus:outline-none focus:ring-2 focus:ring-meriton-gray focus:border-meriton-gray transition-colors"
                required
              />
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <label htmlFor="maxResults" className="text-sm font-medium text-meriton-charcoal dark:text-meriton-silver">
                  Max Results
                </label>
                <input
                  id="maxResults"
                  type="number"
                  min="1"
                  max="100"
                  value={maxResults}
                  onChange={(e) => setMaxResults(Math.min(100, Math.max(1, parseInt(e.target.value) || 25)))}
                  className="w-20 px-2 py-1 border border-meriton-light dark:border-meriton-dark bg-white dark:bg-meriton-charcoal text-meriton-charcoal dark:text-white text-center rounded-md focus:outline-none focus:ring-2 focus:ring-meriton-gray"
                />
              </div>
              <div className="flex gap-1">
                {[10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxResults(n)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      maxResults === n
                        ? 'bg-meriton-charcoal dark:bg-meriton-silver text-white dark:text-meriton-charcoal'
                        : 'bg-white dark:bg-meriton-charcoal text-meriton-gray dark:text-meriton-silver border border-meriton-light dark:border-meriton-dark hover:bg-meriton-light dark:hover:bg-meriton-dark'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-meriton-charcoal hover:bg-gray-700 disabled:bg-meriton-silver text-white font-medium py-3 px-4 rounded-md transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      )}

      {/* Wide container for results - Dashboard Layout */}
      {results && (
        <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
          {/* Summary */}
          <div className="mb-6">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="w-full bg-meriton-offwhite dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark rounded-lg p-4 text-left hover:bg-meriton-light/50 dark:hover:bg-meriton-charcoal transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-meriton-charcoal dark:text-white">Summary</h3>
                    {!summaryExpanded && (
                      <p className="text-sm text-meriton-gray line-clamp-1">
                        {results.answer}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-meriton-gray">
                  {summaryExpanded ? '▲' : '▼'}
                </span>
              </div>
            </button>
            {summaryExpanded && (
              <div className="bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark rounded-b-lg p-6 -mt-1">
                <div className="text-meriton-charcoal dark:text-meriton-silver leading-relaxed prose dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 mt-6 text-gray-900 dark:text-white" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-3 mt-5 text-gray-900 dark:text-white" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-semibold mb-2 mt-4 text-gray-800 dark:text-gray-100" {...props} />,
                      p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                      ul: ({node, ...props}) => <ul className="mb-4 ml-6 space-y-2 list-disc marker:text-blue-500" {...props} />,
                      ol: ({node, ...props}) => <ol className="mb-4 ml-6 space-y-2 list-decimal marker:text-blue-500 marker:font-semibold" {...props} />,
                      li: ({node, ...props}) => <li className="pl-2" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-semibold text-gray-900 dark:text-white" {...props} />,
                      em: ({node, ...props}) => <em className="italic text-gray-700 dark:text-gray-300" {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-600 dark:text-blue-400 hover:underline" {...props} />,
                      code: ({node, inline, ...props}: any) =>
                        inline ?
                          <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-blue-600 dark:text-blue-400" {...props} /> :
                          <code className="block bg-gray-100 dark:bg-gray-700 p-4 rounded-lg text-sm font-mono overflow-x-auto" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic my-4 text-gray-600 dark:text-gray-400" {...props} />,
                    }}
                  >
                    {results.answer}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Metric Cards - Context-aware based on result types */}
          {metrics && (
            <div className={`grid gap-4 mb-6 ${
              metrics.onlyContacts
                ? 'grid-cols-1 md:grid-cols-2 max-w-xl'
                : metrics.hasPaymentStatus
                  ? 'grid-cols-2 md:grid-cols-4'
                  : 'grid-cols-2 md:grid-cols-3 max-w-3xl'
            }`}>
              {/* Always show record count */}
              <MetricCard
                label={metrics.isVendorView ? "Vendors" : metrics.onlyContacts ? "Contacts" : "Records"}
                value={metrics.count}
                subtitle={metrics.recordTypes.length > 1 ? `${metrics.recordTypes.length} types` : metrics.recordTypes[0]?.replace(/_/g, ' ')}
              />

              {/* Show amounts only if we have financial data */}
              {metrics.hasAmounts && (
                <>
                  <MetricCard
                    label={metrics.isVendorView ? "Total Spend" : metrics.isDealView ? "Pipeline Value" : "Total Amount"}
                    value={`$${metrics.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    trend="neutral"
                  />
                  <MetricCard
                    label="Average"
                    value={`$${metrics.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                </>
              )}

              {/* Show paid rate only if payment status exists */}
              {metrics.hasPaymentStatus && (
                <MetricCard
                  label="Paid Rate"
                  value={`${metrics.paidRate.toFixed(0)}%`}
                  trend={metrics.paidRate >= 80 ? 'up' : metrics.paidRate >= 50 ? 'neutral' : 'down'}
                  subtitle={`${metrics.paidCount}/${metrics.count} paid`}
                />
              )}
            </div>
          )}

          {/* Side-by-side layout: Charts (left 1/3) + Sources (right 2/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT SIDEBAR: Visualizations - Sticky below header and search form with nice margin */}
            {results.visualization && results.visualization.charts.length > 0 && expandedPanel !== 'results' && (
              <div className={expandedPanel === 'chart' ? 'lg:col-span-3' : 'lg:col-span-1'}>
                <div className="relative bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark p-5 lg:sticky lg:top-[280px] max-h-[calc(100vh-300px)] overflow-y-auto rounded-lg shadow-sm">
                  {/* Expand/Collapse button */}
                  <button
                    onClick={() => setExpandedPanel(expandedPanel === 'chart' ? null : 'chart')}
                    className="absolute top-2 right-2 p-1.5 text-meriton-gray hover:text-meriton-charcoal dark:hover:text-white hover:bg-meriton-light dark:hover:bg-meriton-charcoal rounded transition-colors z-10"
                    title={expandedPanel === 'chart' ? 'Collapse' : 'Expand'}
                  >
                    {expandedPanel === 'chart' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    )}
                  </button>
                  <div className="space-y-6">
                    {results.visualization.charts.map((chart, idx) => (
                      <div key={idx} className="pb-6 border-b border-meriton-light dark:border-meriton-dark last:border-b-0 last:pb-0">
                        <ChartRenderer chart={chart} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT MAIN AREA: Sources - Compact List View */}
            <div className={
              expandedPanel === 'results' ? 'lg:col-span-3' :
              expandedPanel === 'chart' ? 'hidden' :
              results.visualization && results.visualization.charts.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'
            }>
              {results.sources.length > 0 && (
                <div className="bg-white dark:bg-meriton-dark border border-meriton-light dark:border-meriton-dark overflow-hidden rounded-lg">
                  {/* List Header with Filter */}
                  <div className="px-4 py-3 bg-meriton-offwhite dark:bg-meriton-charcoal border-b border-meriton-light dark:border-meriton-dark">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Filter Input */}
                      <div className="flex-1 relative">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-meriton-gray"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={resultFilter}
                          onChange={(e) => setResultFilter(e.target.value)}
                          placeholder="Filter results..."
                          className="w-full pl-9 pr-8 py-1.5 text-sm border border-meriton-light dark:border-meriton-dark bg-white dark:bg-meriton-dark text-meriton-charcoal dark:text-white placeholder-meriton-silver rounded focus:outline-none focus:ring-1 focus:ring-meriton-gray"
                        />
                        {resultFilter && (
                          <button
                            onClick={() => setResultFilter('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-meriton-gray hover:text-meriton-charcoal dark:hover:text-white"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Results count, Sort, and Expand button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <span className="text-sm font-medium text-meriton-charcoal dark:text-meriton-silver whitespace-nowrap">
                          {filterResults(results.sources).length} of {results.sources.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-meriton-gray">Sort:</label>
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="text-xs border border-meriton-light dark:border-meriton-dark px-2 py-1 bg-white dark:bg-meriton-dark text-meriton-charcoal dark:text-meriton-silver focus:outline-none rounded"
                          >
                            {getAvailableSortOptions().map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {/* Expand/Collapse button for results */}
                          {results.visualization && results.visualization.charts.length > 0 && (
                            <button
                              onClick={() => setExpandedPanel(expandedPanel === 'results' ? null : 'results')}
                              className="p-1.5 text-meriton-gray hover:text-meriton-charcoal dark:hover:text-white hover:bg-white dark:hover:bg-meriton-dark rounded transition-colors"
                              title={expandedPanel === 'results' ? 'Collapse' : 'Expand'}
                            >
                              {expandedPanel === 'results' ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Compact List */}
                  <div className="divide-y divide-meriton-light dark:divide-meriton-dark">
                    {sortResults(filterResults(results.sources)).map((source, idx) => {
                      const isExpanded = expandedResults.has(source.id);
                      const metadata = source.metadata as Record<string, any>;
                      const recordType = metadata?.record_type || 'unknown';

                      return (
                        <div key={source.id} className="transition-colors hover:bg-meriton-offwhite dark:hover:bg-meriton-charcoal">
                          {/* Compact Row */}
                          <button
                            onClick={() => toggleResultExpanded(source.id)}
                            className="w-full px-4 py-3 text-left"
                          >
                            <div className="flex items-center gap-3">
                              {/* Expand/Collapse Icon */}
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>

                              {/* Record Type Badge */}
                              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 ${getRecordTypeBadge(recordType)}`}>
                                {recordType.replace(/_/g, ' ')}
                              </span>

                              {/* Key attribute based on record type */}
                              <span className="text-sm font-medium text-meriton-charcoal dark:text-meriton-silver truncate max-w-[200px]">
                                {metadata?.vendor || metadata?.manufacturer || metadata?.company_name || metadata?.item_name || metadata?.campaign_name || metadata?.deal_name || ''}
                              </span>

                              {/* Main Text (truncated) */}
                              <span className="flex-1 text-sm text-meriton-gray truncate hidden md:inline">
                                {source.text}
                              </span>

                              {/* Date + Amount + Confidence */}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {metadata?.date && (
                                  <span className="text-xs text-meriton-gray">
                                    {metadata.date}
                                  </span>
                                )}
                                {metadata?.amount !== undefined && metadata.amount > 0 && (
                                  <span className="text-sm font-semibold text-meriton-charcoal dark:text-white">
                                    ${metadata.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                                {/* Confidence Indicator */}
                                <div className="flex items-center gap-1">
                                  <div className="w-16 h-2 bg-meriton-light dark:bg-meriton-dark overflow-hidden">
                                    <div
                                      className={`h-full ${getConfidenceColor(source.score)}`}
                                      style={{ width: `${source.score * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-meriton-gray w-8">
                                    {(source.score * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pl-11 bg-meriton-offwhite dark:bg-meriton-charcoal">
                              {/* Full Text */}
                              <p className="text-sm text-meriton-charcoal dark:text-meriton-silver mb-3 leading-relaxed">
                                {source.text}
                              </p>

                              {/* Metadata Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
                                {metadata?.vendor && (
                                  <div>
                                    <span className="text-meriton-gray block">Vendor</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.vendor}</span>
                                  </div>
                                )}
                                {metadata?.company_name && (
                                  <div>
                                    <span className="text-meriton-gray block">Company</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.company_name}</span>
                                  </div>
                                )}
                                {metadata?.opco_id && (
                                  <div>
                                    <span className="text-meriton-gray block">OpCo</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.opco_id}</span>
                                  </div>
                                )}
                                {metadata?.region && (
                                  <div>
                                    <span className="text-meriton-gray block">Region</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.region}</span>
                                  </div>
                                )}
                                {metadata?.account && (
                                  <div>
                                    <span className="text-meriton-gray block">Account</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.account}</span>
                                  </div>
                                )}
                                {metadata?.payment_status && (
                                  <div>
                                    <span className="text-meriton-gray block">Status</span>
                                    <span className={`font-medium ${metadata.payment_status === 'paid' ? 'text-meriton-charcoal dark:text-white' : 'text-meriton-gray'}`}>
                                      {metadata.payment_status}
                                    </span>
                                  </div>
                                )}
                                {metadata?.service_type && (
                                  <div>
                                    <span className="text-meriton-gray block">Service</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.service_type.replace(/_/g, ' ')}</span>
                                  </div>
                                )}
                                {metadata?.category && (
                                  <div>
                                    <span className="text-meriton-gray block">Category</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.category}</span>
                                  </div>
                                )}
                                {metadata?.email && (
                                  <div>
                                    <span className="text-meriton-gray block">Email</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.email}</span>
                                  </div>
                                )}
                                {metadata?.stage && (
                                  <div>
                                    <span className="text-meriton-gray block">Stage</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.stage}</span>
                                  </div>
                                )}
                                {metadata?.channel && (
                                  <div>
                                    <span className="text-meriton-gray block">Channel</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.channel}</span>
                                  </div>
                                )}
                                {metadata?.sku && (
                                  <div>
                                    <span className="text-meriton-gray block">SKU</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.sku}</span>
                                  </div>
                                )}
                                {metadata?.quantity_on_hand !== undefined && (
                                  <div>
                                    <span className="text-meriton-gray block">Qty on Hand</span>
                                    <span className="font-medium text-meriton-charcoal dark:text-white">{metadata.quantity_on_hand}</span>
                                  </div>
                                )}
                              </div>

                              {/* ID */}
                              <div className="mt-3 pt-2 border-t border-meriton-light dark:border-meriton-dark">
                                <span className="text-xs text-meriton-silver">ID: {source.id}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
