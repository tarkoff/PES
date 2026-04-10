import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Edit2, Trash2, X, RefreshCw, UserCheck, UserX, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getUsers, createUser, updateUser, deleteUser, type User, type CreateUserDto, type UpdateUserDto } from '../api/users';

const defaultForm = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  role: 'user',
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers(page, limit, search || undefined);
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      console.error('Error fetching users', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const totalPages = Math.ceil(total / limit);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm({ ...defaultForm });
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      password: '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || 'user',
    });
    setIsActive(user.is_active);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
    setForm({ ...defaultForm });
  };

  const handleSubmit = async () => {
    if (!form.email) return alert('Email is required');
    if (!editingUser && !form.password) return alert('Password is required for new users');

    setSubmitting(true);
    try {
      if (editingUser) {
        const updateDto: UpdateUserDto = {
          email: form.email,
          first_name: form.first_name || undefined,
          last_name: form.last_name || undefined,
          is_active: isActive,
          role: form.role || undefined,
        };
        if (form.password) {
          updateDto.password = form.password;
        }
        await updateUser(editingUser.id, updateDto);
      } else {
        const createDto: CreateUserDto = {
          email: form.email,
          password: form.password,
          first_name: form.first_name || undefined,
          last_name: form.last_name || undefined,
          role: form.role || undefined,
        };
        await createUser(createDto);
      }
      closeModal();
      fetchUsers();
    } catch (e: any) {
      console.error('Error saving user', e);
      alert(e.response?.data?.message || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await deleteUser(id);
      fetchUsers();
    } catch (e: any) {
      console.error('Error deleting user', e);
      alert(e.response?.data?.message || 'Failed to delete user');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex flex-col gap-8 max-w-7xl mx-auto overflow-y-auto pb-10"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Користувачі</h1>
          <p className="text-gray-400">Керування зареєстрованими користувачами системи</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          <Plus className="w-5 h-5" />
          Додати Користувача
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={20} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Пошук за email або ім'ям..."
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={fetchUsers}
          className="p-2.5 bg-dark-800 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:border-white/20 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Users Table */}
      <div className="glass-panel overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            Завантаження...
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            Користувачів не знайдено
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Користувач</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Провайдер</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Роль</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Статус</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Дата реєстрації</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-medium shrink-0">
                            {user.first_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white font-medium">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-gray-400 text-sm">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-mono uppercase text-gray-300">
                          {user.provider}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`flex items-center gap-1.5 text-sm ${
                          user.role === 'admin' 
                            ? 'text-primary-400' 
                            : 'text-gray-400'
                        }`}>
                          <Shield className="w-4 h-4" />
                          {user.role === 'admin' ? 'Адмін' : 'Користувач'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`flex items-center gap-1.5 text-sm ${user.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                          {user.is_active ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                          {user.is_active ? 'Активний' : 'Неактивний'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                            title="Редагувати"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                            title="Видалити"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Всього: {total} користувачів
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Попередня
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-400">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Наступна
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-dark-900/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-dark-800 border border-white/10 shadow-2xl rounded-2xl w-full max-w-md flex flex-col"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">
                  {editingUser ? 'Редагувати Користувача' : 'Новий Користувач'}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Пароль {!editingUser && <span className="text-red-400">*</span>}
                    {editingUser && <span className="text-gray-500 text-xs">(залиште порожнім, щоб не змінювати)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingUser ? '••••••••' : 'Мінімум 6 символів'}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Ім'я
                    </label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      placeholder="John"
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Прізвище
                    </label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      placeholder="Doe"
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Роль
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="user">Користувач</option>
                    <option value="admin">Адміністратор</option>
                  </select>
                </div>

                {editingUser && (
                  <div className="flex items-center gap-3 p-4 bg-dark-900 border border-white/5 rounded-xl">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded bg-dark-800 border-white/10 text-primary-500 focus:ring-primary-500"
                    />
                    <label htmlFor="is_active" className="text-sm text-gray-300 cursor-pointer select-none">
                      Активний користувач
                    </label>
                  </div>
                )}
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
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-primary-500 hover:bg-primary-400 disabled:bg-primary-500/50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {editingUser ? 'Зберегти' : 'Створити'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
