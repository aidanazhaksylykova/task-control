import bcrypt from 'bcryptjs';
import { db, isEmpty } from './db.js';
import { runNotificationCheck } from './notificationEngine.js';

function hoursFromNow(h) {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}
function daysFromNow(d) {
  return hoursFromNow(d * 24);
}

export function seed() {
  if (!isEmpty()) return;

  const hash = bcrypt.hashSync('password123', 8);

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, manager_id, weekly_summary_enabled) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const managerId = insertUser.run('Айгуль Сатпаева', 'director@taskcontrol.kz', hash, 'manager', null, 1).lastInsertRowid;
  const daniyarId = insertUser.run('Данияр Ахметов', 'daniyar@taskcontrol.kz', hash, 'executor', managerId, 1).lastInsertRowid;
  const zhannaId = insertUser.run('Жанна Оспанова', 'zhanna@taskcontrol.kz', hash, 'executor', managerId, 1).lastInsertRowid;
  const erlanId = insertUser.run('Ерлан Тулеген', 'erlan@taskcontrol.kz', hash, 'executor', managerId, 1).lastInsertRowid;
  const sauleId = insertUser.run('Сауле Ибраева', 'saule@taskcontrol.kz', hash, 'executor', managerId, 1).lastInsertRowid;
  const maratId = insertUser.run('Марат Жумабеков', 'marat@client.kz', hash, 'observer', null, 0).lastInsertRowid;

  const insertReason = db.prepare(`INSERT INTO overdue_reasons (label) VALUES (?)`);
  const reasons = [
    'Изменились приоритеты',
    'Не хватило ресурсов',
    'Техническая проблема',
    'Ожидание внешней стороны',
    'Некорректная оценка сроков',
    'Другое',
  ].map((label) => insertReason.run(label).lastInsertRowid);
  const [rPriority, rResources, rTechnical, rExternal, rEstimate] = reasons;

  const insertProject = db.prepare(
    `INSERT INTO projects (name, curator_id, deadline, reminder_days_1, reminder_days_2, escalation_days, no_reaction_hours) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const p1 = insertProject.run('Запуск мобильного банка', managerId, daysFromNow(45), 3, 1, 3, 24).lastInsertRowid;
  const p2 = insertProject.run('Миграция CRM на новую платформу', managerId, daysFromNow(30), 3, 1, 3, 24).lastInsertRowid;
  const p3 = insertProject.run('Ребрендинг сайта', managerId, daysFromNow(10), 3, 1, 3, 24).lastInsertRowid;

  db.prepare(`INSERT INTO project_observers (project_id, user_id) VALUES (?, ?)`).run(p3, maratId);

  const insertTemplate = db.prepare(
    `INSERT INTO recurring_templates (project_id, name, periodicity, offset_hours, checklist, assignee_id, active) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertTemplate.run(
    p1,
    'Еженедельный отчёт по спринту',
    'weekly',
    48,
    JSON.stringify(['Собрать метрики спринта', 'Обновить статус в реестре', 'Отправить руководителю']),
    daniyarId,
    1
  );
  insertTemplate.run(
    p2,
    'Ежедневный чек-лист поддержки миграции',
    'daily',
    8,
    JSON.stringify(['Проверить тикеты', 'Обновить статус инцидентов']),
    erlanId,
    1
  );

  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, project_id, creator_id, assignee_id, deadline, priority, status, progress, overdue_reason_id, closed_at, postpone_status, postpone_reason, postpone_new_deadline)
    VALUES (@title, @description, @project_id, @creator_id, @assignee_id, @deadline, @priority, @status, @progress, @overdue_reason_id, @closed_at, @postpone_status, @postpone_reason, @postpone_new_deadline)
  `);

  function addTask(t) {
    const row = {
      description: '',
      priority: 'medium',
      status: 'in_progress',
      progress: 0,
      overdue_reason_id: null,
      closed_at: null,
      postpone_status: 'none',
      postpone_reason: null,
      postpone_new_deadline: null,
      ...t,
    };
    return insertTask.run(row).lastInsertRowid;
  }

  // --- Проект 1: Запуск мобильного банка ---
  const t1 = addTask({ title: 'Разработать API авторизации', project_id: p1, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(-5), priority: 'high', status: 'in_progress', progress: 60 });
  const t2 = addTask({ title: 'Интеграция с платёжным шлюзом', project_id: p1, creator_id: managerId, assignee_id: zhannaId, deadline: daysFromNow(-1), priority: 'high', status: 'in_progress', progress: 40 });
  const t3 = addTask({ title: 'Тестирование сценариев перевода', project_id: p1, creator_id: managerId, assignee_id: erlanId, deadline: daysFromNow(1), priority: 'medium', status: 'in_progress', progress: 30 });
  const t4 = addTask({ title: 'Настройка push-уведомлений', project_id: p1, creator_id: managerId, assignee_id: zhannaId, deadline: daysFromNow(3), priority: 'medium', status: 'new', progress: 10 });
  addTask({ title: 'Дизайн экрана онбординга', project_id: p1, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(-10), priority: 'medium', status: 'done', progress: 100, closed_at: daysFromNow(-11) });
  addTask({ title: 'Нагрузочное тестирование', project_id: p1, creator_id: managerId, assignee_id: erlanId, deadline: daysFromNow(15), priority: 'low', status: 'new', progress: 0 });
  addTask({ title: 'Согласование договора с банком-партнёром', project_id: p1, creator_id: managerId, assignee_id: sauleId, deadline: daysFromNow(-8), priority: 'high', status: 'done', progress: 100, overdue_reason_id: rExternal, closed_at: daysFromNow(-6) });
  addTask({ title: 'Настройка биометрической аутентификации', project_id: p1, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(7), priority: 'medium', status: 'in_progress', progress: 20 });

  // --- Проект 2: Миграция CRM ---
  const t9 = addTask({ title: 'Экспорт данных из старой CRM', project_id: p2, creator_id: managerId, assignee_id: erlanId, deadline: daysFromNow(-2), priority: 'high', status: 'in_progress', progress: 80 });
  addTask({ title: 'Маппинг полей клиентов', project_id: p2, creator_id: managerId, assignee_id: sauleId, deadline: daysFromNow(2), priority: 'medium', status: 'in_progress', progress: 50 });
  addTask({ title: 'Обучение отдела продаж', project_id: p2, creator_id: managerId, assignee_id: zhannaId, deadline: daysFromNow(20), priority: 'low', status: 'new', progress: 0 });
  addTask({ title: 'Настройка ролей и прав доступа', project_id: p2, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(5), priority: 'medium', status: 'review', progress: 70 });
  addTask({ title: 'Миграция истории сделок', project_id: p2, creator_id: managerId, assignee_id: erlanId, deadline: daysFromNow(-15), priority: 'medium', status: 'done', progress: 100, closed_at: daysFromNow(-16) });
  addTask({ title: 'Пилотный запуск на одном отделе', project_id: p2, creator_id: managerId, assignee_id: sauleId, deadline: daysFromNow(10), priority: 'medium', status: 'in_progress', progress: 15 });
  addTask({ title: 'Финальная проверка интеграции с 1С', project_id: p2, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(-4), priority: 'high', status: 'in_progress', progress: 55 });

  // --- Проект 3: Ребрендинг сайта ---
  addTask({ title: 'Разработка нового логотипа', project_id: p3, creator_id: managerId, assignee_id: zhannaId, deadline: daysFromNow(-6), priority: 'medium', status: 'done', progress: 100, overdue_reason_id: rResources, closed_at: daysFromNow(-3) });
  const t17 = addTask({ title: 'Обновление гайдлайна бренда', project_id: p3, creator_id: managerId, assignee_id: zhannaId, deadline: daysFromNow(-3), priority: 'medium', status: 'in_progress', progress: 90 });
  const t18 = addTask({ title: 'Редизайн главной страницы', project_id: p3, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(2), priority: 'high', status: 'in_progress', progress: 35 });
  const t19 = addTask({ title: 'Вёрстка адаптивных страниц', project_id: p3, creator_id: managerId, assignee_id: erlanId, deadline: daysFromNow(4), priority: 'medium', status: 'new', progress: 0 });
  addTask({ title: 'SEO-аудит после редизайна', project_id: p3, creator_id: managerId, assignee_id: sauleId, deadline: daysFromNow(12), priority: 'low', status: 'new', progress: 0 });
  const t21 = addTask({ title: 'Согласование ребрендинга с юр. отделом', project_id: p3, creator_id: managerId, assignee_id: daniyarId, deadline: daysFromNow(-1), priority: 'high', status: 'in_progress', progress: 20 });
  addTask({ title: 'Обновление визиток и мерча', project_id: p3, creator_id: managerId, assignee_id: zhannaId, deadline: daysFromNow(6), priority: 'low', status: 'new', progress: 0 });
  addTask({ title: 'A/B тест нового баннера', project_id: p3, creator_id: managerId, assignee_id: erlanId, deadline: daysFromNow(1), priority: 'medium', status: 'review', progress: 95 });
  addTask({ title: 'Публикация пресс-релиза о ребрендинге', project_id: p3, creator_id: managerId, assignee_id: sauleId, deadline: daysFromNow(9), priority: 'medium', status: 'new', progress: 0, postpone_status: 'requested', postpone_reason: 'Ждём финального одобрения от PR-агентства', postpone_new_deadline: daysFromNow(14) });

  const insertDep = db.prepare(`INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`);
  insertDep.run(t2, t1);
  insertDep.run(t3, t2);
  insertDep.run(t18, t17);
  insertDep.run(t19, t18);

  const insertComment = db.prepare(`INSERT INTO comments (task_id, author_id, text, created_at) VALUES (?, ?, ?, ?)`);
  insertComment.run(t3, erlanId, 'Начал прогон сценариев, нашёл баг на переводе между валютами. @Данияр Ахметов, нужна твоя API-часть для повторного теста.', daysFromNow(-1));
  const c2 = insertComment.run(t18, daniyarId, 'Приложил новый макет главной страницы на согласование. @Айгуль Сатпаева, посмотрите, пожалуйста.', hoursFromNow(-20)).lastInsertRowid;
  db.prepare(`INSERT INTO attachments (comment_id, filename, filepath) VALUES (?, ?, ?)`).run(c2, 'main-page-redesign-v2.png', '/uploads/placeholder-main-page-redesign-v2.png');
  insertComment.run(t21, daniyarId, 'Юр. отдел просит ещё 2 дня на проверку формулировок в новом фирменном стиле.', hoursFromNow(-10));

  db.prepare(`INSERT INTO task_history (task_id, event_type, description, actor_id, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(t1, 'status_change', 'Статус изменён: Новая → В работе', daniyarId, daysFromNow(-9));

  // Прогоняем движок уведомлений один раз, чтобы данные сразу отражали реальное состояние
  runNotificationCheck();

  console.log('База данных заполнена демо-данными.');
}
