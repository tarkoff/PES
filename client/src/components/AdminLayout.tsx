import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';

export default function AdminLayout() {
  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden text-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-dark-800 border-b border-dark-700 p-4 flex justify-end items-center">
          <UserMenu />
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
