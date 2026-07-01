import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { visibleProjectIds, canAccessTask, canEditTask } from '../access.js';
import { isAtRisk } from '../riskUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]+/g, '_')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

function addHistory(taskId, eventType, description, actorId = null) {
  db.prepare(`INSERT INTO task_history (task_id, event_type, description, actor_id) VALUES (?, ?, ?, ?)`).run(taskId, eventType, description, actorId);
}

function notify(userId, taskId, type, message) {
  db.prepare(`INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, ?, ?)`).run(userId, taskId, type, message);
}

function taskScope(user) {
  if (user.role === 'manager') return { where: '1=1', params: [] };
  if (user.role === 'executor') return { where: 't.assignee_id = ?', params: [user.id] };
  const ids = visibleProjectIds(user);
  if (ids.length === 0) return { where: '0=1', params: [] };
  return { where: `t.project_id IN (${ids.map(() => '?').join(',')})`, params: ids };
}

function hydrateTask(task) {
  return { ...task, at_risk: isAtRisk(task) ? 1 : 0 };
}

const baseSelect = `
  SELECT t.*, p.name AS project_name, a.name AS assignee_name, c.name AS creator_name
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  JOIN users a ON a.id = t.assignee_id
  JOIN users c ON c.id = t.creator_id
`;

tasksRouter.get('/', (req, res) => {
  const scope = taskScope(req.user);
  const { project_id, assignee_id, status, priority, search } = req.query;
  const conditions = [scope.where];
  const params = [...scope.params];

  if (project_id) { conditions.push('t.project_id = ?'); params.push(project_id); }
  if (assignee_id) { conditions.push('t.assignee_id = ?'); params.push(assignee_id); }
  if (status) { conditions.push('t.status = ?'); params.push(status); }
  if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
  if (search) { conditions.push('t.title LIKE ?'); params.push(`%${search}%`); }

  const rows = db.prepare(`${baseSelect} WHERE ${conditions.join(' AND ')} ORDER BY t.deadline ASC`).all(...params);
  res.json({ tasks: rows.map(hydrateTask) });
});

tasksRouter.get('/:id', (req, res) => {
  const task = db.prepare(`${baseSelect} WHERE t.id = ?`).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (!canAccessTask(req.user, task)) return res.status(403).json({ error: 'Нет доступа к задаче' });

  const dependsOn = db
    .prepare(`SELECT tk.id, tk.title, tk.status FROM task_dependencies d JOIN tasks tk ON tk.id = d.depends_on_task_id WHERE d.task_id = ?`)
    .all(task.id);
  const blocks = db
    .prepare(`SELECT tk.id, tk.title, tk.status FROM task_dependencies d JOIN tasks tk ON tk.id = d.task_id WHERE d.depends_on_task_id = ?`)
    .all(task.id);
  const history = db.prepare(`SELECT h.*, u.name AS actor_name FROM task_history h LEFT JOIN users u ON u.id = h.actor_id WHERE h.task_id = ? ORDER BY h.created_at DESC`).all(task.id);
  const comments = db.prepare(`SELECT cm.*, u.name AS author_name FROM comments cm JOIN users u ON u.id = cm.author_id WHERE cm.task_id = ? ORDER BY cm.created_at ASC`).all(task.id);
  for (const c of comments) {
    c.attachments = db.prepare(`SELECT id, filename, filepath FROM attachments WHERE comment_id = ?`).all(c.id);
  }
  const reasons = db.prepare(`SELECT * FROM overdue_reasons ORDER BY label`).all();

  res.json({ task: hydrateTask(task), dependsOn, blocks, history, comments, reasons });
});

