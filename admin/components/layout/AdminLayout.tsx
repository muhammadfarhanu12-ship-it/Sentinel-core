import { Outlet } from 'react-router-dom';

import { ToastViewport } from '../ui/Toast';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-shell__content">
        <Navbar />
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
      <ToastViewport />
    </div>
  );
}
