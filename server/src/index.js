import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { config } from './config.js';
import { seed } from './seed.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { notificationsRouter } from './routes/notifications.js';
import { templatesRouter, overdueReasonsRouter } from './routes/templates.js';
import { analyticsRouter } from './routes/analytics.js';
import { runNotificationCheck, generateWeeklySummaries } from './notificationEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

seed();

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/overdue-reasons', overdueReasonsRouter);
app.use('/api/analytics', analyticsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Раздел 7.2 PRD: проверка триггеров уведомлений каждые 2 минуты (демо-частота;
// в проде было бы раз в час — логика от этого не меняется).
cron.schedule('*/2 * * * *', () => {
  try {
    const result = runNotificationCheck();
    if (result.tasksProcessed > 0) {
      console.log(`[cron] Проверка уведомлений: обработано задач — ${result.tasksProcessed}`);
    }
  } catch (err) {
    console.error('[cron] Ошибка проверки уведомлений:', err);
  }
});

// Еженедельная сводка по почте — раз в неделю, понедельник 08:00
cron.schedule('0 8 * * 1', () => {
  try {
    generateWeeklySummaries();
    console.log('[cron] Еженедельная сводка сформирована');
  } catch (err) {
    console.error('[cron] Ошибка формирования сводки:', err);
  }
});

app.listen(config.port, () => {
  console.log(`Сервер запущен: http://localhost:${config.port}`);
});
