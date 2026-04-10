import { useState, useEffect } from 'react';
import { Search, Database, Eye, ExternalLink, LogIn, UserPlus, FileText, User, LogOut, UserCheck, TrendingUp, BarChart3, Globe, ArrowRight, Sparkles, Zap, Shield, Clock } from 'lucide-react';
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
}

interface Stats {
  total_datasets: number;
  total_records: number;
  active_imports: number;
  last_update?: string;
}

export default function HomePage() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [filteredDatasets, setFilteredDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total_datasets: 0,
    total_records: 0,
    active_imports: 0
  });

  useEffect(() => {
    loadDatasets();
    loadStats();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredDatasets(
        datasets.filter(
          (ds) =>
            ds.name.toLowerCase().includes(query) ||
            ds.format.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredDatasets(datasets);
    }
  }, [searchQuery, datasets]);

  const loadDatasets = async () => {
    try {
      const response = await apiClient.get('/datasets');
      const datasetsList = response.data;
      
      // Fetch record counts for each dataset
      const datasetsWithCounts = await Promise.all(
        datasetsList.map(async (dataset: Dataset) => {
          try {
            const recordsResponse = await apiClient.get(`/datasets/${dataset.id}/records`, {
              params: { page: 1, limit: 1 }
            });
            return {
              ...dataset,
              record_count: recordsResponse.data.total || 0
            };
          } catch {
            return { ...dataset, record_count: 0 };
          }
        })
      );
      
      setDatasets(datasetsWithCounts);
      setFilteredDatasets(datasetsWithCounts);
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
    navigate(`/datasets/${id}/records`);
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

          {/* Search Bar */}
          <div className="max-w-3xl mx-auto mb-16">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-accent-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative">
                <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-400 w-6 h-6" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Пошук наборів даних за назвою або форматом..."
                  className="w-full pl-14 pr-6 py-5 bg-dark-800 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all text-lg"
                />
              </div>
            </div>
          </div>

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-3xl font-bold text-white mb-2">
              Доступні набори даних
            </h3>
            <p className="text-gray-400">
              {filteredDatasets.length} {filteredDatasets.length === 1 ? 'набір' : filteredDatasets.length < 5 ? 'набори' : 'наборів'} доступно для перегляду
            </p>
          </div>
        </div>

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
        ) : filteredDatasets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-6">
              <Database className="w-12 h-12 text-gray-600" />
            </div>
            <p className="text-gray-400 text-lg mb-2">
              {searchQuery ? 'Нічого не знайдено за вашим запитом' : 'Набори даних відсутні'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-primary-400 hover:text-primary-300 transition-colors"
              >
                Скинути пошук
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDatasets.map((dataset) => (
              <div
                key={dataset.id}
                className="group bg-dark-800/50 border border-white/5 rounded-2xl p-6 hover:border-primary-500/30 transition-all hover:shadow-2xl hover:shadow-primary-500/10 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex-1 truncate group-hover:text-primary-400 transition-colors">
                    {dataset.name}
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-medium border ${getFormatColor(
                      dataset.format
                    )}`}
                  >
                    {dataset.format.toUpperCase()}
                  </span>
                </div>
                <div className="space-y-3 mb-5">
                  {dataset.record_count !== undefined && (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Записів</p>
                        <p className="text-sm font-semibold text-white">
                          {dataset.record_count.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-500/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Додано</p>
                      <p className="text-sm text-gray-300">
                        {new Date(dataset.created_at).toLocaleDateString('uk-UA')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewDataset(dataset.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 transition-all group/btn"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Переглянути</span>
                    <ArrowRight className="w-4 h-0 group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                  <a
                    href={dataset.resource_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center px-3 py-2.5 rounded-xl bg-dark-700 text-gray-400 border border-white/10 hover:bg-dark-600 hover:text-gray-300 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
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
