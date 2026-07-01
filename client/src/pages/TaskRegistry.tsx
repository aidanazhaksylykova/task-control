import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Project, Task, User } from '../types';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { ProgressBar } from '../components/ProgressBar';
import { formatDate } from '../utils/format';
import { CreateTaskModal } from '../components/CreateTaskModal';

export function TaskRegistry() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const filters = {
    project_id: searchParams.get('project_id') || '',
    assignee_id: searchParams.get('assignee_id') || '',
    status: searchParams.get('status') || '',
    priority: searchParams.get('priority') || '',
    search: searchParams.get('search') || '',
  };

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  async function load() {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    const { data } = await api.get('/tasks', { params });
    setTasks(data.tasks);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data.projects));
    if (user?.role === 'manager') api.get('/auth/users').then((r) => setUsers(r.data.users.filter((u: User) => u.role === 'executor')));
  }, [user]);

  const executors = useMemo(() => users, [users]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Реестр задач</h1>
          <p className="page-subtitle">Все задачи по проектам, отсортированы по сроку — самые срочные наверху</p>
        </div>
        {user?.role === 'manager' && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Новая задача
          </button>
        )}
      </div>

      <div className="filters-bar">
        <select value={filters.project_id} onChange={(e) => setFilter('project_id', e.target.value)}>
          <option value="">Все проекты</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {user?.role === 'manager' && (
          <select value={filters.assignee_id} onChange={(e) => setFilter('assignee_id', e.target.value)}>
            <option value="">Все исполнители</option>
            {executors.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">Любой статус</option>
          <option value="new">Новая</option>
          <option value="in_progress">В работе</option>
          <option value="review">На проверке</option>
          <option value="done">Выполнена</option>
          <option value="overdue">Просрочена</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)}>
          <option value="">Любой приоритет</option>
          <option value="low">Низкий</option>
          <option value="medium">Средний</option>
          <option value="high">Высокий</option>
        </select>
        <input type="text" placeholder="Поиск по названию…" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {tasks === null && <div className="loading">Загрузка…</div>}
        {tasks?.length === 0 && <div className="empty-state">Задачи не найдены</div>}
        {tasks && tasks.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Задача</th>
                <th>Проект</th>
                <th>Исполнитель</th>
                <th>Приоритет</th>
                <th>Статус</th>
                <th>Готовность</th>
                <th>Срок</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <td>{t.title}{!!t.at_risk && t.status !== 'overdue' && ' ⚠️'}</td>
                  <td>{t.project_name}</td>
                  <td>{t.assignee_name}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td><StatusBadge status={t.status} critical={!!t.is_critical} /></td>
                  <td style={{ width: 140 }}><ProgressBar value={t.progress} /></td>
                  <td>{formatDate(t.deadline, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateTaskModal
          projects={projects}
          executors={executors}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
