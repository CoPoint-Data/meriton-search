'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// Metric Card Component
interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

function MetricCard({ label, value, trend, subtitle }: MetricCardProps) {
  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    neutral: 'text-gray-600 dark:text-gray-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</div>
        {trend && (
          <span className={`text-xs font-medium ${trendColors[trend]}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500 dark:text-gray-500">{subtitle}</div>
      )}
    </div>
  );
}

// Chart components
function BarChart({ chart }: { chart: Chart }) {
  const maxValue = Math.max(...chart.data.map(d => d.value));

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{chart.title}</h3>
      <div className="space-y-3">
        {chart.data.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {chart.yAxis?.includes('$') ? `$${item.value.toLocaleString()}` : item.value}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              >
                <span className="text-xs text-white font-medium">
                  {((item.value / maxValue) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {chart.xAxis && chart.yAxis && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-4">
          <span>{chart.xAxis}</span>
          <span>{chart.yAxis}</span>
        </div>
      )}
    </div>
  );
}

function PieChart({ chart }: { chart: Chart }) {
  const total = chart.data.reduce((sum, item) => sum + item.value, 0);
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{chart.title}</h3>
      <div className="flex items-center justify-center">
        <div className="relative w-48 h-48">
          <svg viewBox="0 0 100 100" className="transform -rotate-90">
            {chart.data.reduce((acc, item, idx) => {
              const percentage = (item.value / total) * 100;
              const strokeDasharray = `${percentage} ${100 - percentage}`;
              const strokeDashoffset = -acc.offset;
              const color = ['#3B82F6', '#10B981', '#EAB308', '#EF4444', '#A855F7', '#EC4899', '#6366F1'][idx % 7];

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
                <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
                <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-white">
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
  const range = maxValue - minValue;

  const points = chart.data.map((item, idx) => {
    const x = (idx / (chart.data.length - 1)) * 100;
    const y = 100 - ((item.value - minValue) / range) * 80;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{chart.title}</h3>
      <div className="relative h-48">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke="#3B82F6"
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
                fill="#3B82F6"
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {chart.data.map((item, idx) => (
          <div key={idx} className="text-xs">
            <div className="text-gray-500 dark:text-gray-400">{item.label}</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {chart.yAxis?.includes('$') ? `$${item.value.toLocaleString()}` : item.value}
            </div>
          </div>
        ))}
      </div>
      {chart.xAxis && chart.yAxis && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{chart.xAxis}</span>
          <span>{chart.yAxis}</span>
        </div>
      )}
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
  type: 'pie' | 'bar' | 'line';
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
  const [sortBy, setSortBy] = useState<'relevance' | 'date_desc' | 'date_asc' | 'amount_desc'>('relevance');

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

  // Auto-login on mount
  useEffect(() => {
    const autoLogin = async () => {
      try {
        // Try to get current user first
        const meResponse = await fetch('/api/auth/me');

        if (meResponse.ok) {
          const data = await meResponse.json();
          setUser(data.user);
        } else {
          // No session, auto-login with default user
          const loginResponse = await fetch('/api/auth/auto-login', {
            method: 'POST',
          });

          if (loginResponse.ok) {
            const data = await loginResponse.json();
            setUser(data.user);
          }
        }
      } catch (err) {
        console.error('Auto-login failed:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    autoLogin();
  }, []);

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
      // Optionally redirect or show login screen
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Calculate metrics from results
  const calculateMetrics = () => {
    if (!results || !results.sources || results.sources.length === 0) return null;

    const sources = results.sources;
    const total = sources.reduce((sum, s) => sum + (s.metadata?.amount || 0), 0);
    const count = sources.length;
    const avg = total / count;

    // Check for payment status
    const paidCount = sources.filter(s => s.metadata?.payment_status === 'paid').length;
    const paidRate = count > 0 ? (paidCount / count) * 100 : 0;

    // Check for entity aggregation (vendor cards)
    const isVendorView = sources.some(s => s.metadata?.entity_type === 'vendor');

    return {
      total,
      count,
      avg,
      paidRate,
      paidCount,
      isVendorView,
    };
  };

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Initializing...</p>
      </div>
    );
  }

  const metrics = calculateMetrics();

  // Helper function to get confidence bar color
  const getConfidenceColor = (score: number) => {
    const percentage = score * 100;
    if (percentage >= 75) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
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

  // Sort results based on selected option
  const sortResults = (sources: SearchResult[]) => {
    if (!sources) return [];
    const sorted = [...sources];

    switch (sortBy) {
      case 'date_desc':
        return sorted.sort((a, b) => {
          const dateA = (a.metadata as any)?.date || '';
          const dateB = (b.metadata as any)?.date || '';
          return dateB.localeCompare(dateA);
        });
      case 'date_asc':
        return sorted.sort((a, b) => {
          const dateA = (a.metadata as any)?.date || '';
          const dateB = (b.metadata as any)?.date || '';
          return dateA.localeCompare(dateB);
        });
      case 'amount_desc':
        return sorted.sort((a, b) => {
          const amountA = (a.metadata as any)?.amount || 0;
          const amountB = (b.metadata as any)?.amount || 0;
          return amountB - amountA;
        });
      case 'relevance':
      default:
        return sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
  };

  // Get record type badge color
  const getRecordTypeBadge = (recordType: string) => {
    const colors: Record<string, string> = {
      invoice: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      expense: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      gl_entry: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      contact: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      deal: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
      activity: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
      campaign: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
      lead: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
      stock_item: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
      regional_summary: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    };
    return colors[recordType] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  return (
    <div className="min-h-screen">
      {/* User Account Dropdown - Fixed Top Right */}
      {user && (
        <div className="fixed top-4 right-4 z-50">
          <div className="relative user-menu-container">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-md"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
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
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {user.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {user.role.replace('_', ' ')} {user.opCoCode && `• ${user.opCoCode}`}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
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
      )}

      {/* Full-width container for search form */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">

          <div className="mb-4">
            <label htmlFor="query" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Query
            </label>
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., What were the HVAC equipment purchases in Q4?"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label htmlFor="maxResults" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Results
              </label>
              <input
                id="maxResults"
                type="number"
                min="1"
                max="100"
                value={maxResults}
                onChange={(e) => setMaxResults(Math.min(100, Math.max(1, parseInt(e.target.value) || 25)))}
                className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
              />
            </div>
            <div className="flex gap-1">
              {[10, 25, 50, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxResults(n)}
                  className={`px-2 py-1 text-xs rounded ${
                    maxResults === n
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}
      </div>

      {/* Wide container for results - Dashboard Layout */}
      {results && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          {/* Summary */}
          <div className="mb-6">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Summary</h3>
                    {!summaryExpanded && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                        {results.answer}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-gray-500 dark:text-gray-400">
                  {summaryExpanded ? '▲' : '▼'}
                </span>
              </div>
            </button>
            {summaryExpanded && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-lg p-6 -mt-1">
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed prose dark:prose-invert max-w-none">
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

          {/* Metric Cards */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard
                label={metrics.isVendorView ? "Total Spend" : "Total Amount"}
                value={`$${metrics.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                trend="neutral"
              />
              <MetricCard
                label={metrics.isVendorView ? "Vendors" : "Records"}
                value={metrics.count}
                subtitle={metrics.isVendorView ? `${metrics.paidCount} active` : undefined}
              />
              <MetricCard
                label="Average"
                value={`$${metrics.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
              <MetricCard
                label="Paid Rate"
                value={`${metrics.paidRate.toFixed(0)}%`}
                trend={metrics.paidRate >= 80 ? 'up' : metrics.paidRate >= 50 ? 'neutral' : 'down'}
                subtitle={`${metrics.paidCount}/${metrics.count} paid`}
              />
            </div>
          )}

          {/* Side-by-side layout: Charts (left 1/3) + Sources (right 2/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT SIDEBAR: Visualizations */}
            {results.visualization && results.visualization.charts.length > 0 && (
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 sticky top-6">
                  <div className="space-y-6">
                    {results.visualization.charts.map((chart, idx) => (
                      <div key={idx} className="pb-6 border-b border-gray-200 dark:border-gray-700 last:border-b-0 last:pb-0">
                        <ChartRenderer chart={chart} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT MAIN AREA: Sources - Compact List View */}
            <div className={results.visualization && results.visualization.charts.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
              {results.sources.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                  {/* List Header */}
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {results.sources.length} Results
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Sort:</label>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          <option value="relevance">Relevance</option>
                          <option value="date_desc">Date (Newest)</option>
                          <option value="date_asc">Date (Oldest)</option>
                          <option value="amount_desc">Amount (Highest)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Compact List */}
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sortResults(results.sources).map((source, idx) => {
                      const isExpanded = expandedResults.has(source.id);
                      const metadata = source.metadata as Record<string, any>;
                      const recordType = metadata?.record_type || 'unknown';

                      return (
                        <div key={source.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
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
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                                {metadata?.vendor || metadata?.manufacturer || metadata?.company_name || metadata?.item_name || metadata?.campaign_name || metadata?.deal_name || ''}
                              </span>

                              {/* Main Text (truncated) */}
                              <span className="flex-1 text-sm text-gray-500 dark:text-gray-400 truncate hidden md:inline">
                                {source.text}
                              </span>

                              {/* Date + Amount + Confidence */}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {metadata?.date && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {metadata.date}
                                  </span>
                                )}
                                {metadata?.amount !== undefined && metadata.amount > 0 && (
                                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    ${metadata.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                                {/* Confidence Indicator */}
                                <div className="flex items-center gap-1">
                                  <div className="w-16 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${getConfidenceColor(source.score)}`}
                                      style={{ width: `${source.score * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 w-8">
                                    {(source.score * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pl-11 bg-gray-50 dark:bg-gray-800/50">
                              {/* Full Text */}
                              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
                                {source.text}
                              </p>

                              {/* Metadata Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
                                {metadata?.vendor && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Vendor</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.vendor}</span>
                                  </div>
                                )}
                                {metadata?.company_name && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Company</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.company_name}</span>
                                  </div>
                                )}
                                {metadata?.opco_id && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">OpCo</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.opco_id}</span>
                                  </div>
                                )}
                                {metadata?.region && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Region</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.region}</span>
                                  </div>
                                )}
                                {metadata?.account && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Account</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.account}</span>
                                  </div>
                                )}
                                {metadata?.payment_status && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Status</span>
                                    <span className={`font-medium ${metadata.payment_status === 'paid' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                      {metadata.payment_status}
                                    </span>
                                  </div>
                                )}
                                {metadata?.service_type && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Service</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.service_type.replace(/_/g, ' ')}</span>
                                  </div>
                                )}
                                {metadata?.category && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Category</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.category}</span>
                                  </div>
                                )}
                                {metadata?.email && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Email</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.email}</span>
                                  </div>
                                )}
                                {metadata?.stage && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Stage</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.stage}</span>
                                  </div>
                                )}
                                {metadata?.channel && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Channel</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.channel}</span>
                                  </div>
                                )}
                                {metadata?.sku && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">SKU</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.sku}</span>
                                  </div>
                                )}
                                {metadata?.quantity_on_hand !== undefined && (
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400 block">Qty on Hand</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{metadata.quantity_on_hand}</span>
                                  </div>
                                )}
                              </div>

                              {/* ID */}
                              <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <span className="text-xs text-gray-400 dark:text-gray-500">ID: {source.id}</span>
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
