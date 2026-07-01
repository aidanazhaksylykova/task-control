import { db } from './db.js';

/** Возвращает список id проектов, видимых пользователю согласно его роли. */
export function visibleProjectIds(user) {
  if (user.role === 'manager') {
    return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  }
  if (user.role === 'executor') {
    return db.prepare('SELECT DISTINCT project_id AS id FROM tasks WHERE assignee_id = ?').all(user.id).map((r) => r.id);
  }
  // observer
  return db.prepare('SELECT project_id AS id FROM project_observers WHERE user_id = ?').all(user.id).map((r) => r.id);
}

export function canAccessProject(user, projectId) {
  return visibleProjectIds(user).includes(Number(projectId));
}

export function canAccessTask(user, task) {
  if (user.role === 'manager') return true;
  if (user.role === 'executor') return task.assignee_id === user.id;
  return canAccessProject(user, task.project_id);
}

export function canEditTask(user, task) {
  if (user.role === 'manager') return true;
  if (user.role === 'executor') return task.assignee_id === user.id;
  return false;
}
