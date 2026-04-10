import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  if (!user) return null;

  const displayName = user.first_name || user.email;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all duration-200 group"
      >
        <User size={18} className="text-gray-300 group-hover:text-white transition-colors duration-200" />
        <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors duration-200">{displayName}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-64 glass-panel border-white/20 py-2 z-50 overflow-hidden"
          >
            {/* User info section */}
            <div className="px-4 py-3 border-b border-white/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-primary-500/10 rounded-full blur-2xl -mr-10 -mt-10" />
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
                  <User size={18} className="text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
              </div>
              {user.provider && user.provider !== 'local' && (
                <div className="mt-2 relative z-10">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
                    {user.provider === 'google' ? 'Google' : 'Facebook'} Account
                  </span>
                </div>
              )}
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors duration-200">
                <LogOut size={14} />
              </div>
              <span className="font-medium">Вийти з облікового запису</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
