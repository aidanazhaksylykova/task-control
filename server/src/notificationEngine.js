import { db } from './db.js';

function notify(userId, taskId, type, message) {
  db.prepare(`INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, ?, ?)`).run(userId, taskId, type, message);
}

function addHistory(taskId, eventType, description, actorId = null) {
  db.prepare(`INSERT INTO task_history (task_id, event_type, description, actor_id) VALUES (?, ?, ?, ?)`).run(taskId, eventType, description, actorId);
}

function hasReactionSince(taskId, assigneeId, sinceIso) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM task_history WHERE task_id = ? AND actor_id = ? AND created_at > ?`
    )
    .get(taskId, assigneeId, sinceIso);
  return row.c > 0;
}

/**
 * Реализует раздел 7.2 PRD: напоминания, переход в "Просрочена", повторные
 * уведомления, эскалация на 3-й день и гибкая эскалация по бездействию.
 * Интервалы берутся из настроек проекта, а не зашиты в код.
 */
export function runNotificationCheck() {
  const now = new Date();
  const nowIso = now.toISOString();

  const tasks = db
    .prepare(
      `SELECT t.*, p.reminder_days_1, p.reminder_days_2, p.escalation_days, p.no_reaction_hours, p.curator_id, p.name AS project_name
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.status != 'done'`
    )
    .all();

  const updateTask = db.prepare(`UPDATE tasks SET status = ?, overdue_since = ?, is_critical = ?, escalated_to_manager = ?,
      reminder_3d_sent = ?, reminder_1d_sent = ?, last_overdue_notify_at = ?, updated_at = ? WHERE id = ?`);

  const users = new Map(db.prepare(`SELECT id, name, manager_id FROM users`).all().map((u) => [u.id, u]));

  let processed = 0;

  for (const t of tasks) {
    const deadline = new Date(t.deadline);
    const assignee = users.get(t.assignee_id);

    // Переход в "Просрочена" на момент дедлайна — обрабатываем в этом же
    // проходе как уже просроченную задачу, чтобы критичность/эскалация
    // считались корректно, даже если дедлайн прошёл давно.
    const justTransitioned = t.status !== 'overdue' && now >= deadline;
    if (justTransitioned) {
      t.status = 'overdue';
      t.overdue_since = t.deadline;
      t.is_critical = 0;
      t.escalated_to_manager = 0;
      t.reminder_3d_sent = 1;
      t.reminder_1d_sent = 1;
      t.last_overdue_notify_at = null;
      addHistory(t.id, 'status_change', 'Статус автоматически изменён: → Просрочена (дедлайн наступил)');
      notify(t.assignee_id, t.id, 'overdue', `Задача «${t.title}» просрочена (проект «${t.project_name}»).`);
      notify(t.curator_id, t.id, 'overdue', `Задача «${t.title}» просрочена — исполнитель ${assignee?.name ?? ''} (проект «${t.project_name}»).`);
    }

    if (t.status === 'overdue') {
      const overdueSince = new Date(t.overdue_since ?? t.deadline);
      const overdueDays = (now - overdueSince) / (24 * 3600 * 1000);
      const overdueHours = (now - overdueSince) / (3600 * 1000);

      let isCritical = t.is_critical;
      let escalated = t.escalated_to_manager;
      let lastNotify = t.last_overdue_notify_at;

      // Каждые 24 часа — повторное уведомление (не дублируем в момент самого перехода в просрочку)
      const hoursSinceLastNotify = lastNotify ? (now - new Date(lastNotify)) / (3600 * 1000) : Infinity;
      if (!justTransitioned && hoursSinceLastNotify >= 24) {
        notify(t.assignee_id, t.id, 'overdue_repeat', `Задача «${t.title}» всё ещё просрочена (${Math.floor(overdueDays)} дн.).`);
        notify(t.curator_id, t.id, 'overdue_repeat', `Задача «${t.title}» (${assignee?.name ?? ''}) просрочена уже ${Math.floor(overdueDays)} дн.`);
        lastNotify = nowIso;
      }

      // Эскалация на N-й день просрочки — критическая
      if (!isCritical && overdueDays >= t.escalation_days) {
        isCritical = 1;
        notify(t.curator_id, t.id, 'escalation_critical', `Задача «${t.title}» просрочена ${t.escalation_days}+ дн. и помечена критической.`);
        addHistory(t.id, 'escalation', `Задача помечена критической: просрочка ≥ ${t.escalation_days} дн.`);
      }

      // Гибкая эскалация — исполнитель не отреагировал N часов
      if (!escalated && overdueHours >= t.no_reaction_hours && assignee?.manager_id) {
        if (!hasReactionSince(t.id, t.assignee_id, t.overdue_since ?? t.deadline)) {
          escalated = 1;
          notify(assignee.manager_id, t.id, 'escalation_manager', `Исполнитель ${assignee.name} не отреагировал на просрочку задачи «${t.title}» за ${t.no_reaction_hours} ч. Требуется вмешательство.`);
          addHistory(t.id, 'escalation', `Эскалация вышестоящему руководителю: нет реакции исполнителя ${t.no_reaction_hours}+ ч.`);
        }
      }

      updateTask.run('overdue', t.overdue_since ?? t.deadline, isCritical, escalated, t.reminder_3d_sent, t.reminder_1d_sent, lastNotify, nowIso, t.id);
      processed++;
      continue;
    }

    // Задача ещё не просрочена — проверяем напоминания
    const daysLeft = (deadline - now) / (24 * 3600 * 1000);
    let r3 = t.reminder_3d_sent;
    let r1 = t.reminder_1d_sent;
    let changed = false;

    if (!r3 && daysLeft <= t.reminder_days_1) {
      notify(t.assignee_id, t.id, 'reminder_3d', `Срок задачи «${t.title}» приближается: осталось ~${Math.max(0, Math.ceil(daysLeft))} дн.`);
      r3 = 1;
      changed = true;
    }
    if (!r1 && daysLeft <= t.reminder_days_2 && t.progress < 100) {
      notify(t.assignee_id, t.id, 'reminder_1d', `Задача «${t.title}» не завершена, а срок истекает менее чем через ${t.reminder_days_2} дн.`);
      r1 = 1;
      changed = true;
    }

    if (changed) {
      updateTask.run(t.status, t.overdue_since, t.is_critical, t.escalated_to_manager, r3, r1, t.last_overdue_notify_at, nowIso, t.id);
      processed++;
    }
  }

  return { checkedAt: nowIso, tasksProcessed: processed };
}

export function generateWeeklySummaries() {
  const managers = db.prepare(`SELECT id, name FROM users WHERE role = 'manager' AND weekly_summary_enabled = 1`).all();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  for (const m of managers) {
    const stats = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'done' AND closed_at >= ? THEN 1 ELSE 0 END) AS closed_this_week,
           SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_now,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_now
         FROM tasks`
      )
      .get(weekAgo);

    notify(
      m.id,
      null,
      'weekly_summary',
      `Еженедельная сводка: закрыто за неделю — ${stats.closed_this_week ?? 0}, в работе — ${stats.in_progress_now ?? 0}, просрочено сейчас — ${stats.overdue_now ?? 0}.`
    );
  }
}
