import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Settings, Eye, EyeOff, GripVertical, Save, X, Trash2 } from 'lucide-react';

interface FieldConfig {
  displayName?: string;
  visible?: boolean;
  order?: number;
}

interface Dataset {
  id: string;
  name: string;
  field_config?: Record<string, FieldConfig>;
}

export default function DataViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fieldConfigs, setFieldConfigs] = useState<Record<string, FieldConfig>>({});
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const limit = 50;
  const [loading, setLoading] = useState(true);
  const serverConfigLoaded = useRef(false);

  const handleBack = () => {
    if (isAdmin) {
      navigate('/admin/datasets');
    } else {
      navigate('/');
    }
  };

  const fetchDataset = useCallback(async () => {
    try {
      const res = await apiClient.get(`/datasets/${id}`);
      setDataset(res.data);
      if (res.data.field_config && Object.keys(res.data.field_config).length > 0) {
        setFieldConfigs(res.data.field_config);
        serverConfigLoaded.current = true;
      }
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await fetchDataset();
      fetchData();
    })();
  }, [id, page, fetchDataset]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/datasets/${id}/records?page=${page}&limit=${limit}`);
      let processedData = res.data.data;

      // Handle edge case where data might be wrapped in an array
      if (processedData.length === 1 && Array.isArray(processedData[0])) {
        processedData = processedData[0];
      }

      setData(processedData);
      setTotal(res.data.total);

      if (processedData.length > 0) {
        const firstItem = processedData[0];
        
        // Check if data items are objects (normal case) or primitives
        if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
          // Extract all unique keys from ALL records (not just first page)
          const keys = new Set<string>();
          processedData.forEach((item: any) => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              Object.keys(item).forEach(k => keys.add(k));
            }
          });
          const cols = Array.from(keys);
          setRawColumns(cols);
          
          // Initialize field configs only if not loaded from server
          if (!serverConfigLoaded.current && Object.keys(fieldConfigs).length === 0) {
            const initialConfigs: Record<string, FieldConfig> = {};
            cols.forEach((col, idx) => {
              initialConfigs[col] = { displayName: col, visible: true, order: idx };
            });
            setFieldConfigs(initialConfigs);
          }
        } else if (Array.isArray(firstItem)) {
          // Data is still wrapped in arrays - unwrap it
          const unwrappedData = processedData.flatMap((item: any) => 
            Array.isArray(item) ? item : [item]
          );
          setData(unwrappedData);
          
          const keys = new Set<string>();
          unwrappedData.forEach((item: any) => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              Object.keys(item).forEach(k => keys.add(k));
            }
          });
          setRawColumns(Array.from(keys));
        } else {
          // Primitive values (strings, numbers)
          setRawColumns(['value']);
        }
      }
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayColumns = () => {
    const configs = Object.entries(fieldConfigs)
      .filter(([_, cfg]) => cfg.visible !== false)
      .map(([code, cfg]) => ({
        code,
        displayName: cfg.displayName || code,
        order: cfg.order ?? 0,
      }))
      .sort((a, b) => a.order - b.order);
    return configs;
  };

  const displayColumns = getDisplayColumns();

  const saveSettings = async () => {
    try {
      await apiClient.patch(`/datasets/${id}`, {
        field_config: fieldConfigs,
      });
      await fetchDataset();
      setSettingsOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const updateFieldConfig = (code: string, updates: Partial<FieldConfig>) => {
    setFieldConfigs(prev => ({
      ...prev,
      [code]: { ...prev[code], ...updates },
    }));
  };

  const toggleVisibility = (code: string) => {
    const current = fieldConfigs[code]?.visible;
    updateFieldConfig(code, { visible: current === false ? true : false });
  };

  const handleDragStart = (code: string) => {
    setDraggedField(code);
  };

  const handleDragOver = (e: React.DragEvent, targetCode: string) => {
    e.preventDefault();
    if (!draggedField || draggedField === targetCode) return;

    const codes = rawColumns;
    const fromIdx = codes.indexOf(draggedField);
    const toIdx = codes.indexOf(targetCode);
    
    const newOrder: Record<string, FieldConfig> = { ...fieldConfigs };
    const draggedOrder = newOrder[draggedField]?.order ?? fromIdx;
    const targetOrder = newOrder[targetCode]?.order ?? toIdx;

    codes.forEach(code => {
      const cfg = newOrder[code] || { displayName: code, visible: true, order: 0 };
      if (code === draggedField) {
        cfg.order = targetOrder;
      } else if (fromIdx < toIdx) {
        if ((cfg.order as number) > draggedOrder && (cfg.order as number) <= targetOrder) {
          cfg.order = (cfg.order as number) - 1;
        }
      } else {
        if ((cfg.order as number) >= targetOrder && (cfg.order as number) < draggedOrder) {
          cfg.order = (cfg.order as number) + 1;
        }
      }
      newOrder[code] = cfg;
    });

    setFieldConfigs(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedField(null);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col gap-6 max-w-full">
      <div className="flex items-center gap-4">
        <button onClick={handleBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
            {dataset?.name || 'Перегляд Даних'}
          </h1>
          <p className="text-gray-400">Всього синхронізовано: <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">{total.toLocaleString()}</span> рядків у JSONB</p>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
        >
          <Settings className="w-5 h-5" />
          Налаштування
        </button>
      </div>

      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto w-full relative">
          {loading && data.length === 0 ? (
             <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-dark-900/50 backdrop-blur-sm z-20">Отримання таблиці...</div>
          ) : data.length === 0 ? (
             <div className="absolute inset-0 flex items-center justify-center text-gray-500">Немає записів. Запустіть імпорт ресурсу!</div>
          ) : (
            <table className="w-full text-left border-collapse text-sm text-gray-300">
              <thead className="bg-dark-900/90 sticky top-0 backdrop-blur-md z-10 border-b border-white/10">
                <tr>
                  {displayColumns.map(col => (
                    <th key={col.code} className="px-6 py-4 font-semibold text-gray-400 whitespace-nowrap shadow-sm">
                      {col.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.map((row, i) => {
                  const renderCell = (value: any) => {
                    if (value === null || value === undefined) {
                      return <span className="text-gray-600/50">-</span>;
                    }
                    if (typeof value === 'object' && !Array.isArray(value)) {
                      // Render nested object as formatted JSON
                      return (
                        <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all bg-white/5 p-2 rounded">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      );
                    }
                    if (Array.isArray(value)) {
                      // Render arrays as comma-separated or JSON
                      const str = JSON.stringify(value);
                      return str.length > 100 ? str.slice(0, 100) + '...' : str;
                    }
                    return String(value);
                  };

                  if (rawColumns.length === 1 && rawColumns[0] === 'value') {
                    // Single column for primitive values
                    return (
                      <tr key={i} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-3 whitespace-pre-wrap max-w-md break-all text-gray-400 group-hover:text-gray-200 transition-colors">
                          {renderCell(row)}
                        </td>
                      </tr>
                    );
                  } else {
                    // Multiple columns for objects
                    return (
                      <tr key={i} className="hover:bg-white/5 transition-colors group">
                        {displayColumns.map(col => {
                          const cellValue = row[col.code];
                          const cellText = renderCell(cellValue);
                          const title = typeof cellValue === 'object' ? JSON.stringify(cellValue, null, 2) : String(cellValue ?? '');
                          return (
                            <td key={col.code} className="px-6 py-3 max-w-md break-words text-gray-400 group-hover:text-gray-200 transition-colors" title={title}>
                              {cellText}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>
          )}
        </div>
        
        {total > 0 && (
          <div className="border-t border-white/5 px-6 py-4 flex items-center justify-between bg-dark-900/80 backdrop-blur-md z-10">
            <span className="text-sm font-medium text-gray-400">Сторінка {page} із {totalPages ? totalPages : 1}</span>
            <div className="flex items-center gap-2">
               <button 
                 onClick={() => setPage(p => Math.max(1, p - 1))}
                 disabled={page === 1}
                 className="px-4 py-2 rounded-lg bg-white/5 focus:ring hover:bg-white/10 text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-all text-sm font-medium"
               >
                 Попередня
               </button>
               <button 
                 onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                 disabled={page === totalPages}
                 className="px-4 py-2 rounded-lg bg-white/5 focus:ring hover:bg-white/10 text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-all text-sm font-medium"
               >
                 Наступна
               </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-dark-900/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-dark-800 border border-white/10 shadow-2xl rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Налаштування набору даних</h2>
                <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex flex-col gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Назва набору</label>
                  <input
                    type="text"
                    value={dataset?.name || ''}
                    onChange={(e) => setDataset(prev => prev ? { ...prev, name: e.target.value } : prev)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Поля</h3>
                  <p className="text-xs text-gray-500 mb-4">Перетягуйте рядки для зміни порядку відображення</p>
                  <div className="flex flex-col gap-2">
                    {rawColumns.filter(col => col !== 'value').sort((a, b) => (fieldConfigs[a]?.order ?? 0) - (fieldConfigs[b]?.order ?? 0)).map((col) => {
                      const config = fieldConfigs[col] || { displayName: col, visible: true, order: 0 };
                      return (
                        <div
                          key={col}
                          draggable
                          onDragStart={() => handleDragStart(col)}
                          onDragOver={(e) => handleDragOver(e, col)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-3 bg-dark-900 border border-white/10 rounded-lg p-3 cursor-grab active:cursor-grabbing ${
                            draggedField === col ? 'opacity-50' : ''
                          }`}
                        >
                          <GripVertical className="w-4 h-4 text-gray-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <code className="text-xs text-gray-500 block truncate">{col}</code>
                            <input
                              type="text"
                              value={config.displayName || ''}
                              onChange={(e) => updateFieldConfig(col, { displayName: e.target.value })}
                              placeholder="Назва для відображення"
                              className="w-full bg-transparent border-none text-white text-sm focus:outline-none mt-0.5"
                            />
                          </div>
                          <button
                            onClick={() => toggleVisibility(col)}
                            className={`p-2 rounded-lg transition-colors ${
                              config.visible !== false
                                ? 'bg-white/10 text-white hover:bg-white/20'
                                : 'bg-white/5 text-gray-500 hover:bg-white/10'
                            }`}
                            title={config.visible !== false ? 'Сховати поле' : 'Показати поле'}
                          >
                            {config.visible !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => {
                              const newConfigs = { ...fieldConfigs };
                              delete newConfigs[col];
                              Object.keys(newConfigs).forEach(key => {
                                if (newConfigs[key].order! > (config.order ?? 0)) {
                                  newConfigs[key].order = (newConfigs[key].order ?? 0) - 1;
                                }
                              });
                              setFieldConfigs(newConfigs);
                            }}
                            className="p-2 rounded-lg bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                            title="Видалити конфігурацію"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-white/5 flex justify-between items-center bg-dark-900/50">
                <button
                  onClick={() => setFieldConfigs({})}
                  className="px-4 py-2 rounded-xl text-gray-400 hover:text-white font-medium transition-colors hover:bg-white/5"
                >
                  Скинути
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white font-medium transition-colors hover:bg-white/5"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={async () => {
                      if (dataset) {
                        await apiClient.patch(`/datasets/${id}`, { name: dataset.name });
                      }
                      await saveSettings();
                    }}
                    className="px-6 py-2.5 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Зберегти
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
