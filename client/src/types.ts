export type Role = 'manager' | 'executor' | 'observer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  manager_id: number | null;
  weekly_summary_enabled?: number;
}

export type TaskStatus = 'new' | 'in_progress' | 'review' | 'done' | 'overdue';
export type Priority = 'low' | 'medium' | 'high';
export type Health = 'normal' | 'at_risk' | 'critical';

export interface Project {
  id: number;
  name: string;
  curator_id: number;
  curator_name: string;
  deadline: string;
  reminder_days_1: number;
  reminder_days_2: number;
  escalation_days: number;
  no_reaction_hours: number;
  health: Health;
  stats: {
    total: number;
    done: number;
    overdue: number;
    inProgress: number;
    atRisk: number;
    progressPct: number;
    expectedPct: number;
  };
}

export interface Task {
  id: number;
  title: string;
  description: string;
  project_id: number;
  project_name: string;
  creator_id: number;
  creator_name: string;
  assignee_id: number;
  assignee_name: string;
  deadline: string;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  overdue_reason_id: number | null;
  is_critical: number;
  escalated_to_manager: number;
  overdue_since: string | null;
  reopened_count: number;
  postpone_status: 'none' | 'requested' | 'approved' | 'rejected';
  postpone_reason: string | null;
  postpone_new_deadline: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  at_risk: number;
}

export interface TaskHistoryEntry {
  id: number;
  task_id: number;
  event_type: string;
  description: string;
  actor_id: number | null;
  actor_name: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  filename: string;
  filepath: string;
}

export interface Comment {
  id: number;
  task_id: number;
  author_id: number;
  author_name: string;
  text: string;
  created_at: string;
  attachments: Attachment[];
}

export interface OverdueReason {
  id: number;
  label: string;
}

export interface Notification {
  id: number;
  user_id: number;
  task_id: number | null;
  task_title: string | null;
  type: string;
  message: string;
  read: number;
  created_at: string;
}

export interface RecurringTemplate {
  id: number;
  project_id: number;
  project_name: string;
  name: string;
  periodicity: 'daily' | 'weekly' | 'monthly' | 'weekdays';
  offset_hours: number;
  checklist: string[];
  assignee_id: number;
  assignee_name: string;
  active: number;
  last_generated_at: string | null;
}
