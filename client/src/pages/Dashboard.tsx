import { motion } from 'framer-motion';
import { Activity, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState({ active: 0, datasets: 0, success: 0, errors: 0 });

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/datasets/stats');
      setStats(res.data);
    } catch (e) {
      console.error('Error fetching dashboard stats', e);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Polling every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const uiStats = [
    { title: 'Активні Імпорти', value: stats.active, icon: <Activity className="w-6 h-6 text-primary-400" /> },
    { title: 'Підключені Набори', value: stats.datasets, icon: <Database className="w-6 h-6 text-accent-500" /> },
    { title: 'Успішні Рядки', value: stats.success.toLocaleString(), icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" /> },
    { title: 'Помилки Парсингу', value: stats.errors.toLocaleString(), icon: <AlertCircle className="w-6 h-6 text-red-400" /> },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col gap-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Дашборд</h1>
        <p className="text-gray-400">Аналітика потокових імпортів зі сторони NestJS / Redis</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {uiStats.map((stat, i) => (
          <div key={i} className="glass-panel p-6 flex flex-col gap-4 relative overflow-hidden group hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.02)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary-500/10 transition-colors duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-gray-400 font-medium">{stat.title}</span>
              <div className="p-2 bg-dark-900 border border-white/5 rounded-xl shadow-inner">{stat.icon}</div>
            </div>
            <span className="text-4xl font-bold text-white relative z-10 font-sans tracking-tight">{stat.value}</span>
          </div>
        ))}
      </div>
      
      <div className="glass-panel flex-1 min-h-[400px] p-6 flex items-center justify-center">
         <p className="text-gray-500">Ми зібрали {stats.datasets} датасетів для вас. Спробуйте підключити новий датасет на вкладці "Ресурси".</p>
      </div>
    </motion.div>
  );
}
