import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { visibleProjectIds, canAccessProject } from '../access.js';
import { computeProjectHealth, isAtRisk } from '../riskUtils.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

function projectWithStats(project, user) {
  const allTasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(project.id);
  // Здоровье и план/факт проекта считаются по всем задачам (иначе показатель
  // теряет смысл), а счётчики для исполнителя — только по его собственным
  // задачам, чтобы не раскрывать нагрузку и статусы коллег.
  const tasks = user?.role === 'executor' ? allTasks.filter((t) => t.assignee_id === user.id) : allTasks;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdue = tasks.filter((t) => t.status === 'overdue').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length;
  const atRisk = tasks.filter((t) => isAtRisk(t)).length;
  const health = computeProjectHealth(allTasks);
  const progressPct = total ? Math.round((done / total) * 100) : 0;

  const now = new Date();
  const start = allTasks.length ? new Date(Math.min(...allTasks.map((t) => new Date(t.created_at).getTime()))) : now;
  const totalSpan = Math.max(new Date(project.deadline) - start, 1);
  const expectedPct = Math.round((Math.min(Math.max((now - start) / totalSpan, 0), 1)) * 100);

  return {
    ...project,
    stats: { total, done, overdue, inProgress, atRisk, progressPct, expectedPct },
    health,
  };
}

projectsRouter.get('/', (req, res) => {
  const ids = visibleProjectIds(req.user);
  if (ids.length === 0) return res.json({ projects: [] });
  const placeholders = ids.map(() => '?').join(',');
  const projects = db.prepare(`SELECT p.*, u.name AS curator_name FROM projects p JOIN users u ON u.id = p.curator_id WHERE p.id IN (${placeholders}) ORDER BY p.deadline`).all(...ids);
  res.json({ projects: projects.map((p) => projectWithStats(p, req.user)) });
});

projectsRouter.get('/:id', (req, res) => {
  if (!canAccessProject(req.user, req.params.id)) return res.status(403).json({ error: 'Нет доступа к проекту' });
  const project = db.prepare('SELECT p.*, u.name AS curator_name FROM projects p JOIN users u ON u.id = p.curator_id WHERE p.id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  res.json({ project: projectWithStats(project, req.user) });
});

projectsRouter.post('/', requireRole('manager'), (req, res) => {
  const { name, deadline, reminder_days_1, reminder_days_2, escalation_days, no_reaction_hours } = req.body;
  if (!name || !deadline) return res.status(400).json({ error: 'Название и срок обязательны' });
  const result = db
    .prepare(
      `INSERT INTO projects (name, curator_id, deadline, reminder_days_1, reminder_days_2, escalation_days, no_reaction_hours) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, req.user.id, deadline, reminder_days_1 ?? 3, reminder_days_2 ?? 1, escalation_days ?? 3, no_reaction_hours ?? 24);
  const project = db.prepare('SELECT p.*, u.name AS curator_name FROM projects p JOIN users u ON u.id = p.curator_id WHERE p.id = ?').get(result.lastInsertRowid);
  res.status(201).json({ project: projectWithStats(project) });
});

projectsRouter.patch('/:id', requireRole('manager'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  const fields = ['name', 'deadline', 'reminder_days_1', 'reminder_days_2', 'escalation_days', 'no_reaction_hours'];
  const updated = { ...project };
  for (const f of fields) if (req.body[f] !== undefined) updated[f] = req.body[f];
  db.prepare(
    `UPDATE projects SET name=?, deadline=?, reminder_days_1=?, reminder_days_2=?, escalation_days=?, no_reaction_hours=? WHERE id=?`
  ).run(updated.name, updated.deadline, updated.reminder_days_1, updated.reminder_days_2, updated.escalation_days, updated.no_reaction_hours, project.id);
  const fresh = db.prepare('SELECT p.*, u.name AS curator_name FROM projects p JOIN users u ON u.id = p.curator_id WHERE p.id = ?').get(project.id);
  res.json({ project: projectWithStats(fresh) });
});

projectsRouter.get('/:id/observers', requireRole('manager'), (req, res) => {
  const observers = db
    .prepare(`SELECT u.id, u.name, u.email FROM project_observers po JOIN users u ON u.id = po.user_id WHERE po.project_id = ?`)
    .all(req.params.id);
  res.json({ observers });
});

projectsRouter.post('/:id/observers', requireRole('manager'), (req, res) => {
  const { user_id } = req.body;
  db.prepare(`INSERT OR IGNORE INTO project_observers (project_id, user_id) VALUES (?, ?)`).run(req.params.id, user_id);
  res.status(201).json({ ok: true });
});

projectsRouter.delete('/:id/observers/:userId', requireRole('manager'), (req, res) => {
  db.prepare(`DELETE FROM project_observers WHERE project_id = ? AND user_id = ?`).run(req.params.id, req.params.userId);
  res.json({ ok: true });
});
