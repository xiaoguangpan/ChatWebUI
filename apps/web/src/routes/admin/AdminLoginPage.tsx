import type { FC, FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost, setAuthToken, type AuthResponse } from '../../api';
import { AuthShell } from '../../components/AuthShell';

export const AdminLoginPage: FC = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiPost<AuthResponse>('/api/auth/login', { phone: account, password });
      if (res.user.role !== 'admin') {
        throw new Error('当前账号不是管理员');
      }
      setAuthToken(res.token, 'admin');
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell logo="A" logoBg="var(--brand)" title="管理员登录" subtitle="ChatWebUI 运营后台">
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="c-field">
          <label className="c-label">账号</label>
          <input
            className="c-input c-input--lg"
            type="text"
            placeholder="管理员账号"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            required
          />
        </div>
        <div className="c-field">
          <label className="c-label">密码</label>
          <input
            className="c-input c-input--lg"
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && <div className="c-help" style={{ color: 'var(--danger)' }}>{error}</div>}

        <button
          type="submit"
          className="c-btn c-btn--primary c-btn--lg c-btn--block"
          style={{ marginTop: 8 }}
          disabled={loading}
        >
          {loading ? '登录中...' : '登录后台'}
        </button>

        <p className="auth-form__footer">
          仅管理员账号可登录。<Link to="/?auth=login">返回用户端</Link>
        </p>
      </form>
    </AuthShell>
  );
};
