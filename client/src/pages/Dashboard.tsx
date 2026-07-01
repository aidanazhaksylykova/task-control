import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { demoProjects, demoRiskTasks } from '../data/demoData';
import type { Project, Task } from '../types';
import { HealthBadge } from '../components/Badges';
import { ProgressBar } from '../components/ProgressBar';
import { formatDate } from '../utils/format';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [riskTasks, setRiskTasks] = useState<Task[]>([]);
  const [running, setRunning] = useState(false);

  async function load() {
    try {
      const [{ data: pData }, { data: tData }] = await Promise.all([api.get('/projects'), api.get('/tasks')]);
      setProjects(pData.projects);
      setRiskTasks(tData.tasks.filter((t: Task) => t.at_risk && t.status !== 'overdue').slice(0, 8));
    } catch {
      // Backend недоступен (например, витрина на GitHub Pages без Render) — показываем статичный демо-снимок.
      setProjects(demoProjects);
      setRiskTasks(demoRiskTasks);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!projects) return <div className="loading">Загрузка…</div>;

  const totals = projects.reduce(
    (acc, p) => {
      acc.total += p.stats.total;
      acc.inProgress += p.stats.inProgress;
      acc.overdue += p.stats.overdue;
      acc.done += p.stats.done;
      return acc;
    },
    { total: 0, inProgress: 0, overdue: 0, done: 0 }
  );

  async function runCheckNow() {
    setRunning(true);
    try {
      await api.post('/notifications/run-check');
      await load();
    } catch {
      // Backend недоступен в статичном демо-режиме — тихо игнорируем.
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Дашборд</h1>
          <p className="page-subtitle">Сводная картина по всем проектам без ручного сбора статусов</p>
        </div>
        {user?.role === 'manager' && (
          <button className="btn btn-secondary" onClick={runCheckNow} disabled={running}>
            {running ? 'Проверяем…' : '🔄 Запустить проверку уведомлений'}
          </button>
        )}
      </div>

      <div className="grid grid-4">
        <div className="card stat-card">
          <div className="stat-label">Задач всего</div>
          <div className="stat-value">{totals.total}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">В работе</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{totals.inProgress}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Просрочено</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{totals.overdue}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Выполнено</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{totals.done}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Проекты</div>
        {projects.length === 0 && <div className="empty-state">Нет доступных проектов</div>}
        {projects.map((p) => (
          <div
            key={p.id}
            style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            onClick={() => navigate(`/tasks?project_id=${p.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <HealthBadge health={p.health} />
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
              <span>Куратор: {p.curator_name}</span>
              <span>Срок: {formatDate(p.deadline)}</span>
              <span>Задач: {p.stats.total}</span>
              <span>Просрочено: {p.stats.overdue}</span>
            </div>
            <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              План {p.stats.expectedPct}% / Факт {p.stats.progressPct}%
              {p.stats.progressPct < p.stats.expectedPct ? ' — отстаёт от графика' : ' — по графику или опережает'}
            </div>
            <ProgressBar value={p.stats.progressPct} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">Прогноз риска — задачи, отстающие по темпу до формального срыва</div>
        {riskTasks.length === 0 && <div className="empty-state">Рискованных задач не обнаружено</div>}
        {riskTasks.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Задача</th>
                <th>Проект</th>
                <th>Исполнитель</th>
                <th>Готовность</th>
                <th>Срок</th>
              </tr>
            </thead>
            <tbody>
              {riskTasks.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <td>{t.title}</td>
                  <td>{t.project_name}</td>
                  <td>{t.assignee_name}</td>
                  <td style={{ width: 140 }}>
                    <ProgressBar value={t.progress} />
                  </td>
                  <td>{formatDate(t.deadline, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
