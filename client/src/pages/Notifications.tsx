import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Notification } from '../types';
import { formatDate } from '../utils/format';

const typeIcons: Record<string, string> = {
  reminder_3d: '⏰',
  reminder_1d: '⏳',
  overdue: '🔴',
  overdue_repeat: '🔁',
  escalation_critical: '🚨',
  escalation_manager: '📣',
  closed_on_time: '✅',
  closed_late: '⚠️',
  assigned: '📌',
  comment_mention: '💬',
  postpone_request: '📅',
  postpone_decision: '📥',
  weekly_summary: '🗞️',
};

export function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  async function load() {
    const { data } = await api.get('/notifications');
    setNotifications(data.notifications);
  }

  useEffect(() => {
    load();
  }, []);

  async function open(n: Notification) {
    if (!n.read) await api.post(`/notifications/${n.id}/read`);
    if (n.task_id) navigate(`/tasks/${n.task_id}`);
    else load();
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    load();
  }

  async function sendWeeklySummary() {
    await api.post('/notifications/send-weekly-summary');
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Уведомления</h1>
          <p className="page-subtitle">Единая лента автоматических событий: напоминания, просрочки, эскалации, сводки</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {user?.role === 'manager' && (
            <button className="btn btn-secondary" onClick={sendWeeklySummary}>Сформировать сводку сейчас</button>
          )}
          <button className="btn btn-secondary" onClick={markAllRead}>Отметить все прочитанными</button>
        </div>
      </div>

      <div className="card" style={{ padding: '6px 18px' }}>
        {notifications === null && <div className="loading">Загрузка…</div>}
        {notifications?.length === 0 && <div className="empty-state">Уведомлений пока нет</div>}
        {notifications?.map((n) => (
          <div key={n.id} className={`notif-item ${n.read ? 'read' : 'unread'}`} onClick={() => open(n)}>
            <span className="notif-dot" />
            <div style={{ flex: 1 }}>
              <div>{typeIcons[n.type] || '🔔'} {n.message}</div>
              <div className="comment-meta">{formatDate(n.created_at, true)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
