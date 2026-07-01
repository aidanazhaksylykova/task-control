import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    const user = db.prepare('SELECT id, name, email, role, manager_id, weekly_summary_enabled FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}
