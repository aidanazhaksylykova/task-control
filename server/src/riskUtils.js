/**
 * Прогноз риска (раздел 8.1 PRD): задача помечается риском по темпу
 * прогресса ещё до формального порога "на грани" (просрочки).
 */
export function isAtRisk(task, now = new Date()) {
  if (task.status === 'done' || task.status === 'overdue') return false;
  const deadline = new Date(task.deadline);
  const created = new Date(task.created_at);
  const totalMs = Math.max(deadline - created, 1);
  const elapsedFraction = Math.min(Math.max((now - created) / totalMs, 0), 1);
  const expectedProgress = elapsedFraction * 100;
  return expectedProgress - task.progress >= 25 && elapsedFraction > 0.3;
}

export function computeProjectHealth(tasks, now = new Date()) {
  const hasCriticalOverdue = tasks.some((t) => t.status === 'overdue' && t.is_critical);
  const hasOverdue = tasks.some((t) => t.status === 'overdue');
  const hasRisk = tasks.some((t) => isAtRisk(t, now));
  if (hasCriticalOverdue) return 'critical';
  if (hasOverdue || hasRisk) return 'at_risk';
  return 'normal';
}
