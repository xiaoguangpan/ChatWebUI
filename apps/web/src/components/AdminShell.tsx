import { KeyRound, LogOut, Menu, Moon, Sun, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, clearAuthToken, type AuthUser } from '../api';
import { currentTheme, toggleTheme as toggleStoredTheme, type ThemeMode } from '../theme';
import { AdminSidebar } from './AdminSidebar';
import { Modal } from './Modal';

const TITLE_BY_PATH: Record<string, string> = {
  '/admin/dashboard': '仪表盘',
  '/admin/model-service': '模型服务',
  '/admin/ai-models': 'AI 对话模型',
  '/admin/image-models': '生图模型',
  '/admin/users': '用户管理',
  '/admin/generations': '生成记录',
  '/admin/points-log': '积分流水',
  '/admin/system-logs': '系统日志',
};

function resolveTitle(pathname: string): string {
  if (pathname.startsWith('/admin/users/')) return '用户详情';
  return TITLE_BY_PATH[pathname] ?? '智聊后台';
}

/**
 * 运营后台通用骨架:固定侧栏 + sticky topbar + 内容 Outlet。
 * Sidebar mask 仅在移动端可见,点击关闭抽屉。
 */
export const AdminShell: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => currentTheme());
  const location = useLocation();
  const navigate = useNavigate();
  const title = resolveTitle(location.pathname);

  const close = useCallback(() => setSidebarOpen(false), []);
  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);

  const toggleTheme = () => {
    setTheme(toggleStoredTheme());
  };

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<{ theme?: ThemeMode }>).detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener('chatwebui:theme-changed', onThemeChange);
    return () => window.removeEventListener('chatwebui:theme-changed', onThemeChange);
  }, []);

  useEffect(() => {
    apiGet<{ user: AuthUser }>('/api/auth/me')
      .then((res) => {
        if (res.user.role !== 'admin') {
          clearAuthToken('admin');
          navigate('/admin/login', { replace: true });
          return;
        }
        setUser(res.user);
        setChecked(true);
      })
      .catch(() => {
        clearAuthToken('admin');
        navigate('/admin/login', { replace: true });
      });
  }, [navigate]);

  if (!checked) {
    return <div className="admin" />;
  }

  const logout = async () => {
    await apiPost('/api/auth/logout', {}).catch(() => undefined);
    clearAuthToken('admin');
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin">
      <aside className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <AdminSidebar onNavigate={close} onLogoutRequest={() => setLogoutOpen(true)} />
      </aside>
      <div
        className={`sidebar-mask${sidebarOpen ? ' is-open' : ''}`}
        onClick={close}
        aria-hidden={!sidebarOpen}
      />

      <div className="admin-content">
        <header className="admin-topbar">
          <button
            className="c-icon-btn u-sm-only"
            type="button"
            aria-label="菜单"
            onClick={toggle}
          >
            <Menu size={20} />
          </button>
          <div>
            <div className="admin-topbar__title">{title}</div>
          </div>
          <div className="admin-topbar__actions">
            <button
              className="c-icon-btn"
              type="button"
              aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="admin-user-menu">
              <button className="admin-user-button" type="button" onClick={() => setMenuOpen((value) => !value)}>
                <span className="c-avatar c-avatar--sm">{initials(user?.name ?? 'A')}</span>
                <span className="admin-user-button__name">{user?.name ?? 'Admin'}</span>
              </button>
              {menuOpen && (
                <div className="admin-user-dropdown">
                  {user && (
                    <Link className="admin-user-dropdown__item" to={`/admin/users/${user.id}`} onClick={() => setMenuOpen(false)}>
                      <UserRound size={15} />个人中心
                    </Link>
                  )}
                  <button type="button" className="admin-user-dropdown__item" onClick={() => { setPasswordOpen(true); setMenuOpen(false); }}>
                    <KeyRound size={15} />修改密码
                  </button>
                  <button type="button" className="admin-user-dropdown__item admin-user-dropdown__item--danger" onClick={() => { setLogoutOpen(true); setMenuOpen(false); }}>
                    <LogOut size={15} />退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <Outlet />
      </div>
      <ChangeAdminPasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <Modal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="退出登录"
        footer={
          <>
            <button type="button" className="c-btn c-btn--secondary" onClick={() => setLogoutOpen(false)}>取消</button>
            <button type="button" className="c-btn c-btn--danger" onClick={logout}>确认退出</button>
          </>
        }
      >
        确认退出当前后台账号？
      </Modal>
    </div>
  );
};

const ChangeAdminPasswordModal: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      await apiPost('/api/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
        password_confirm: confirm,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setError('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="修改密码"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>保存</button>
        </>
      }
    >
      {error && <div className="c-help" style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">当前密码</label>
        <input className="c-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      </div>
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">新密码</label>
        <input className="c-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      </div>
      <div className="c-field">
        <label className="c-label">再次输入新密码</label>
        <input className="c-input" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </div>
    </Modal>
  );
};

function initials(name: string) {
  const chars = Array.from(name.trim());
  return (chars.slice(0, 2).join('') || 'A').toUpperCase();
}
