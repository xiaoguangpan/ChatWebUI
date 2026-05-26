import {
  BarChart3,
  Cpu,
  History,
  LogOut,
  Terminal,
  Users,
  Wallet,
} from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

type Group = {
  title: string;
  items: { key: string; label: string; icon: ReactNode; href: string }[];
};

const NAV: Group[] = [
  {
    title: '概览',
    items: [
      { key: 'dashboard', label: '仪表盘', icon: <BarChart3 size={18} />, href: '/admin/dashboard' },
    ],
  },
  {
    title: '模型管理',
    items: [
      { key: 'model-service', label: '模型服务', icon: <Cpu size={18} />, href: '/admin/model-service' },
    ],
  },
  {
    title: '用户与积分',
    items: [
      { key: 'users', label: '用户管理', icon: <Users size={18} />, href: '/admin/users' },
      { key: 'points-log', label: '积分流水', icon: <Wallet size={18} />, href: '/admin/points-log' },
    ],
  },
  {
    title: '记录与日志',
    items: [
      {
        key: 'generations',
        label: '生成记录',
        icon: <History size={18} />,
        href: '/admin/generations',
      },
      {
        key: 'system-logs',
        label: '系统日志',
        icon: <Terminal size={18} />,
        href: '/admin/system-logs',
      },
    ],
  },
];

type Props = {
  onNavigate?: () => void;
  onLogoutRequest?: () => void;
};

export const AdminSidebar: FC<Props> = ({ onNavigate, onLogoutRequest }) => {
  const onLogout = () => {
    onNavigate?.();
    onLogoutRequest?.();
  };

  return (
    <>
      <div className="admin-brand">
        <span className="logo">A</span>
        <div>
          <div className="admin-brand__name">ChatWebUI 后台</div>
          <div className="admin-brand__sub">v 1.0.0</div>
        </div>
      </div>
      <nav className="admin-nav">
        {NAV.map((group) => (
          <div key={group.title} className="admin-nav__group">
            <div className="admin-nav__title">{group.title}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.key}
                to={item.href}
                className={({ isActive }) => `admin-nav__item${isActive ? ' is-active' : ''}`}
                onClick={onNavigate}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-sidebar-footer">
        <button
          type="button"
          className="admin-nav__item"
          onClick={onLogout}
          style={{ color: 'var(--text-secondary)' }}
        >
          <LogOut size={18} />退出登录
        </button>
      </div>
    </>
  );
};
