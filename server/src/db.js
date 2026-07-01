import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','executor','observer')),
  manager_id INTEGER REFERENCES users(id),
  weekly_summary_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  curator_id INTEGER NOT NULL REFERENCES users(id),
  deadline TEXT NOT NULL,
  reminder_days_1 INTEGER NOT NULL DEFAULT 3,
  reminder_days_2 INTEGER NOT NULL DEFAULT 1,
  escalation_days INTEGER NOT NULL DEFAULT 3,
  no_reaction_hours INTEGER NOT NULL DEFAULT 24,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_observers (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS overdue_reasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  assignee_id INTEGER NOT NULL REFERENCES users(id),
  deadline TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','review','done','overdue')),
  progress INTEGER NOT NULL DEFAULT 0,
  overdue_reason_id INTEGER REFERENCES overdue_reasons(id),
  is_critical INTEGER NOT NULL DEFAULT 0,
  escalated_to_manager INTEGER NOT NULL DEFAULT 0,
  reminder_3d_sent INTEGER NOT NULL DEFAULT 0,
  reminder_1d_sent INTEGER NOT NULL DEFAULT 0,
  overdue_since TEXT,
  last_overdue_notify_at TEXT,
  last_progress_update_at TEXT,
  reopened_count INTEGER NOT NULL DEFAULT 0,
  postpone_status TEXT CHECK (postpone_status IN ('none','requested','approved','rejected')) NOT NULL DEFAULT 'none',
  postpone_reason TEXT,
  postpone_new_deadline TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  periodicity TEXT NOT NULL CHECK (periodicity IN ('daily','weekly','monthly','weekdays')),
  offset_hours INTEGER NOT NULL DEFAULT 24,
  checklist TEXT NOT NULL DEFAULT '[]',
  assignee_id INTEGER NOT NULL REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  last_generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id);
`);

export function isEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  return row.c === 0;
}
