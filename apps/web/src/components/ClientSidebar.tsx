import { Image as ImageIcon, PanelLeft, Search, SquarePen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, getAuthToken, type ApiConversation, type ApiGeneration, type AuthUser } from '../api';
import { useSearchModal } from './SearchModal';

type Props = {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

/**
 * 用户端侧栏。布局使用 .app-sidebar / .sidebar-* 样式,
 * 用 react-router 的 NavLink 自动处理 is-active。
 */
export const ClientSidebar: FC<Props> = ({ isOpen, onToggle, onClose }) => {
  const search = useSearchModal();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [generations, setGenerations] = useState<ApiGeneration[]>([]);

  const reloadConversations = useCallback(() => {
    if (!getAuthToken('client')) {
      setConversations([]);
      return;
    }
    apiGet<{ conversations: ApiConversation[] }>('/api/conversations')
      .then((res) => setConversations(res.conversations))
      .catch(() => setConversations([]));
  }, []);

  const reloadGenerations = useCallback(() => {
    if (!getAuthToken('client')) {
      setGenerations([]);
      return;
    }
    apiGet<{ generations: ApiGeneration[] }>('/api/me/generations')
      .then((res) => setGenerations(res.generations.filter((item) => item.type === 'image')))
      .catch(() => setGenerations([]));
  }, []);

  useEffect(() => {
    if (getAuthToken('client')) {
      apiGet<{ user: AuthUser }>('/api/me')
        .then((res) => setUser(res.user))
        .catch(() => undefined);
    } else {
      setUser(null);
    }
    reloadConversations();
    reloadGenerations();
  }, [reloadConversations, reloadGenerations]);

  useEffect(() => {
    const reload = () => {
      if (getAuthToken('client')) {
        apiGet<{ user: AuthUser }>('/api/me')
          .then((res) => setUser(res.user))
          .catch(() => setUser(null));
      } else {
        setUser(null);
      }
      reloadConversations();
      reloadGenerations();
    };
    window.addEventListener('chatwebui:conversations-changed', reload);
    window.addEventListener('chatwebui:generations-changed', reload);
    window.addEventListener('chatwebui:auth-changed', reload);
    return () => {
      window.removeEventListener('chatwebui:conversations-changed', reload);
      window.removeEventListener('chatwebui:generations-changed', reload);
      window.removeEventListener('chatwebui:auth-changed', reload);
    };
  }, [reloadConversations, reloadGenerations]);

  const recentItems = buildRecentItems(conversations, generations);

  const requestNewChat = () => {
    window.dispatchEvent(new CustomEvent('chatwebui:new-chat'));
    onClose();
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm('确认删除这条聊天记录？删除后不可恢复。')) return;
    await apiDelete(`/api/conversations/${id}`);
    setConversations((prev) => prev.filter((item) => item.id !== id));
    window.dispatchEvent(new CustomEvent('chatwebui:conversations-changed'));
    if (location.pathname === `/c/${id}`) {
      navigate('/', { replace: true });
    }
  };

  const deleteGeneration = async (id: string) => {
    if (!window.confirm('确认删除这条生图记录？删除后不可恢复。')) return;
    await apiDelete(`/api/me/generations/${id}`);
    setGenerations((prev) => prev.filter((item) => item.id !== id));
    window.dispatchEvent(new CustomEvent('chatwebui:generations-changed'));
    if (location.pathname === `/image/${id}`) {
      navigate('/image', { replace: true });
    }
  };

  return (
    <aside className={`app-sidebar${isOpen ? ' is-open' : ''}`}>
      <div className="sidebar-header">
        <Link to="/" className="sidebar-brand">
          <span className="logo">C</span>
          <span className="name">ChatWebUI</span>
        </Link>
        <button className="c-icon-btn" type="button" aria-label="收起侧栏" onClick={onToggle}>
          <PanelLeft size={20} />
        </button>
      </div>

      <div className="sidebar-content">
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `sidebar-item${isActive ? ' is-active' : ''}`}
            onClick={requestNewChat}
          >
            <SquarePen size={18} />新聊天
          </NavLink>
          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              search.open();
              onClose();
            }}
          >
            <Search size={18} />搜索聊天
          </button>
          <NavLink
            to="/image"
            className={({ isActive }) => `sidebar-item${isActive ? ' is-active' : ''}`}
            onClick={onClose}
          >
            <ImageIcon size={18} />生成图片
          </NavLink>
        </nav>

        <div className="sidebar-section">最近</div>
        <div className="sidebar-history">
          {recentItems.map((item) => item.kind === 'chat' ? (
            <div className="sidebar-history-row" key={item.id}>
              <NavLink
                to={`/c/${item.id}`}
                className={({ isActive }) => `sidebar-history-item${isActive ? ' is-active' : ''}`}
                onClick={onClose}
              >
                <span className="sidebar-history-item__title">{item.title}</span>
              </NavLink>
              <button
                type="button"
                className="sidebar-history-delete"
                aria-label="删除聊天记录"
                onClick={() => deleteConversation(item.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <div className="sidebar-history-row" key={item.id}>
              <NavLink
                to={`/image/${item.id}`}
                className={({ isActive }) => `sidebar-history-item sidebar-history-item--image${isActive ? ' is-active' : ''}`}
                onClick={onClose}
              >
                <ImageIcon size={14} />
                <span className="sidebar-history-item__title">{item.title}</span>
              </NavLink>
              <button
                type="button"
                className="sidebar-history-delete"
                aria-label="删除生图记录"
                onClick={() => deleteGeneration(item.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            isActive ? 'sidebar-user is-active-user' : 'sidebar-user'
          }
          onClick={onClose}
        >
          <span className="c-avatar">{initials(user?.name ?? user?.phone ?? 'U')}</span>
          <div className="u-flex-1">
            <div className="sidebar-user__name">{user?.name ?? '未登录'}</div>
            <div className="sidebar-user__plan">
              {user ? `${user.plan} · ${user.points.toLocaleString()} 积分` : '请登录'}
            </div>
          </div>
        </NavLink>
      </div>
    </aside>
  );
};

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || 'U';
}

type RecentItem =
  | { kind: 'chat'; id: string; title: string; time: string }
  | { kind: 'image'; id: string; title: string; time: string };

function buildRecentItems(conversations: ApiConversation[], generations: ApiGeneration[]): RecentItem[] {
  return [
    ...conversations.map((item) => ({ kind: 'chat' as const, id: item.id, title: item.title, time: item.updated_at })),
    ...generations.map((item) => ({
      kind: 'image' as const,
      id: item.id,
      title: truncateTitle(item.prompt_markdown || '图片生成'),
      time: item.created_at,
    })),
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

function truncateTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim();
  return title.length > 24 ? `${title.slice(0, 24)}...` : title || '图片生成';
}
