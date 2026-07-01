import type { Health, Priority, TaskStatus } from '../types';

const statusLabels: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Выполнена',
  overdue: 'Просрочена',
};

const priorityLabels: Record<Priority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

const healthLabels: Record<Health, string> = {
  normal: 'В норме',
  at_risk: 'Под угрозой',
  critical: 'Критический',
};

export function StatusBadge({ status, critical }: { status: TaskStatus; critical?: boolean }) {
  return (
    <span className={`badge badge-${status}`}>
      {statusLabels[status]}
      {critical ? ' · критично' : ''}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge badge-${priority}`}>{priorityLabels[priority]}</span>;
}

export function HealthBadge({ health }: { health: Health }) {
  return (
    <span className={`badge badge-${health}`}>
      <span className={`health-dot ${health}`} /> {healthLabels[health]}
    </span>
  );
}

export function RiskBadge() {
  return <span className="badge badge-at_risk">Риск срыва</span>;
}
