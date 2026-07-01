import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  return format(new Date(iso), withTime ? 'd MMM yyyy, HH:mm' : 'd MMM yyyy', { locale: ru });
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return '—';
  return formatDistanceToNow(new Date(iso), { locale: ru, addSuffix: true });
}

export function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
