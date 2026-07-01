import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runNotificationCheck, generateWeeklySummaries } from '../notificationEngine.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req, res) => {
  const notifications = db
    .prepare(
      `SELECT n.*, t.title AS task_title FROM notifications n LEFT JOIN tasks t ON t.id = n.task_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 200`
    )
    .all(req.user.id);
  const unreadCount = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0`).get(req.user.id).c;
  res.json({ notifications, unreadCount });
});

notificationsRouter.post('/:id/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(req.user.id);
  res.json({ ok: true });
});

// Ручной запуск проверки уведомлений — для демонстрации, не заменяет cron
notificationsRouter.post('/run-check', requireRole('manager'), (req, res) => {
  const result = runNotificationCheck();
  res.json(result);
});

notificationsRouter.post('/send-weekly-summary', requireRole('manager'), (req, res) => {
  generateWeeklySummaries();
  res.json({ ok: true });
});
