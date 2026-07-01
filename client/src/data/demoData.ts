import type { Project, Task, User } from '../types';

// Статичный снимок демо-данных: используется, когда публичная витрина
// (GitHub Pages) не может достучаться до backend'а.
export const demoUser: User = {
  id: 1,
  name: 'Айгуль Сатпаева',
  email: 'director@taskcontrol.kz',
  role: 'manager',
  manager_id: null,
};

export const demoProjects: Project[] = [
  {
    id: 3,
    name: 'Ребрендинг сайта',
    curator_id: 1,
    curator_name: 'Айгуль Сатпаева',
    deadline: '2026-07-11T05:26:26.964Z',
    reminder_days_1: 3,
    reminder_days_2: 1,
    escalation_days: 3,
    no_reaction_hours: 24,
    health: 'at_risk',
    stats: { total: 10, done: 2, overdue: 1, inProgress: 2, atRisk: 0, progressPct: 20, expectedPct: 2 },
  },
  {
    id: 2,
    name: 'Миграция CRM на новую платформу',
    curator_id: 1,
    curator_name: 'Айгуль Сатпаева',
    deadline: '2026-07-31T05:26:26.962Z',
    reminder_days_1: 3,
    reminder_days_2: 1,
    escalation_days: 3,
    no_reaction_hours: 24,
    health: 'critical',
    stats: { total: 7, done: 1, overdue: 2, inProgress: 3, atRisk: 0, progressPct: 14, expectedPct: 1 },
  },
  {
    id: 1,
    name: 'Запуск мобильного банка',
    curator_id: 1,
    curator_name: 'Айгуль Сатпаева',
    deadline: '2026-08-15T05:26:26.960Z',
    reminder_days_1: 3,
    reminder_days_2: 1,
    escalation_days: 3,
    no_reaction_hours: 24,
    health: 'critical',
    stats: { total: 9, done: 2, overdue: 2, inProgress: 2, atRisk: 0, progressPct: 22, expectedPct: 0 },
  },
];

export const demoRiskTasks: Task[] = [];
