import {
  ChevronRight,
  FileText,
  HelpCircle,
  History,
  Lock,
  LogOut,
  Menu,
  Moon,
  User,
} from 'lucide-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { apiGet, apiPost, assetUrl, clearAuthToken, type AuthUser } from '../api';
import type { ClientOutletCtx } from '../components/ClientShell';
import { Modal } from '../components/Modal';
import { currentTheme, toggleTheme as toggleStoredTheme, type ThemeMode } from '../theme';

export const ProfilePage: FC = () => {
  const { openSidebar } = useOutletContext<ClientOutletCtx>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => currentTheme());

  useEffect(() => {
    apiGet<{ user: AuthUser }>('/api/me')
      .then((res) => setUser(res.user))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<{ theme?: ThemeMode }>).detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener('chatwebui:theme-changed', onThemeChange);
    return () => window.removeEventListener('chatwebui:theme-changed', onThemeChange);
  }, []);

  const toggleTheme = () => setTheme(toggleStoredTheme());

  const logout = async () => {
    await apiPost('/api/auth/logout', {}).catch(() => undefined);
    clearAuthToken('client');
    window.dispatchEvent(new CustomEvent('chatwebui:auth-changed'));
    setLogoutOpen(false);
    navigate('/?auth=login');
  };

  return (
    <>
      <header className="app-topbar">
        <button className="c-icon-btn" type="button" aria-label="菜单" onClick={openSidebar}>
          <Menu size={20} />
        </button>
        <span className="app-topbar__title">我的</span>
        <div className="app-topbar__actions" />
      </header>

      <div className="page">
        <div className="page__inner">
          <ProfileHeader user={user} />
          <PointsCard user={user} />

          <div className="profile-stat-grid">
            <SmallStat label="总对话" value={String(user?.chats ?? 0)} />
            <SmallStat label="生成图片" value={String(user?.images ?? 0)} />
            <SmallStat label="当前方案" value={user?.plan ?? '-'} />
          </div>

          <ListGroup title="账户">
            <ListItem icon={<User size={18} />} title="个人资料" desc="头像、昵称、账号" chevron to="/profile/info" />
            <ListItem icon={<Lock size={18} />} title="安全" desc="密码与登录状态" chevron to="/profile/security" />
          </ListGroup>

          <ListGroup title="偏好">
            <ListItem
              icon={<Moon size={18} />}
              title="深色模式"
              desc="使用暗色界面"
              right={
                <label className="c-switch">
                  <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
                  <span className="c-switch__slider" />
                </label>
              }
            />
          </ListGroup>

          <ListGroup title="支持">
            <ListItem icon={<HelpCircle size={18} />} title="帮助中心" chevron to="/help" />
            <ListItem icon={<FileText size={18} />} title="服务条款" chevron to="/terms" />
            <ListItem icon={<LogOut size={18} />} title={<span style={{ color: 'var(--danger)' }}>退出登录</span>} onClick={() => setLogoutOpen(true)} />
          </ListGroup>

          <div className="u-text-center u-caption" style={{ padding: '24px 0' }}>
            版本 1.0.0 · ChatWebUI
          </div>
        </div>
      </div>

      <Modal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="确认退出"
        footer={
          <>
            <button type="button" className="c-btn c-btn--secondary" onClick={() => setLogoutOpen(false)}>
              取消
            </button>
            <button type="button" className="c-btn c-btn--danger" onClick={logout}>
              退出登录
            </button>
          </>
        }
      >
        退出后需要重新登录才能继续使用。
      </Modal>

    </>
  );
};

const ProfileHeader: FC<{ user: AuthUser | null }> = ({ user }) => (
  <section className="profile-header">
    <span className="c-avatar c-avatar--xl">
      {assetUrl(user?.avatar_url) ? <img src={assetUrl(user?.avatar_url)} alt={user?.name ?? 'avatar'} /> : initials(user?.name ?? user?.phone ?? 'U')}
    </span>
    <div className="u-flex-1">
      <div className="profile-header__name">{user?.name ?? '未登录'}</div>
      <div className="profile-header__email">{user?.phone ?? '-'}</div>
      <div style={{ marginTop: 8 }}>
        <span className="c-badge c-badge--brand">
          <span className="dot" />
          {user?.plan ?? 'free'}
        </span>
      </div>
    </div>
  </section>
);

const PointsCard: FC<{ user: AuthUser | null }> = ({ user }) => (
  <section className="points-card">
    <div className="points-card__label">当前积分</div>
    <div className="points-card__num">{(user?.points ?? 0).toLocaleString()}</div>
    <div className="points-card__row">
      <span>积分由后台策略实时扣减</span>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <Link to="/points" className="c-btn c-btn--secondary c-btn--sm points-card__action">
        <History size={14} />
        积分流水
      </Link>
    </div>
  </section>
);

const SmallStat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="c-card profile-stat">
    <div className="u-caption">{label}</div>
    <div className="profile-stat__value">{value}</div>
  </div>
);

const ListGroup: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className="list-group">
    <div className="list-group__title">{title}</div>
    {children}
  </div>
);

type ListItemProps = {
  icon: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  chevron?: boolean;
  right?: ReactNode;
  to?: string;
  onClick?: () => void;
};

const ListItem: FC<ListItemProps> = ({ icon, title, desc, chevron, right, to, onClick }) => {
  const body = (
    <>
      <span className="list-item__icon">{icon}</span>
      <div className="list-item__body">
        <div className="list-item__title">{title}</div>
        {desc && <div className="list-item__desc">{desc}</div>}
      </div>
      {right}
      {chevron && (
        <span className="list-item__chev">
          <ChevronRight size={18} />
        </span>
      )}
    </>
  );

  if (to) return <Link to={to} className="list-item">{body}</Link>;
  if (onClick) return <button type="button" className="list-item list-item--button" onClick={onClick}>{body}</button>;
  return <div className="list-item">{body}</div>;
};

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || 'U';
}