tasksRouter.post('/', requireRole('manager'), (req, res) => {
  const { title, description, project_id, assignee_id, deadline, priority, dependsOn } = req.body;
  if (!title || !project_id || !assignee_id || !deadline) {
    return res.status(400).json({ error: 'Название, проект, исполнитель и дедлайн обязательны' });
  }
  const result = db
    .prepare(`INSERT INTO tasks (title, description, project_id, creator_id, assignee_id, deadline, priority) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(title, description || '', project_id, req.user.id, assignee_id, deadline, priority || 'medium');
  const taskId = result.lastInsertRowid;
  if (Array.isArray(dependsOn)) {
    for (const depId of dependsOn) {
      db.prepare(`INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`).run(taskId, depId);
    }
  }
  addHistory(taskId, 'created', `Задача создана и назначена`, req.user.id);
  notify(assignee_id, taskId, 'assigned', `Вам назначена новая задача «${title}».`);
  const task = db.prepare(`${baseSelect} WHERE t.id = ?`).get(taskId);
  res.status(201).json({ task: hydrateTask(task) });
});

tasksRouter.patch('/:id', requireRole('manager'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  const fields = ['title', 'description', 'assignee_id', 'deadline', 'priority'];
  const updated = { ...task };
  for (const f of fields) if (req.body[f] !== undefined) updated[f] = req.body[f];
  db.prepare(`UPDATE tasks SET title=?, description=?, assignee_id=?, deadline=?, priority=?, updated_at=datetime('now') WHERE id=?`)
    .run(updated.title, updated.description, updated.assignee_id, updated.deadline, updated.priority, task.id);
  if (updated.assignee_id !== task.assignee_id) {
    addHistory(task.id, 'reassigned', 'Исполнитель изменён', req.user.id);
    notify(updated.assignee_id, task.id, 'assigned', `Вам назначена задача «${updated.title}».`);
  }
  const fresh = db.prepare(`${baseSelect} WHERE t.id = ?`).get(task.id);
  res.json({ task: hydrateTask(fresh) });
});

// Быстрое обновление прогресса/статуса в один тап (раздел 7.3)
tasksRouter.post('/:id/progress', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (!canEditTask(req.user, task)) return res.status(403).json({ error: 'Нет доступа к задаче' });

  const { progress, status } = req.body;
  const newProgress = progress !== undefined ? Math.min(100, Math.max(0, Number(progress))) : task.progress;
  const newStatus = status || task.status;
  const isReopen = task.status === 'done' && newStatus !== 'done';

  db.prepare(`UPDATE tasks SET progress = ?, status = ?, reopened_count = ?, last_progress_update_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(newProgress, newStatus === 'overdue' ? task.status : newStatus, isReopen ? task.reopened_count + 1 : task.reopened_count, task.id);

  if (isReopen) {
    addHistory(task.id, 'reopened', 'Задача переоткрыта после выполнения', req.user.id);
  } else if (newStatus !== task.status && newStatus !== 'overdue') {
    addHistory(task.id, 'status_change', `Статус изменён: ${statusLabel(task.status)} → ${statusLabel(newStatus)}`, req.user.id);
  }
  if (newProgress !== task.progress) {
    addHistory(task.id, 'progress_update', `Готовность обновлена: ${task.progress}% → ${newProgress}%`, req.user.id);
  }

  const fresh = db.prepare(`${baseSelect} WHERE t.id = ?`).get(task.id);
  res.json({ task: hydrateTask(fresh) });
});

// Отметить выполненной; если была просрочена — требует причину из справочника
tasksRouter.post('/:id/complete', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (!canEditTask(req.user, task)) return res.status(403).json({ error: 'Нет доступа к задаче' });

  const wasOverdue = task.status === 'overdue';
  if (wasOverdue && !req.body.overdue_reason_id) {
    return res.status(400).json({ error: 'Укажите причину просрочки для закрытия задачи' });
  }

  db.prepare(`UPDATE tasks SET status='done', progress=100, overdue_reason_id=?, closed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .run(wasOverdue ? req.body.overdue_reason_id : null, task.id);
  addHistory(task.id, 'status_change', wasOverdue ? 'Задача закрыта после просрочки' : 'Статус изменён: → Выполнена', req.user.id);
  notify(task.creator_id, task.id, wasOverdue ? 'closed_late' : 'closed_on_time', `Задача «${task.title}» закрыта${wasOverdue ? ' с опозданием' : ' в срок'}.`);

  const fresh = db.prepare(`${baseSelect} WHERE t.id = ?`).get(task.id);
  res.json({ task: hydrateTask(fresh) });
});

// Запрос переноса срока исполнителем
tasksRouter.post('/:id/postpone-request', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (!canEditTask(req.user, task)) return res.status(403).json({ error: 'Нет доступа к задаче' });
  const { reason, newDeadline } = req.body;
  if (!reason || !newDeadline) return res.status(400).json({ error: 'Укажите причину и желаемый срок' });

  db.prepare(`UPDATE tasks SET postpone_status='requested', postpone_reason=?, postpone_new_deadline=?, updated_at=datetime('now') WHERE id=?`)
    .run(reason, newDeadline, task.id);
  addHistory(task.id, 'postpone_request', `Запрошен перенос срока на ${newDeadline}: ${reason}`, req.user.id);
  notify(task.creator_id, task.id, 'postpone_request', `Исполнитель запросил перенос срока задачи «${task.title}».`);

  const fresh = db.prepare(`${baseSelect} WHERE t.id = ?`).get(task.id);
  res.json({ task: hydrateTask(fresh) });
});

tasksRouter.post('/:id/postpone-decision', requireRole('manager'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  const { approve } = req.body;

  if (approve) {
    db.prepare(`UPDATE tasks SET deadline=?, postpone_status='approved', status=CASE WHEN status='overdue' THEN 'in_progress' ELSE status END,
        overdue_since=NULL, is_critical=0, escalated_to_manager=0, reminder_3d_sent=0, reminder_1d_sent=0, updated_at=datetime('now') WHERE id=?`)
      .run(task.postpone_new_deadline, task.id);
    addHistory(task.id, 'postpone_approved', `Перенос срока одобрен: новый дедлайн ${task.postpone_new_deadline}`, req.user.id);
  } else {
    db.prepare(`UPDATE tasks SET postpone_status='rejected', updated_at=datetime('now') WHERE id=?`).run(task.id);
    addHistory(task.id, 'postpone_rejected', 'Запрос переноса срока отклонён', req.user.id);
  }
  notify(task.assignee_id, task.id, 'postpone_decision', `Запрос переноса срока по задаче «${task.title}» ${approve ? 'одобрен' : 'отклонён'}.`);

  const fresh = db.prepare(`${baseSelect} WHERE t.id = ?`).get(task.id);
  res.json({ task: hydrateTask(fresh) });
});

tasksRouter.post('/:id/dependencies', requireRole('manager'), (req, res) => {
  const { depends_on_task_id } = req.body;
  db.prepare(`INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`).run(req.params.id, depends_on_task_id);
  res.status(201).json({ ok: true });
});

tasksRouter.delete('/:id/dependencies/:depId', requireRole('manager'), (req, res) => {
  db.prepare(`DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`).run(req.params.id, req.params.depId);
  res.json({ ok: true });
});

function statusLabel(s) {
  return { new: 'Новая', in_progress: 'В работе', review: 'На проверке', done: 'Выполнена', overdue: 'Просрочена' }[s] || s;
}

function extractMentions(text) {
  const users = db.prepare('SELECT id, name FROM users').all();
  return users.filter((u) => text.includes(`@${u.name}`));
}

tasksRouter.post('/:id/comments', upload.array('attachments', 5), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (!canAccessTask(req.user, task)) return res.status(403).json({ error: 'Нет доступа к задаче' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Комментарий не может быть пустым' });

  const commentId = db.prepare(`INSERT INTO comments (task_id, author_id, text) VALUES (?, ?, ?)`).run(task.id, req.user.id, text).lastInsertRowid;
  for (const file of req.files || []) {
    db.prepare(`INSERT INTO attachments (comment_id, filename, filepath) VALUES (?, ?, ?)`).run(commentId, file.originalname, `/uploads/${file.filename}`);
  }
  addHistory(task.id, 'comment', 'Добавлен комментарий', req.user.id);

  for (const mentioned of extractMentions(text)) {
    if (mentioned.id !== req.user.id) {
      notify(mentioned.id, task.id, 'comment_mention', `${req.user.name} упомянул(а) вас в комментарии к задаче «${task.title}».`);
    }
  }

  const comment = db.prepare(`SELECT cm.*, u.name AS author_name FROM comments cm JOIN users u ON u.id = cm.author_id WHERE cm.id = ?`).get(commentId);
  comment.attachments = db.prepare(`SELECT id, filename, filepath FROM attachments WHERE comment_id = ?`).all(commentId);
  res.status(201).json({ comment });
});
