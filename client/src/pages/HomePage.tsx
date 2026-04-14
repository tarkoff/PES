import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Database, Eye, ExternalLink, LogIn, UserPlus, FileText, User, LogOut, UserCheck, TrendingUp, BarChart3, Globe, ArrowRight, Sparkles, Zap, Shield, Clock, SlidersHorizontal, X, Filter, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

interface Dataset {
  id: string;
  name: string;
  resource_url: string;
  format: string;
  created_at: string;
  record_count?: number;
  auto_sync?: boolean;
  last_import_status?: string;
}

interface Stats {
  total_datasets: number;
  total_records: number;
  active_imports: number;
  last_update?: string;
}

interface FilterState {
  format: string[];
  dateRange: { from: string; to: string };
  minRecords: number | null;
  autoSync: boolean | null;
  importStatus: string[];
}

type SortField = 'name' | 'format' | 'created_at' | 'record_count';
type SortDirection = 'asc' | 'desc';

export default function HomePage() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total_datasets: 0,
    total_records: 0,
    active_imports: 0
  });
  const [filters, setFilters] = useState<FilterState>({
    format: [],
    dateRange: { from: '', to: '' },
    minRecords: null,
    autoSync: null,
    importStatus: [],
  });
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 12;

  useEffect(() => {
    loadDatasets();
    loadStats();
  }, []);

  const loadDatasets = async () => {
    try {
      const response = await apiClient.get('/datasets');
      const datasetsList: Dataset[] = response.data;

      const datasetsWithCounts = await Promise.all(
        datasetsList.map(async (dataset: Dataset) => {
          try {
            const recordsResponse = await apiClient.get(`/datasets/${dataset.id}/records`, {
              params: { page: 1, limit: 1 }
            });
            const lastImport = (dataset as any).import_jobs?.[0];
            return {
              ...dataset,
              record_count: recordsResponse.data.total || 0,
              last_import_status: lastImport?.status,
            };
          } catch {
            return { ...dataset, record_count: 0 };
          }
        })
      );

      setDatasets(datasetsWithCounts);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/datasets/stats');
      setStats({
        total_datasets: response.data.total_datasets || 0,
        total_records: response.data.total_records || 0,
        active_imports: response.data.active_imports || 0,
        last_update: response.data.last_update
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleViewDataset = (id: string) => {
    navigate(`/datasets/${id}`);
  };

  const getFormatColor = (format: string) => {
    const colors: Record<string, string> = {
      json: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      xml: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      csv: 'bg-green-500/20 text-green-400 border-green-500/30',
      xlsx: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      xls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    return colors[format.toLowerCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getStatusColor = (status?: string) => {
    if (!status) return 'bg-gray-500/20 text-gray-400';
    const colors: Record<string, string> = {
      SUCCESS: 'bg-green-500/20 text-green-400',
      FAILED: 'bg-red-500/20 text-red-400',
      RUNNING: 'bg-blue-500/20 text-blue-400',
      PENDING: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[status] || 'bg-gray-500/20 text-gray-400';
  };

  const availableFormats = useMemo(() => {
    return Array.from(new Set(datasets.map(d => d.format.toLowerCase())));
  }, [datasets]);

  const availableStatuses = useMemo(() => {
    return Array.from(new Set(datasets.filter(d => d.last_import_status).map(d => d.last_import_status!)));
  }, [datasets]);

  const toggleFormatFilter = (format: string) => {
    setFilters(prev => ({
      ...prev,
      format: prev.format.includes(format)
        ? prev.format.filter(f => f !== format)
        : [...prev.format, format]
    }));
    setPage(1);
  };

  const toggleStatusFilter = (status: string) => {
    setFilters(prev => ({
      ...prev,
      importStatus: prev.importStatus.includes(status)
        ? prev.importStatus.filter(s => s !== status)
        : [...prev.importStatus, status]
    }));
    setPage(1);
  };

  const clearAllFilters = () => {
    setFilters({
      format: [],
      dateRange: { from: '', to: '' },
      minRecords: null,
      autoSync: null,
      importStatus: [],
    });
    setSearchQuery('');
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-4 h-4 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const filteredAndSortedDatasets = useMemo(() => {
    let result = [...datasets];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ds =>
        ds.name.toLowerCase().includes(query) ||
        ds.format.toLowerCase().includes(query) ||
        ds.resource_url.toLowerCase().includes(query)
      );
    }

    // Format filter
    if (filters.format.length > 0) {
      result = result.filter(ds =>
        filters.format.includes(ds.format.toLowerCase())
      );
    }

    // Date range filter
    if (filters.dateRange.from) {
      result = result.filter(ds =>
        new Date(ds.created_at) >= new Date(filters.dateRange.from)
      );
    }
    if (filters.dateRange.to) {
      result = result.filter(ds =>
        new Date(ds.created_at) <= new Date(filters.dateRange.to + 'T23:59:59')
      );
    }

    // Min records filter
    if (filters.minRecords !== null) {
      result = result.filter(ds =>
        (ds.record_count || 0) >= filters.minRecords!
      );
    }

    // Auto-sync filter
    if (filters.autoSync !== null) {
      result = result.filter(ds => ds.auto_sync === filters.autoSync);
    }

    // Import status filter
    if (filters.importStatus.length > 0) {
      result = result.filter(ds =>
        ds.last_import_status && filters.importStatus.includes(ds.last_import_status)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'format':
          comparison = a.format.localeCompare(b.format);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'record_count':
          comparison = (a.record_count || 0) - (b.record_count || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [datasets, searchQuery, filters, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredAndSortedDatasets.length / limit);
  const paginatedDatasets = filteredAndSortedDatasets.slice(
    (page - 1) * limit,
    page * limit
  );

  const hasActiveFilters = searchQuery || filters.format.length > 0 || filters.dateRange.from || filters.dateRange.to || filters.minRecords !== null || filters.autoSync !== null || filters.importStatus.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
      {/* Header */}
      <header className="bg-dark-800/50 backdrop-blur-sm border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <Database className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
              DataGov UA
            </h1>
          </div>
          <div className="flex gap-3 items-center">
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <Link
                    to="/admin/dashboard"
                    className="px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 transition-all"
                  >
                    Адмін панель
                  </Link>
                )}
                <div className="flex items-center gap-2 px-4 py-2 bg-dark-700/50 border border-white/10 rounded-xl">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300">
                    {user?.first_name || user?.email}
                  </span>
                  {isAdmin && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-primary-500/20 text-primary-400 border border-primary-500/30">
                      Адмін
                    </span>
                  )}
                  {!isAdmin && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                      <UserCheck className="w-3 h-3 inline mr-1" />
                      Користувач
                    </span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Вийти</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Увійти</span>
                </Link>
                <Link
                  to="/register"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500/20 text-accent-400 border border-accent-500/30 hover:bg-accent-500/30 transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Реєстрація</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Enhanced Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-6">
              <Sparkles className="w-4 h-4 text-primary-400" />
              <span className="text-sm text-primary-300">Державні відкриті дані</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary-400 via-accent-400 to-purple-400">
              Відкриті дані України
            </h2>
            <p className="text-gray-400 text-xl max-w-3xl mx-auto leading-relaxed">
              Пошук та перегляд наборів даних з державного порталу data.gov.ua.
              Прозорий доступ до державної інформації для кожного громадянина.
            </p>
          </div>

          {/* Enhanced Search Bar */}
          <div className="max-w-3xl mx-auto mb-6">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-accent-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative">
                <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-400 w-6 h-6" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Пошук наборів даних за назвою, форматом або URL..."
                  className="w-full pl-14 pr-14 py-5 bg-dark-800 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all text-lg"
                />
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-2.5 rounded-xl transition-all ${
                    showFilters || hasActiveFilters
                      ? 'bg-primary-500/30 text-primary-400'
                      : 'bg-dark-700/50 text-gray-400 hover:bg-dark-600'
                  }`}
                  title="Розширені фільтри"
                >
                  <SlidersHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Filters Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="max-w-3xl mx-auto mb-6 overflow-hidden"
              >
                <div className="bg-dark-800/80 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Filter className="w-5 h-5" />
                      Розширені фільтри
                    </h3>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Скинути все
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Format Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Формат
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {availableFormats.map(format => (
                          <button
                            key={format}
                            onClick={() => toggleFormatFilter(format)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              filters.format.includes(format)
                                ? getFormatColor(format)
                                : 'bg-dark-700 text-gray-400 border-white/10 hover:bg-dark-600'
                            }`}
                          >
                            {format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Import Status Filter */}
                    {availableStatuses.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          Статус імпорту
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {availableStatuses.map(status => (
                            <button
                              key={status}
                              onClick={() => toggleStatusFilter(status)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                filters.importStatus.includes(status)
                                  ? getStatusColor(status)
                                  : 'bg-dark-700 text-gray-400 border-white/10 hover:bg-dark-600'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Date From */}
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Дата від
                      </label>
                      <input
                        type="date"
                        value={filters.dateRange.from}
                        onChange={(e) => {
                          setFilters(prev => ({
                            ...prev,
                            dateRange: { ...prev.dateRange, from: e.target.value }
                          }));
                          setPage(1);
                        }}
                        className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>

                    {/* Date To */}
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Дата до
                      </label>
                      <input
                        type="date"
                        value={filters.dateRange.to}
                        onChange={(e) => {
                          setFilters(prev => ({
                            ...prev,
                            dateRange: { ...prev.dateRange, to: e.target.value }
                          }));
                          setPage(1);
                        }}
                        className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>

                    {/* Min Records */}
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Мін. записів
                      </label>
                      <input
                        type="number"
                        value={filters.minRecords ?? ''}
                        onChange={(e) => {
                          setFilters(prev => ({
                            ...prev,
                            minRecords: e.target.value ? parseInt(e.target.value) : null
                          }));
                          setPage(1);
                        }}
                        placeholder="0"
                        min="0"
                        className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>

                    {/* Auto Sync */}
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Авто-синхронізація
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setFilters(prev => ({ ...prev, autoSync: prev.autoSync === true ? null : true }))}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                            filters.autoSync === true
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-dark-700 text-gray-400 border-white/10 hover:bg-dark-600'
                          }`}
                        >
                          Увімкнено
                        </button>
                        <button
                          onClick={() => setFilters(prev => ({ ...prev, autoSync: prev.autoSync === false ? null : false }))}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                            filters.autoSync === false
                              ? 'bg-red-500/20 text-red-400 border-red-500/30'
                              : 'bg-dark-700 text-gray-400 border-white/10 hover:bg-dark-600'
                          }`}
                        >
                          Вимкнено
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-blue-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative bg-dark-800/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-primary-500/30 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-blue-500/20 flex items-center justify-center">
                    <Database className="w-6 h-6 text-primary-400" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-3xl font-bold text-white mb-1">
                  {stats.total_datasets.toLocaleString()}
                </p>
                <p className="text-sm text-gray-400">Наборів даних</p>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative bg-dark-800/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-accent-500/30 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500/20 to-purple-500/20 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-accent-400" />
                  </div>
                  <BarChart3 className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-3xl font-bold text-white mb-1">
                  {stats.total_records.toLocaleString()}
                </p>
                <p className="text-sm text-gray-400">Записів</p>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative bg-dark-800/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-green-500/30 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                    <Globe className="w-6 h-6 text-green-400" />
                  </div>
                  {stats.last_update ? (
                    <Clock className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Zap className="w-5 h-5 text-green-400" />
                  )}
                </div>
                <p className="text-3xl font-bold text-white mb-1">
                  {stats.active_imports}
                </p>
                <p className="text-sm text-gray-400">
                  {stats.last_update ? 'Останнє оновлення' : 'Активних імпортів'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Datasets Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Section Header with Results Count & Sort */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-3xl font-bold text-white mb-1">
              Доступні набори даних
            </h3>
            <p className="text-gray-400">
              Знайдено: <span className="font-semibold text-white">{filteredAndSortedDatasets.length}</span> {filteredAndSortedDatasets.length === 1 ? 'набір' : filteredAndSortedDatasets.length < 5 ? 'набори' : 'наборів'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-gray-400 whitespace-nowrap">Сортування:</span>
            {(['name', 'format', 'created_at', 'record_count'] as SortField[]).map(field => (
              <button
                key={field}
                onClick={() => handleSort(field)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  sortField === field
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                }`}
              >
                {field === 'name' && 'Назва'}
                {field === 'format' && 'Формат'}
                {field === 'created_at' && 'Дата'}
                {field === 'record_count' && 'Записи'}
                <SortIcon field={field} />
              </button>
            ))}
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="mb-4 flex flex-wrap gap-2">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 text-sm">
                Пошук: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.format.map(format => (
              <span key={format} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border ${getFormatColor(format)}`}>
                {format.toUpperCase()}
                <button onClick={() => toggleFormatFilter(format)} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filters.importStatus.map(status => (
              <span key={status} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border ${getStatusColor(status)}`}>
                {status}
                <button onClick={() => toggleStatusFilter(status)} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filters.minRecords !== null && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-500/20 text-accent-400 border border-accent-500/30 text-sm">
                ≥ {filters.minRecords} записів
                <button onClick={() => setFilters(prev => ({ ...prev, minRecords: null }))} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.autoSync !== null && (
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border ${filters.autoSync ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                Авто-синх: {filters.autoSync ? 'Так' : 'Ні'}
                <button onClick={() => setFilters(prev => ({ ...prev, autoSync: null }))} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(filters.dateRange.from || filters.dateRange.to) && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm">
                {filters.dateRange.from ? new Date(filters.dateRange.from).toLocaleDateString('uk-UA') : '...'} — {filters.dateRange.to ? new Date(filters.dateRange.to).toLocaleDateString('uk-UA') : '...'}
                <button onClick={() => setFilters(prev => ({ ...prev, dateRange: { from: '', to: '' } }))} className="hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Datasets Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-dark-800/50 border border-white/5 rounded-xl p-6 animate-pulse"
              >
                <div className="h-6 bg-dark-700 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-dark-700 rounded mb-2 w-1/2"></div>
                <div className="h-4 bg-dark-700 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : paginatedDatasets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-6">
              <Database className="w-12 h-12 text-gray-600" />
            </div>
            <p className="text-gray-400 text-lg mb-2">
              {hasActiveFilters ? 'Нічого не знайдено за вашими фільтрами' : 'Набори даних відсутні'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-primary-400 hover:text-primary-300 transition-colors"
              >
                Скинути фільтри
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedDatasets.map((dataset, index) => (
                <motion.div
                  key={dataset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative bg-dark-800/60 backdrop-blur-sm border border-white/5 rounded-xl overflow-hidden hover:border-primary-500/30 transition-all hover:shadow-lg hover:shadow-primary-500/5"
                >
                  {/* Top accent line */}
                  <div className={`h-1 ${getFormatColor(dataset.format).split(' ')[0].replace('bg-', 'bg-gradient-to-r from-').replace('/20', '/50 to-transparent')}`}></div>

                  <div className="p-5">
                    {/* Header: Name + Format badge */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <h3 className="text-base font-semibold text-white flex-1 leading-tight line-clamp-2 group-hover:text-primary-400 transition-colors">
                        {dataset.name}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${getFormatColor(dataset.format)}`}>
                        {dataset.format}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 mb-4">
                      {/* Record count */}
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary-400" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">Записи</p>
                          <p className="text-lg font-bold text-white tabular-nums">
                            {dataset.record_count?.toLocaleString() || 0}
                          </p>
                        </div>
                      </div>

                      {/* Last update date */}
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-accent-500/10 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-accent-400" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">Оновлено</p>
                          <p className="text-sm font-medium text-gray-200">
                            {new Date(dataset.created_at).toLocaleDateString('uk-UA', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Status badge (if exists) */}
                    {dataset.last_import_status && (
                      <div className="mb-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(dataset.last_import_status)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            dataset.last_import_status === 'SUCCESS' ? 'bg-green-400' :
                            dataset.last_import_status === 'FAILED' ? 'bg-red-400' :
                            dataset.last_import_status === 'RUNNING' ? 'bg-blue-400 animate-pulse' :
                            'bg-yellow-400'
                          }`}></span>
                          {dataset.last_import_status}
                        </span>
                      </div>
                    )}

                    {/* Action button */}
                    <button
                      onClick={() => handleViewDataset(dataset.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary-500/20 to-accent-500/20 text-white font-medium border border-primary-500/20 hover:from-primary-500/30 hover:to-accent-500/30 hover:border-primary-500/40 transition-all group/btn"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Переглянути дані</span>
                      <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-lg bg-dark-700 text-gray-300 border border-white/10 hover:bg-dark-600 disabled:opacity-30 disabled:hover:bg-dark-700 transition-all"
                >
                  Попередня
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-lg transition-all ${
                          page === pageNum
                            ? 'bg-primary-500 text-white'
                            : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
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
                  className="px-4 py-2 rounded-lg bg-dark-700 text-gray-300 border border-white/10 hover:bg-dark-600 disabled:opacity-30 disabled:hover:bg-dark-700 transition-all"
                >
                  Наступна
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-white/5">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-white mb-4">Можливості платформи</h3>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Зручний інструмент для роботи з відкритими державними даними
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-primary-400" />
            </div>
            <h4 className="text-xl font-semibold text-white mb-2">Пошук даних</h4>
            <p className="text-gray-400">
              Швидкий пошук по всіх доступних наборах даних за назвою або форматом
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-accent-400" />
            </div>
            <h4 className="text-xl font-semibold text-white mb-2">Перегляд записів</h4>
            <p className="text-gray-400">
              Зручний табличний перегляд з фільтрацією, сортуванням та налаштуванням полів
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-green-400" />
            </div>
            <h4 className="text-xl font-semibold text-white mb-2">Відкритий доступ</h4>
            <p className="text-gray-400">
              Безкоштовний доступ до державних даних для всіх громадян України
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <Database className="text-white w-4 h-4" />
              </div>
              <span className="text-sm text-gray-500">DataGov UA</span>
            </div>
            <p className="text-sm text-gray-500">
              © 2026 DataGov UA — Відкриті дані для кожного
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
