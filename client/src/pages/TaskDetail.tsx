import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Comment, OverdueReason, Task, TaskHistoryEntry } from '../types';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { ProgressBar } from '../components/ProgressBar';
import { formatDate, formatRelative, toDatetimeLocal } from '../utils/format';
import { Modal } from '../components/Modal';

interface DetailResponse {
  task: Task;
  dependsOn: { id: number; title: string; status: string }[];
  blocks: { id: number; title: string; status: string }[];
  history: TaskHistoryEntry[];
  comments: Comment[];
  reasons: OverdueReason[];
}

const eventIcons: Record<string, string> = {
  created: '🆕',
  status_change: '🔁',
  progress_update: '📈',
  comment: '💬',
  escalation: '🚨',
  reopened: '↩️',
  postpone_request: '📅',
  postpone_approved: '✅',
  postpone_rejected: '⛔',
  reassigned: '👤',
};

export function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState('');
  const [progressInput, setProgressInput] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showPostpone, setShowPostpone] = useState(false);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  async function load() {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setData(data);
      setProgressInput(data.task.progress);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Задача не найдена');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (user?.role === 'manager') {
      api.get('/tasks').then((r) => setAllTasks(r.data.tasks));
    }
  }, [user]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="loading">Загрузка…</div>;

  const { task } = data;
  const canEdit = user?.role === 'manager' || (user?.role === 'executor' && task.assignee_id === user.id);

  async function updateProgress(status?: string) {
    await api.post(`/tasks/${task.id}/progress`, { progress: progressInput, status });
    load();
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const form = new FormData();
    form.append('text', commentText);
    if (files) Array.from(files).forEach((f) => form.append('attachments', f));
    await api.post(`/tasks/${task.id}/comments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    setCommentText('');
    setFiles(null);
    if (fileRef.current) fileRef.current.value = '';
    load();
  }

  async function addDependency(depId: number) {
    await api.post(`/tasks/${task.id}/dependencies`, { depends_on_task_id: depId });
    load();
  }

  async function removeDependency(depId: number) {
    await api.delete(`/tasks/${task.id}/dependencies/${depId}`);
    load();
  }

  async function decidePostpone(approve: boolean) {
    await api.post(`/tasks/${task.id}/postpone-decision`, { approve });
    load();
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        ← Назад
      </button>

      <div className="task-detail-grid">
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h1 className="page-title" style={{ fontSize: 19 }}>{task.title}</h1>
                <p className="page-subtitle">
                  {task.project_name} · Исполнитель: {task.assignee_name} · Постановщик: {task.creator_name}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <StatusBadge status={task.status} critical={!!task.is_critical} />
                <PriorityBadge priority={task.priority} />
              </div>
            </div>
            {task.description && <p style={{ marginTop: 14, fontSize: 13.5, color: 'var(--text-muted)' }}>{task.description}</p>}
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>Срок: {formatDate(task.deadline, true)} ({formatRelative(task.deadline)})</div>
            {task.status === 'overdue' && (
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--danger)' }}>
                Просрочена с {formatDate(task.overdue_since, true)}
                {!!task.escalated_to_manager && ' · эскалировано вышестоящему руководителю'}
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <ProgressBar value={task.progress} />
            </div>

            {task.postpone_status === 'requested' && (
              <div className="card" style={{ marginTop: 14, background: 'var(--warning-soft)', border: 'none' }}>
                <strong>Запрошен перенос срока</strong>
                <div style={{ fontSize: 13, margin: '6px 0' }}>
                  Причина: {task.postpone_reason} <br />
                  Новый срок: {formatDate(task.postpone_new_deadline, true)}
                </div>
                {user?.role === 'manager' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => decidePostpone(true)}>Одобрить</button>
                    <button className="btn btn-danger btn-sm" onClick={() => decidePostpone(false)}>Отклонить</button>
                  </div>
                )}
              </div>
            )}

            {canEdit && task.status !== 'done' && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div className="section-title">Быстрые действия</div>
                <div className="field-row" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ maxWidth: 140 }}>
                    <label>% готовности</label>
                    <input type="number" min={0} max={100} value={progressInput} onChange={(e) => setProgressInput(Number(e.target.value))} />
                  </div>
                  <button className="btn btn-secondary" onClick={() => updateProgress()}>Обновить готовность</button>
                  {task.status === 'new' && (
                    <button className="btn btn-secondary" onClick={() => updateProgress('in_progress')}>Взять в работу</button>
                  )}
                  {task.status === 'in_progress' && (
                    <button className="btn btn-secondary" onClick={() => updateProgress('review')}>На проверку</button>
                  )}
                  <button className="btn btn-primary" onClick={() => setShowComplete(true)}>Отметить выполненной</button>
                  <button className="btn btn-ghost" onClick={() => setShowPostpone(true)}>Запросить перенос срока</button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">Зависимости</div>
            <div>
              <strong style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Зависит от:</strong>{' '}
              {data.dependsOn.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>нет</span>}
              {data.dependsOn.map((d) => (
                <span className="dep-chip" key={d.id} onClick={() => navigate(`/tasks/${d.id}`)}>
                  <StatusBadge status={d.status as Task['status']} /> {d.title}
                  {user?.role === 'manager' && (
                    <span onClick={(e) => { e.stopPropagation(); removeDependency(d.id); }} style={{ cursor: 'pointer', color: 'var(--danger)' }}>✕</span>
                  )}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Блокирует:</strong>{' '}
              {data.blocks.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>нет</span>}
              {data.blocks.map((d) => (
                <span className="dep-chip" key={d.id} onClick={() => navigate(`/tasks/${d.id}`)}>
                  <StatusBadge status={d.status as Task['status']} /> {d.title}
                </span>
              ))}
            </div>
            {user?.role === 'manager' && (
              <div style={{ marginTop: 12 }}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addDependency(Number(e.target.value));
                    e.target.value = '';
                  }}
                >
                  <option value="" disabled>+ Добавить блокирующую задачу…</option>
                  {allTasks.filter((t) => t.id !== task.id).map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">Комментарии</div>
            {data.comments.length === 0 && <div className="empty-state">Комментариев пока нет</div>}
            {data.comments.map((c) => (
              <div className="comment-item" key={c.id}>
                <span className="comment-author">{c.author_name}</span>
                <div>{c.text}</div>
                {c.attachments.map((a) => (
                  <span className="attachment-chip" key={a.id}>📎 {a.filename}</span>
                ))}
                <div className="comment-meta">{formatDate(c.created_at, true)}</div>
              </div>
            ))}
            <form onSubmit={submitComment} style={{ marginTop: 12 }}>
              <textarea
                placeholder="Комментарий… используйте @Имя Фамилия для упоминания"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <input ref={fileRef} type="file" multiple onChange={(e) => setFiles(e.target.files)} style={{ fontSize: 12 }} />
                <button className="btn btn-primary btn-sm" type="submit">Отправить</button>
              </div>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="section-title">Журнал</div>
            {data.history.map((h) => (
              <div className="history-item" key={h.id}>
                <div>{eventIcons[h.event_type] || '•'} {h.description}</div>
                <div className="history-meta">{h.actor_name || 'Система'} · {formatDate(h.created_at, true)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showComplete && (
        <CompleteModal
          task={task}
          reasons={data.reasons}
          onClose={() => setShowComplete(false)}
          onDone={() => {
            setShowComplete(false);
            load();
          }}
        />
      )}

      {showPostpone && (
        <PostponeModal
          task={task}
          onClose={() => setShowPostpone(false)}
          onDone={() => {
            setShowPostpone(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CompleteModal({ task, reasons, onClose, onDone }: { task: Task; reasons: OverdueReason[]; onClose: () => void; onDone: () => void }) {
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? '');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/tasks/${task.id}/complete`, task.status === 'overdue' ? { overdue_reason_id: reasonId } : {});
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Не удалось закрыть задачу');
    }
  }

  return (
    <Modal title="Завершить задачу" onClose={onClose}>
      <form onSubmit={submit}>
        {task.status === 'overdue' ? (
          <div className="field">
            <label>Причина просрочки *</label>
            <select style={{ width: '100%' }} value={reasonId} onChange={(e) => setReasonId(Number(e.target.value))}>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        ) : (
          <p style={{ fontSize: 13.5 }}>Задача будет отмечена выполненной в срок.</p>
        )}
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary">Подтвердить</button>
        </div>
      </form>
    </Modal>
  );
}

function PostponeModal({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [newDeadline, setNewDeadline] = useState(toDatetimeLocal(task.deadline));
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError('Укажите причину');
      return;
    }
    try {
      await api.post(`/tasks/${task.id}/postpone-request`, { reason, newDeadline: new Date(newDeadline).toISOString() });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Не удалось отправить запрос');
    }
  }

  return (
    <Modal title="Запросить перенос срока" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Новый желаемый срок</label>
          <input type="datetime-local" style={{ width: '100%' }} value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
        </div>
        <div className="field">
          <label>Причина *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary">Отправить запрос</button>
        </div>
      </form>
    </Modal>
  );
}
