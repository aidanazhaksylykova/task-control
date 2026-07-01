import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { visibleProjectIds } from '../access.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

function periodDays(period) {
  return { week: 7, month: 30, quarter: 90 }[period] || 30;
}

function scopedTasks(user) {
  const ids = visibleProjectIds(user);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM tasks WHERE project_id IN (${placeholders})`).all(...ids);
}

analyticsRouter.get('/overview', (req, res) => {
  const days = periodDays(req.query.period);
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const now = new Date();
  const tasks = scopedTasks(req.user);

  const closedInPeriod = tasks.filter((t) => t.status === 'done' && t.closed_at && t.closed_at >= cutoff);
  const onTimeInPeriod = closedInPeriod.filter((t) => t.closed_at <= t.deadline);
  const onTimeRate = closedInPeriod.length ? Math.round((onTimeInPeriod.length / closedInPeriod.length) * 100) : null;

  const delaySamples = tasks
    .filter((t) => (t.status === 'done' && t.closed_at > t.deadline) || t.status === 'overdue')
    .map((t) => {
      const end = t.status === 'done' ? new Date(t.closed_at) : now;
      return (end - new Date(t.deadline)) / (24 * 3600 * 1000);
    })
    .filter((d) => d > 0);
  const avgDelayDays = delaySamples.length ? Math.round((delaySamples.reduce((a, b) => a + b, 0) / delaySamples.length) * 10) / 10 : 0;

  const projectIds = [...new Set(tasks.map((t) => t.project_id))];
  const projects = projectIds.length
    ? db.prepare(`SELECT * FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`).all(...projectIds)
    : [];
  const planFact = projects.map((p) => {
    const pTasks = tasks.filter((t) => t.project_id === p.id);
    const total = pTasks.length || 1;
    const factPct = Math.round((pTasks.filter((t) => t.status === 'done').length / total) * 100);
    const start = pTasks.length ? Math.min(...pTasks.map((t) => new Date(t.created_at).getTime())) : Date.now();
    const span = Math.max(new Date(p.deadline).getTime() - start, 1);
    const planPct = Math.round((Math.min(Math.max((Date.now() - start) / span, 0), 1)) * 100);
    return { projectId: p.id, projectName: p.name, planPct, factPct };
  });

  let byAssignee = null;
  if (req.user.role === 'manager') {
    const executors = db.prepare(`SELECT id, name FROM users WHERE role = 'executor'`).all();
    byAssignee = executors.map((u) => {
      const uClosed = closedInPeriod.filter((t) => t.assignee_id === u.id);
      const uOnTime = uClosed.filter((t) => t.closed_at <= t.deadline);
      return {
        assigneeId: u.id,
        name: u.name,
        closed: uClosed.length,
        onTimePct: uClosed.length ? Math.round((uOnTime.length / uClosed.length) * 100) : null,
      };
    });
  }

  res.json({ period: req.query.period || 'month', onTimeRate, avgDelayDays, planFact, byAssignee, totals: {
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.status === 'overdue').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length,
  } });
});

analyticsRouter.get('/reliability', requireRole('manager'), (req, res) => {
  const executors = db.prepare(`SELECT id, name FROM users WHERE role = 'executor'`).all();
  const tasks = db.prepare(`SELECT * FROM tasks`).all();
  const reliability = executors.map((u) => {
    const own = tasks.filter((t) => t.assignee_id === u.id);
    const closed = own.filter((t) => t.status === 'done');
    const onTime = closed.filter((t) => t.closed_at <= t.deadline);
    const overdueNow = own.filter((t) => t.status === 'overdue').length;
    const reopenedCount = own.reduce((sum, t) => sum + t.reopened_count, 0);
    return {
      assigneeId: u.id,
      name: u.name,
      totalTasks: own.length,
      closed: closed.length,
      onTimePct: closed.length ? Math.round((onTime.length / closed.length) * 100) : null,
      overdueNow,
      reopenedCount,
    };
  });
  reliability.sort((a, b) => (b.onTimePct ?? -1) - (a.onTimePct ?? -1));
  res.json({ reliability });
});

analyticsRouter.get('/workload', requireRole('manager'), (req, res) => {
  const executors = db.prepare(`SELECT id, name FROM users WHERE role = 'executor'`).all();
  const tasks = db.prepare(`SELECT * FROM tasks WHERE status != 'done'`).all();

  const days = [];
  for (let i = -7; i <= 13; i++) {
    const d = new Date(Date.now() + i * 24 * 3600 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }

  const grid = executors.map((u) => {
    const counts = days.map((day) => tasks.filter((t) => t.assignee_id === u.id && t.deadline.slice(0, 10) === day).length);
    return { assigneeId: u.id, name: u.name, counts };
  });

  res.json({ days, grid });
});
