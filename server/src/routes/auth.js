import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Неверный e-mail или пароль' });
  }
  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.get('/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, manager_id FROM users ORDER BY name').all();
  res.json({ users });
});
