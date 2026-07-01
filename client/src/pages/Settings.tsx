import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Project, RecurringTemplate, User } from '../types';
import { formatDate } from '../utils/format';
import { Modal } from '../components/Modal';

export function Settings() {
  const [tab, setTab] = useState<'templates' | 'projects'>('templates');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Шаблоны и настройки</h1>
          <p className="page-subtitle">Повторяющиеся задачи и настраиваемые интервалы уведомлений по проекту</p>
        </div>
      </div>
      <div className="tabs">
        <div className={`tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>Шаблоны повторяющихся задач</div>
        <div className={`tab ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>Настройки проектов</div>
      </div>
      {tab === 'templates' ? <TemplatesTab /> : <ProjectsTab />}
    </div>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<RecurringTemplate[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [executors, setExecutors] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    const { data } = await api.get('/templates');
    setTemplates(data.templates);
  }

  useEffect(() => {
    load();
    api.get('/projects').then((r) => setProjects(r.data.projects));
    api.get('/auth/users').then((r) => setExecutors(r.data.users.filter((u: User) => u.role === 'executor')));
  }, []);

  async function toggleActive(t: RecurringTemplate) {
    await api.patch(`/templates/${t.id}`, { active: t.active ? 0 : 1 });
    load();
  }

  async function generateNow(t: RecurringTemplate) {
    await api.post(`/templates/${t.id}/generate`);
    load();
  }

  async function remove(t: RecurringTemplate) {
    await api.delete(`/templates/${t.id}`);
    load();
  }

  const periodicityLabels: Record<string, string> = { daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', weekdays: 'По будням' };

  return (
    <div className="card">
      <div className="section-title">
        Шаблоны
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Новый шаблон</button>
      </div>
      {templates === null && <div className="loading">Загрузка…</div>}
      {templates?.length === 0 && <div className="empty-state">Шаблонов пока нет</div>}
      {templates && templates.length > 0 && (
        <table>
          <thead>
            <tr><th>Название</th><th>Проект</th><th>Периодичность</th><th>Исполнитель</th><th>Активен</th><th>Последний запуск</th><th></th></tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} style={{ cursor: 'default' }}>
                <td>{t.name}</td>
                <td>{t.project_name}</td>
                <td>{periodicityLabels[t.periodicity]}</td>
                <td>{t.assignee_name}</td>
                <td>
                  <button className={`btn btn-sm ${t.active ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleActive(t)}>
                    {t.active ? 'Включён' : 'Выключен'}
                  </button>
                </td>
                <td>{formatDate(t.last_generated_at, true)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => generateNow(t)}>Создать сейчас</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateTemplateModal
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

function CreateTemplateModal({
  projects,
  executors,
  onClose,
  onCreated,
}: {
  projects: Project[];
  executors: User[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState(projects[0] ? String(projects[0].id) : '');
  const [assigneeId, setAssigneeId] = useState(executors[0] ? String(executors[0].id) : '');
  const [periodicity, setPeriodicity] = useState('weekly');
  const [offsetHours, setOffsetHours] = useState(48);
  const [checklist, setChecklist] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !projectId || !assigneeId) {
      setError('Заполните обязательные поля');
      return;
    }
    try {
      await api.post('/templates', {
        name,
        project_id: Number(projectId),
        assignee_id: Number(assigneeId),
        periodicity,
        offset_hours: offsetHours,
        checklist: checklist.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Не удалось создать шаблон');
    }
  }

  return (
    <Modal title="Новый шаблон повторяющейся задачи" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Название *</label>
          <input type="text" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Проект *</label>
            <select style={{ width: '100%' }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Исполнитель *</label>
            <select style={{ width: '100%' }} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              {executors.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Периодичность</label>
            <select style={{ width: '100%' }} value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}>
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="monthly">Ежемесячно</option>
              <option value="weekdays">По будням</option>
            </select>
          </div>
          <div className="field">
            <label>Срок через (часов после создания)</label>
            <input type="number" style={{ width: '100%' }} value={offsetHours} onChange={(e) => setOffsetHours(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Чек-лист (по одному пункту на строку)</label>
          <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary">Создать шаблон</button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  async function load() {
    const { data } = await api.get('/projects');
    setProjects(data.projects);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(p: Project, field: string, value: number) {
    await api.patch(`/projects/${p.id}`, { [field]: value });
    load();
  }

  if (!projects) return <div className="loading">Загрузка…</div>;

  return (
    <div>
      {projects.map((p) => (
        <div className="card" key={p.id}>
          <div className="section-title">{p.name}</div>
          <p className="page-subtitle" style={{ marginBottom: 12 }}>
            Все интервалы настраиваются здесь и применяются автоматически движком уведомлений — не зашиты в код.
          </p>
          <div className="field-row">
            <div className="field">
              <label>Напоминание за N дней до дедлайна</label>
              <input type="number" defaultValue={p.reminder_days_1} onBlur={(e) => save(p, 'reminder_days_1', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Повторное напоминание за N дней</label>
              <input type="number" defaultValue={p.reminder_days_2} onBlur={(e) => save(p, 'reminder_days_2', Number(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Эскалация после N дней просрочки</label>
              <input type="number" defaultValue={p.escalation_days} onBlur={(e) => save(p, 'escalation_days', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Гибкая эскалация без реакции, часов</label>
              <input type="number" defaultValue={p.no_reaction_hours} onBlur={(e) => save(p, 'no_reaction_hours', Number(e.target.value))} />
            </div>
          </div>
          <ObserversSection projectId={p.id} />
        </div>
      ))}
    </div>
  );
}

function ObserversSection({ projectId }: { projectId: number }) {
  const [observers, setObservers] = useState<{ id: number; name: string; email: string }[] | null>(null);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [selected, setSelected] = useState('');

  async function load() {
    const { data } = await api.get(`/projects/${projectId}/observers`);
    setObservers(data.observers);
  }

  useEffect(() => {
    load();
    api.get('/auth/users').then((r) => setCandidates(r.data.users.filter((u: User) => u.role === 'observer')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addObserver() {
    if (!selected) return;
    await api.post(`/projects/${projectId}/observers`, { user_id: Number(selected) });
    setSelected('');
    load();
  }

  async function removeObserver(userId: number) {
    await api.delete(`/projects/${projectId}/observers/${userId}`);
    load();
  }

  return (
    <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <label>Наблюдатели проекта (только просмотр)</label>
      {observers === null && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Загрузка…</span>}
      {observers?.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Наблюдатели не назначены</span>}
      {observers?.map((o) => (
        <span className="dep-chip" key={o.id}>
          {o.name}
          <span onClick={() => removeObserver(o.id)} style={{ cursor: 'pointer', color: 'var(--danger)' }}>✕</span>
        </span>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Выберите наблюдателя…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={addObserver}>Добавить</button>
      </div>
    </div>
  );
}
