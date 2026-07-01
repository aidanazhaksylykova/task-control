import { useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api/client';
import type { Project, User } from '../types';

export function CreateTaskModal({
  projects,
  executors,
  onClose,
  onCreated,
  defaultProjectId,
}: {
  projects: Project[];
  executors: User[];
  onClose: () => void;
  onCreated: () => void;
  defaultProjectId?: number;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ? String(defaultProjectId) : projects[0] ? String(projects[0].id) : '');
  const [assigneeId, setAssigneeId] = useState(executors[0] ? String(executors[0].id) : '');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title || !projectId || !assigneeId || !deadline) {
      setError('Заполните обязательные поля');
      return;
    }
    setSaving(true);
    try {
      await api.post('/tasks', {
        title,
        description,
        project_id: Number(projectId),
        assignee_id: Number(assigneeId),
        deadline: new Date(deadline).toISOString(),
        priority,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Не удалось создать задачу');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Новая задача" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Название *</label>
          <input type="text" style={{ width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Описание</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <label>Дедлайн *</label>
            <input type="datetime-local" style={{ width: '100%' }} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="field">
            <label>Приоритет</label>
            <select style={{ width: '100%' }} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Создаём…' : 'Создать задачу'}</button>
        </div>
      </form>
    </Modal>
  );
}
