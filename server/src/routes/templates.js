import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { visibleProjectIds } from '../access.js';

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

templatesRouter.get('/', (req, res) => {
  const ids = visibleProjectIds(req.user);
  if (ids.length === 0) return res.json({ templates: [] });
  const placeholders = ids.map(() => '?').join(',');
  const templates = db
    .prepare(
      `SELECT rt.*, p.name AS project_name, u.name AS assignee_name FROM recurring_templates rt
       JOIN projects p ON p.id = rt.project_id JOIN users u ON u.id = rt.assignee_id
       WHERE rt.project_id IN (${placeholders}) ORDER BY rt.created_at DESC`
    )
    .all(...ids);
  res.json({ templates: templates.map((t) => ({ ...t, checklist: JSON.parse(t.checklist) })) });
});

templatesRouter.post('/', requireRole('manager'), (req, res) => {
  const { project_id, name, periodicity, offset_hours, checklist, assignee_id } = req.body;
  if (!project_id || !name || !periodicity || !assignee_id) {
    return res.status(400).json({ error: 'Проект, название, периодичность и исполнитель обязательны' });
  }
  const result = db
    .prepare(`INSERT INTO recurring_templates (project_id, name, periodicity, offset_hours, checklist, assignee_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(project_id, name, periodicity, offset_hours || 24, JSON.stringify(checklist || []), assignee_id);
  res.status(201).json({ id: result.lastInsertRowid });
});

templatesRouter.patch('/:id', requireRole('manager'), (req, res) => {
  const template = db.prepare('SELECT * FROM recurring_templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Шаблон не найден' });
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : template.active;
  db.prepare(`UPDATE recurring_templates SET active = ? WHERE id = ?`).run(active, template.id);
  res.json({ ok: true });
});

templatesRouter.delete('/:id', requireRole('manager'), (req, res) => {
  db.prepare(`DELETE FROM recurring_templates WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// Создать задачу из шаблона прямо сейчас (демонстрация генерации по расписанию)
templatesRouter.post('/:id/generate', requireRole('manager'), (req, res) => {
  const template = db.prepare('SELECT * FROM recurring_templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Шаблон не найден' });
  const deadline = new Date(Date.now() + template.offset_hours * 3600 * 1000).toISOString();
  const checklist = JSON.parse(template.checklist);
  const description = checklist.length ? `Чек-лист:\n${checklist.map((c) => `- ${c}`).join('\n')}` : '';
  const result = db
    .prepare(`INSERT INTO tasks (title, description, project_id, creator_id, assignee_id, deadline) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(template.name, description, template.project_id, req.user.id, template.assignee_id, deadline);
  db.prepare(`UPDATE recurring_templates SET last_generated_at = datetime('now') WHERE id = ?`).run(template.id);
  db.prepare(`INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, 'assigned', ?)`).run(
    template.assignee_id,
    result.lastInsertRowid,
    `Создана повторяющаяся задача «${template.name}» по шаблону.`
  );
  res.status(201).json({ taskId: result.lastInsertRowid });
});

export const overdueReasonsRouter = Router();
overdueReasonsRouter.use(requireAuth);
overdueReasonsRouter.get('/', (req, res) => {
  res.json({ reasons: db.prepare('SELECT * FROM overdue_reasons ORDER BY label').all() });
});
