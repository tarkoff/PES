import { NavLink } from 'react-router-dom';
import { Database, Home, Users } from 'lucide-react';

export default function Sidebar() {
  const getLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
      isActive
        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
        : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
    }`;

  return (
    <aside className="w-64 bg-dark-800 border-r border-white/5 h-full p-6 flex flex-col z-10 relative">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
          <Database className="text-white w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
          DataGov UI
        </h1>
      </div>

      <nav className="flex flex-col gap-3 flex-1">
        <NavLink to="/admin/dashboard" className={getLinkClasses}>
          <Home className="w-5 h-5" />
          <span className="font-medium">Дашборд</span>
        </NavLink>
        <NavLink to="/admin/datasets" className={getLinkClasses}>
          <Database className="w-5 h-5" />
          <span className="font-medium">Ресурси</span>
        </NavLink>
        <NavLink to="/admin/users" className={getLinkClasses}>
          <Users className="w-5 h-5" />
          <span className="font-medium">Користувачі</span>
        </NavLink>
      </nav>

      <div className="mt-auto pt-6 border-t border-white/5">
        <p className="text-xs text-gray-500 text-center">Version 1.0.0</p>
      </div>
    </aside>
  );
}
