import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Play, Eye, X, RefreshCw, Archive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Link } from 'react-router-dom';

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-emerald-400',
  PROCESSING: 'text-primary-400',
  DOWNLOADING: 'text-blue-400',
  FAILED: 'text-red-400',
  PENDING: 'text-gray-400',
};

const defaultForm = {
  name: '',
  format: 'json' as string,
  xml_root: 'record',
  header_row: 1,
  delimiter: ',',
  has_header: true,
  custom_url: '',
};

export default function Datasets() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [searchDocs, setSearchDocs] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [form, setForm] = useState({ ...defaultForm });

  const isZipUrl = (url: string) =>
    url.toLowerCase().endsWith('.zip') || url.toLowerCase().includes('.zip?');

  const fetchDatasets = async () => {
    try {
      const res = await apiClient.get('/datasets');
      setDatasets(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDatasets();
    const interval = setInterval(fetchDatasets, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/datasets/search?q=${encodeURIComponent(query)}`);
      setSearchDocs(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedDoc(null);
    setSearchDocs([]);
    setQuery('');
    setForm({ ...defaultForm });
  };

  const handleAdd = async () => {
    const url = selectedDoc ? (selectedDoc.resources?.[0]?.url ?? '') : form.custom_url;
    const nameVal = form.name || (selectedDoc ? selectedDoc.title : '');
    if (!url) return alert('Не вказано URL для завантаження!');
    if (!nameVal) return alert('Вкажіть назву набору даних!');

    try {
      const payload = {
        name: nameVal,
        resource_url: url,
        format: form.format,
        struct_config:
          form.format === 'xml'
            ? { xml_root: form.xml_root }
            : ['xls', 'xlsx'].includes(form.format)
            ? { header_row: form.header_row }
            : form.format === 'csv'
            ? { delimiter: form.delimiter, has_header: form.has_header }
            : {},
      };
      await apiClient.post('/datasets', payload);
      closeModal();
      fetchDatasets();
    } catch (e) {
      console.error('Error saving dataset', e);
    }
  };

  const triggerImport = async (id: string) => {
    try {
      await apiClient.post(`/datasets/${id}/import`);
      fetchDatasets();
    } catch (e) {
      console.error('Import trigger error', e);
    }
  };

  // const activeUrl = selectedDoc ? (selectedDoc.resources?.[0]?.url ?? '') : form.custom_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex flex-col gap-8 max-w-7xl mx-auto overflow-y-auto pb-10"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Набори Даних</h1>
          <p className="text-gray-400">Підключені ресурси для імпорту та керування пулами</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          <Plus className="w-5 h-5" />
          Додати Ресурс
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {datasets.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-500 glass-panel rounded-2xl">
            Ви ще не зареєстрували жодного набору.
          </div>
        )}

        {datasets.map((ds: any) => {
          const job = ds.import_jobs?.[0];
          const isProcessing = job?.status === 'PROCESSING' || job?.status === 'DOWNLOADING';
          const statusColor = STATUS_COLORS[job?.status ?? 'PENDING'] ?? 'text-gray-400';
          const isZip = ds.resource_url && isZipUrl(ds.resource_url);

          return (
            <div key={ds.id} className="glass-panel p-5 flex flex-col gap-4">
              <div className="flex justify-between items-start gap-2">
                <h3 className="text-white font-semibold flex-1 truncate" title={ds.name}>
                  {ds.name}
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isZip && (
                    <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-xs font-mono flex items-center gap-1">
                      <Archive className="w-3 h-3" /> ZIP
                    </span>
                  )}
                  <span className="px-2 py-1 bg-white/5 rounded-md text-xs font-mono text-gray-300 uppercase">
                    {ds.format}
                  </span>
                </div>
              </div>

              {job ? (
                <div className="bg-dark-900 border border-white/5 rounded-lg p-3 text-sm flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Статус:</span>
                    <span className={`font-medium ${statusColor}`}>
                      {isProcessing && <RefreshCw className="inline w-3 h-3 mr-1 animate-spin" />}
                      {job.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Успішних:</span>
                    <span className="text-emerald-400">{job.success_rows.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Помилок:</span>
                    <span className="text-red-400">{job.error_rows}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-dark-900 border border-white/5 rounded-lg p-3 text-sm text-center text-gray-500 py-6">
                  Імпорт ще не запускався
                </div>
              )}

              <div className="mt-auto flex gap-3 pt-2">
                <button
                  onClick={() => triggerImport(ds.id)}
                  disabled={isProcessing}
                  className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isProcessing
                      ? 'bg-primary-500/20 text-primary-500 cursor-wait'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isProcessing ? 'Обробка...' : 'Пуск'}
                </button>

                <Link
                  to={`/datasets/${ds.id}/records`}
                  className="px-4 py-2.5 bg-dark-900 border border-white/10 hover:border-white/30 text-white rounded-lg flex items-center transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-dark-900/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-dark-800 border border-white/10 shadow-2xl rounded-2xl w-full max-w-xl flex flex-col max-h-[92vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Новий Ресурс</h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex flex-col gap-5">
                {/* Custom name field */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Назва набору даних <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Введіть зрозумілу назву..."
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                {/* CKAN search */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Знайти на data.gov.ua (CKAN)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Ключове слово..."
                      className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                    />
                    <button
                      onClick={handleSearch}
                      className="px-5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center"
                    >
                      {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {searchDocs.length > 0 && !selectedDoc && (
                    <div className="mt-2 max-h-48 overflow-y-auto border border-white/10 rounded-xl bg-dark-900 shadow-2xl z-10">
                      {searchDocs.map((doc: any) => (
                        <div
                          key={doc.id}
                          onClick={() => {
                            setSelectedDoc(doc);
                            if (!form.name) setForm({ ...form, name: doc.title });
                            setSearchDocs([]);
                          }}
                          className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer"
                        >
                          <p className="text-white font-medium text-sm truncate">{doc.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected CKAN doc */}
                {selectedDoc ? (
                  <div className="bg-primary-500/10 border border-primary-500/20 p-4 rounded-xl flex justify-between items-center">
                    <div className="truncate pr-4">
                      <p className="text-xs text-primary-300 font-medium mb-1">Вибраний датасет CKAN:</p>
                      <p className="text-white font-medium truncate text-sm">{selectedDoc.title}</p>
                    </div>
                    <button
                      onClick={() => setSelectedDoc(null)}
                      className="text-primary-400 hover:text-primary-300 text-sm whitespace-nowrap bg-white/10 px-3 py-1 rounded-full font-medium"
                    >
                      Змінити
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2 text-center">
                      АБО ПРЯМЕ ПОСИЛАННЯ НА ФАЙЛ / ZIP
                    </label>
                    <input
                      type="text"
                      value={form.custom_url}
                      onChange={(e) => setForm({ ...form, custom_url: e.target.value })}
                      placeholder="https://...  (.json / .xml / .xlsx / .zip)"
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                    />
                    {isZipUrl(form.custom_url) && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 text-xs flex items-center gap-1.5 text-amber-400"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        ZIP-архів — перший знайдений файл вибраного формату буде автоматично
                        витягнутий та розпарсений
                      </motion.p>
                    )}
                  </div>
                )}

                {/* Format & config */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Формат Даних
                    </label>
                    <select
                      value={form.format}
                      onChange={(e) => setForm({ ...form, format: e.target.value })}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500 appearance-none"
                    >
                      <option value="json">JSON</option>
                      <option value="xml">XML (XPath)</option>
                      <option value="csv">CSV</option>
                      <option value="xlsx">Excel (XLSX/XLS)</option>
                    </select>
                  </div>

                  {form.format === 'xml' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Кореневий тег (XML Root)
                      </label>
                      <input
                        type="text"
                        value={form.xml_root}
                        onChange={(e) => setForm({ ...form, xml_root: e.target.value })}
                        placeholder="record"
                        className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary-500"
                      />
                    </motion.div>
                  )}

                  {(form.format === 'xlsx' || form.format === 'xls') && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Рядок заголовку
                      </label>
                      <input
                        type="number"
                        value={form.header_row}
                        onChange={(e) =>
                          setForm({ ...form, header_row: parseInt(e.target.value) || 1 })
                        }
                        min="1"
                        className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-primary-500"
                      />
                    </motion.div>
                  )}

                  {form.format === 'csv' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          Розділювач
                        </label>
                        <select
                          value={form.delimiter}
                          onChange={(e) => setForm({ ...form, delimiter: e.target.value })}
                          className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500 appearance-none"
                        >
                          <option value=",">Кома (,)</option>
                          <option value=";">Крапка з комою (;)</option>
                          <option value="	">Табуляція</option>
                          <option value="|">Труба (|)</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="has_header"
                          checked={form.has_header}
                          onChange={(e) => setForm({ ...form, has_header: e.target.checked })}
                          className="w-4 h-4 rounded bg-dark-900 border-white/10 text-primary-500 focus:ring-primary-500"
                        />
                        <label htmlFor="has_header" className="text-sm text-gray-300">
                          Перший рядок - заголовки
                        </label>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3 bg-dark-900/50">
                <button
                  onClick={closeModal}
                  className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white font-medium transition-colors hover:bg-white/5"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleAdd}
                  className="px-6 py-2.5 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/20"
                >
                  Зберегти Ресурс
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
