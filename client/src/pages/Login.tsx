import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const demoUsers = [
  { label: 'Айгуль Сатпаева — руководитель', email: 'director@taskcontrol.kz' },
  { label: 'Данияр Ахметов — исполнитель', email: 'daniyar@taskcontrol.kz' },
  { label: 'Жанна Оспанова — исполнитель', email: 'zhanna@taskcontrol.kz' },
  { label: 'Марат Жумабеков — наблюдатель', email: 'marat@client.kz' },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('director@taskcontrol.kz');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>TaskControl</h1>
        <p>Контроль исполнения задач без ручных уточнений статуса</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} required />
          </div>
          <div className="field">
            <label>Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} required />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>
        <div className="demo-users">
          Демо-пользователи (пароль: password123):
          {demoUsers.map((u) => (
            <button key={u.email} type="button" onClick={() => setEmail(u.email)}>
              {u.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
