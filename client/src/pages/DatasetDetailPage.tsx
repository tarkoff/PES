import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import {
  ArrowLeft, Search, Filter, X, ChevronDown, ChevronUp, SlidersHorizontal,
  Database, FileText, Clock, Layers, Download, Eye
} from 'lucide-react';

interface Dataset {
  id: string;
  name: string;
  format: string;
  resource_url: string;
  created_at: string;
}

type SortDirection = 'asc' | 'desc';

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [records, setRecords] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 50;

  const fetchDataset = useCallback(async () => {
    try {
      const res = await apiClient.get(`/datasets/${id}`);
      setDataset(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/datasets/${id}/records`, {
        params: { page, limit }
      });
      let data = res.data.data;
      
      // Handle edge case where data might be wrapped in an array
      if (data.length === 1 && Array.isArray(data[0])) {
        data = data[0];
      }
      
      setRecords(data);
      setTotal(res.data.total);

      // Extract columns from data
      if (data.length > 0) {
        const firstItem = data[0];
        
        if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
          // Normal case: array of objects
          const keys = new Set<string>();
          data.forEach((item: any) => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              Object.keys(item).forEach(k => keys.add(k));
            }
          });
          const cols = Array.from(keys);
          setColumns(cols);
          setSortColumn(cols[0] || '');
        } else if (Array.isArray(firstItem)) {
          // Data is wrapped in arrays - unwrap it
          const unwrappedData = data.flatMap((item: any) => 
            Array.isArray(item) ? item : [item]
          );
          setRecords(unwrappedData);
          
          const keys = new Set<string>();
          unwrappedData.forEach((item: any) => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              Object.keys(item).forEach(k => keys.add(k));
            }
          });
          const cols = Array.from(keys);
          setColumns(cols);
          setSortColumn(cols[0] || '');
        } else {
          // Primitive values
          setColumns(['value']);
          setSortColumn('value');
        }
      }
    } catch (e) {
      console.error('Failed to fetch records:', e);
    } finally {
      setLoading(false);
    }
  }, [id, page]);

  useEffect(() => {
    fetchDataset();
    fetchRecords();
  }, [fetchDataset, fetchRecords]);

  const getFormatColor = (format: string) => {
    const colors: Record<string, string> = {
      json: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      xml: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      csv: 'bg-green-500/20 text-green-400 border-green-500/30',
      xlsx: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    return colors[format?.toLowerCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortColumn !== col) return <ChevronDown className="w-3.5 h-3.5 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
  };

  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Global search across all fields
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row => {
        if (columns.length === 1 && columns[0] === 'value') {
          return String(row).toLowerCase().includes(query);
        }
        return columns.some(col =>
          String(row[col] ?? '').toLowerCase().includes(query)
        );
      });
    }

    // Per-column filters
    const activeColumnFilters = Object.entries(columnFilters).filter(([_, v]) => v.trim());
    if (activeColumnFilters.length > 0) {
      result = result.filter(row => {
        return activeColumnFilters.every(([col, value]) => {
          const cellValue = String(row[col] ?? '').toLowerCase();
          return cellValue.includes(value.toLowerCase());
        });
      });
    }

    // Sort
    if (sortColumn && columns.length > 1) {
      result.sort((a, b) => {
        const aVal = a[sortColumn] ?? '';
        const bVal = b[sortColumn] ?? '';

        // Try numeric comparison first
        const aNum = parseFloat(String(aVal));
        const bNum = parseFloat(String(bVal));
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Fallback to string comparison
        const comparison = String(aVal).localeCompare(String(bVal));
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [records, searchQuery, columnFilters, sortColumn, sortDirection, columns]);

  const hasActiveFilters = searchQuery || Object.values(columnFilters).some(v => v.trim());

  const clearAllFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
  };

  const totalPages = Math.ceil(total / limit);

  const renderCellValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-600/50">—</span>;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Render nested object as formatted JSON
      const jsonStr = JSON.stringify(value, null, 2);
      const isLong = jsonStr.length > 150;
      return (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-gray-400 font-mono hover:text-gray-300 transition-colors">
            <span className="inline-block">
              {isLong ? jsonStr.slice(0, 150) + '...' : jsonStr}
            </span>
            {isLong && <span className="text-primary-400 ml-1 text-[10px]">(розгорнути)</span>}
          </summary>
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all bg-white/5 p-2 rounded mt-1">
            {jsonStr}
          </pre>
        </details>
      );
    }
    if (Array.isArray(value)) {
      // Render arrays
      const str = JSON.stringify(value);
      return (
        <span className="text-xs text-gray-400 font-mono" title={str}>
          {str.length > 100 ? str.slice(0, 100) + '...' : str}
        </span>
      );
    }
    return (
      <span className="text-gray-300 break-words" title={String(value)}>
        {String(value)}
      </span>
    );
  };

  if (loading && !dataset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Database className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-gray-400">Завантаження...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
      {/* Header */}
      <header className="bg-dark-800/50 backdrop-blur-sm border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-white">{dataset?.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${getFormatColor(dataset?.format || '')}`}>
                    {dataset?.format}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">
                  Всього записів: <span className="font-mono text-white">{total.toLocaleString()}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={dataset?.resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-700 text-gray-300 border border-white/10 hover:bg-dark-600 transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Джерело</span>
              </a>
              <Link
                to="/datasets"
                className="px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 transition-all text-sm"
              >
                Всі набори
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-xl blur opacity-15 group-hover:opacity-25 transition duration-300"></div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук по всіх полях..."
                className="w-full pl-12 pr-12 py-3.5 bg-dark-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-all ${
                  showFilters || hasActiveFilters
                    ? 'bg-primary-500/30 text-primary-400'
                    : 'bg-dark-700/50 text-gray-400 hover:bg-dark-600'
                }`}
                title="Фільтри по колонках"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {hasActiveFilters && (
          <div className="mb-3 flex flex-wrap gap-2">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 text-xs">
                Пошук: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {Object.entries(columnFilters).filter(([_, v]) => v.trim()).map(([col, value]) => (
              <span key={col} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-500/20 text-accent-400 border border-accent-500/30 text-xs">
                {col}: "{value}"
                <button onClick={() => setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n; })} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30 text-xs hover:bg-gray-500/30"
            >
              <X className="w-3 h-3" />
              Скинути все
            </button>
          </div>
        )}

        {/* Column Filters Panel */}
        <AnimatePresence>
          {showFilters && columns.length > 1 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="bg-dark-800/80 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Фільтри по колонках
                  </h3>
                  <button
                    onClick={() => setColumnFilters({})}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Скинути
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {columns.map(col => (
                    <div key={col}>
                      <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1 truncate" title={col}>
                        {col}
                      </label>
                      <input
                        type="text"
                        value={columnFilters[col] || ''}
                        onChange={(e) => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                        placeholder="Фільтр..."
                        className="w-full bg-dark-700 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50 placeholder-gray-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Показано <span className="font-semibold text-white">{filteredRecords.length}</span> з <span className="font-semibold text-white">{total.toLocaleString()}</span> записів
          </p>
          {columns.length > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500">Сортування:</span>
              {columns.map(col => (
                <button
                  key={col}
                  onClick={() => handleSort(col)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-all ${
                    sortColumn === col
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'bg-dark-700 text-gray-500 hover:bg-dark-600 hover:text-gray-300'
                  }`}
                  title={col}
                >
                  <span className="max-w-[80px] truncate">{col}</span>
                  <SortIcon col={col} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="bg-dark-800/60 backdrop-blur-sm border border-white/5 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-dark-700 animate-pulse flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6 text-gray-600" />
                </div>
                <p>Завантаження записів...</p>
              </div>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-dark-700 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-gray-600" />
                </div>
                <p>{hasActiveFilters ? 'Нічого не знайдено' : 'Немає записів'}</p>
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} className="text-primary-400 hover:text-primary-300 text-sm mt-2">
                    Скинути фільтри
                  </button>
                )}
              </div>
            </div>
          ) : columns.length === 1 ? (
            // Single column view for primitive values
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-900/90 sticky top-0 z-10 border-b border-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Значення
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRecords.map((row, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-2.5 text-gray-300">
                        {renderCellValue(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // Multi-column view
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-900/90 sticky top-0 z-10 border-b border-white/5">
                  <tr>
                    <th className="px-3 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-12">
                      #
                    </th>
                    {columns.map(col => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[200px]" title={col}>{col}</span>
                          <SortIcon col={col} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRecords.map((row, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors align-top">
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">
                        {(page - 1) * limit + i + 1}
                      </td>
                      {columns.map(col => (
                        <td key={col} className="px-4 py-2.5 max-w-sm break-words">
                          {renderCellValue(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-white/5 px-4 py-3 flex items-center justify-between bg-dark-900/60">
              <span className="text-xs text-gray-400">
                Сторінка {page} з {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 text-xs hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
                >
                  Попередня
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (page <= 3) pageNum = i + 1;
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = page - 2 + i;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded-md text-xs transition-all ${
                          page === pageNum
                            ? 'bg-primary-500 text-white'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 text-xs hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
                >
                  Наступна
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
