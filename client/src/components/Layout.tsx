import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const roleLabels: Record<string, string> = {
  manager: 'Руководитель',
  executor: 'Исполнитель',
  observer: 'Наблюдатель',
};

const navItems = [
  { to: '/dashboard', label: 'Дашборд', icon: '📊', roles: ['manager', 'executor', 'observer'] },
  { to: '/tasks', label: 'Реестр задач', icon: '📋', roles: ['manager', 'executor', 'observer'] },
  { to: '/analytics', label: 'Аналитика', icon: '📈', roles: ['manager', 'executor', 'observer'] },
  { to: '/notifications', label: 'Уведомления', icon: '🔔', roles: ['manager', 'executor', 'observer'] },
  { to: '/settings', label: 'Шаблоны и настройки', icon: '⚙️', roles: ['manager'] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await api.get('/notifications');
        if (!cancelled) setUnread(data.unreadCount);
      } catch {
        /* ignore */
      }
    }
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location.pathname]);

  if (!user) return <>{children}</>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Task<span>Control</span>
        </div>
        <nav>
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <Link key={item.to} to={item.to} className={`nav-item ${location.pathname.startsWith(item.to) ? 'active' : ''}`}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.to === '/notifications' && unread > 0 && <span className="nav-badge">{unread}</span>}
              </Link>
            ))}
        </nav>
        <div className="sidebar-user">
          <div>{user.name}</div>
          <div className="role">{roleLabels[user.role]}</div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
