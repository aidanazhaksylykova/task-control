import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Overview {
  period: string;
  onTimeRate: number | null;
  avgDelayDays: number;
  planFact: { projectId: number; projectName: string; planPct: number; factPct: number }[];
  byAssignee: { assigneeId: number; name: string; closed: number; onTimePct: number | null }[] | null;
  totals: { total: number; done: number; overdue: number; inProgress: number };
}

interface Reliability {
  assigneeId: number;
  name: string;
  totalTasks: number;
  closed: number;
  onTimePct: number | null;
  overdueNow: number;
  reopenedCount: number;
}

interface Workload {
  days: string[];
  grid: { assigneeId: number; name: string; counts: number[] }[];
}

function heatColor(count: number) {
  if (count === 0) return 'var(--slate-soft)';
  if (count <= 1) return '#c7d2fe';
  if (count <= 2) return '#818cf8';
  return '#4338ca';
}

export function Analytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reliability, setReliability] = useState<Reliability[] | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);

  useEffect(() => {
    api.get('/analytics/overview', { params: { period } }).then((r) => setOverview(r.data));
  }, [period]);

  useEffect(() => {
    if (user?.role !== 'manager') return;
    api.get('/analytics/reliability').then((r) => setReliability(r.data.reliability));
    api.get('/analytics/workload').then((r) => setWorkload(r.data));
  }, [user]);

  if (!overview) return <div className="loading">Загрузка…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Аналитика</h1>
          <p className="page-subtitle">Динамика исполнения по выбранному периоду</p>
        </div>
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p)}>
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Квартал'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card stat-card">
          <div className="stat-label">Доля задач, закрытых в срок</div>
          <div className="stat-value">{overview.onTimeRate === null ? '—' : `${overview.onTimeRate}%`}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Средняя просрочка, дней</div>
          <div className="stat-value">{overview.avgDelayDays}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Просрочено сейчас</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{overview.totals.overdue}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">План/факт по проектам</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={overview.planFact}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="projectName" tick={{ fontSize: 12 }} />
            <YAxis unit="%" />
            <Tooltip />
            <Legend />
            <Bar dataKey="planPct" name="План (% времени)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="factPct" name="Факт (% выполнено)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {overview.byAssignee && (
        <div className="card">
          <div className="section-title">Доля закрытых в срок по исполнителям (за период)</div>
          <table>
            <thead>
              <tr><th>Исполнитель</th><th>Закрыто за период</th><th>% в срок</th></tr>
            </thead>
            <tbody>
              {overview.byAssignee.map((a) => (
                <tr key={a.assigneeId} style={{ cursor: 'default' }}>
                  <td>{a.name}</td>
                  <td>{a.closed}</td>
                  <td>{a.onTimePct === null ? '—' : `${a.onTimePct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reliability && (
        <div className="card">
          <div className="section-title">Рейтинг надёжности исполнителей</div>
          <table>
            <thead>
              <tr><th>Исполнитель</th><th>Всего задач</th><th>Закрыто</th><th>% в срок</th><th>Просрочено сейчас</th><th>Переоткрыто</th></tr>
            </thead>
            <tbody>
              {reliability.map((r) => (
                <tr key={r.assigneeId} style={{ cursor: 'default' }}>
                  <td>{r.name}</td>
                  <td>{r.totalTasks}</td>
                  <td>{r.closed}</td>
                  <td>{r.onTimePct === null ? '—' : `${r.onTimePct}%`}</td>
                  <td style={{ color: r.overdueNow > 0 ? 'var(--danger)' : undefined }}>{r.overdueNow}</td>
                  <td>{r.reopenedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {workload && (
        <div className="card">
          <div className="section-title">Тепловая карта загрузки команды (задач на день)</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Исполнитель</th>
                  {workload.days.map((d) => (
                    <th key={d} style={{ fontSize: 10 }}>{d.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workload.grid.map((row) => (
                  <tr key={row.assigneeId} style={{ cursor: 'default' }}>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{row.name}</td>
                    {row.counts.map((c, i) => (
                      <td key={i}>
                        <span className="heat-cell" style={{ background: heatColor(c), color: c > 2 ? '#fff' : 'var(--text)' }}>{c || ''}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
