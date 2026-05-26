import { ChevronLeft, ChevronRight, Coins, Download, Plus, Search, Zap } from 'lucide-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../../api';
import { Modal } from '../../components/Modal';
import { downloadCsv } from '../../csv';

type Role = 'plus' | 'normal';
type State = 'ok' | 'banned' | 'pending';

export type UserRow = {
  id: string;
  initials: string;
  color: string;
  name: string;
  email: string;
  role: Role;
  state: State;
  points: number;
  chats: number;
  images: number;
  registeredAt: string;
  lastActive: string;
};

export type ApiUser = {
  id: string;
  phone: string;
  name: string;
  role: string;
  plan: string;
  status: string;
  points: number;
  chats: number;
  images: number;
  avatar_url?: string;
  created_at: string;
  last_active: string;
};

type CreateUserPayload = {
  phone: string;
  password: string;
  name: string;
  role: string;
  plan: string;
  status: string;
  points: number;
};

function stateBadge(s: State): ReactNode {
  if (s === 'ok') return <span className="dot-state dot-state--ok">正常</span>;
  if (s === 'banned') return <span className="dot-state dot-state--err">已封禁</span>;
  return <span className="dot-state dot-state--off">未激活</span>;
}

function roleBadge(r: Role) {
  if (r === 'plus')
    return <span className="c-badge c-badge--brand">Plus</span>;
  return <span className="c-badge">普通</span>;
}

export function userFromApi(user: ApiUser): UserRow {
  return {
    id: user.id,
    initials: initials(user.name),
    color: user.role === 'admin' ? '#10A37F' : user.plan === 'plus' ? '#3B82F6' : '#64748B',
    name: user.name,
    email: user.phone,
    role: user.plan === 'plus' || user.role === 'admin' ? 'plus' : 'normal',
    state: user.status === 'active' ? 'ok' : user.status === 'banned' ? 'banned' : 'pending',
    points: user.points,
    chats: user.chats,
    images: user.images,
    registeredAt: shortDate(user.created_at),
    lastActive: shortDate(user.last_active),
  };
}

function initials(name: string) {
  const chars = name.trim().split(/\s+/).map((part) => part[0]).join('');
  return (chars || 'U').slice(0, 2).toUpperCase();
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const UsersPage: FC = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [activeUser, setActiveUser] = useState<UserRow | null>(null);

  const reloadUsers = () => {
    apiGet<{ users: ApiUser[] }>('/api/admin/users')
      .then((res) => {
        setRows(res.users.map(userFromApi));
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    reloadUsers();
  }, []);

  const exportRows = () => {
    downloadCsv(
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
      ['用户ID', '昵称', '账号', '角色', '状态', '积分', '对话数', '生图数', '注册时间', '最近活跃'],
      rows.map((row) => [
        row.id,
        row.name,
        row.email,
        row.role,
        row.state,
        row.points,
        row.chats,
        row.images,
        row.registeredAt,
        row.lastActive,
      ]),
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">用户管理</h1>
          <div className="admin-page__subtitle">共 {rows.length.toLocaleString()} 个用户 · 后端实时数据</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="c-btn c-btn--secondary" onClick={exportRows}>
            <Download size={16} />导出
          </button>
          <button
            type="button"
            className="c-btn c-btn--primary"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} />新增用户
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar__left">
          <div className="c-search">
            <span className="icon-search">
              <Search size={16} />
            </span>
            <input className="c-input" placeholder="搜索昵称、手机号、邮箱..." />
          </div>
          <select className="c-select" style={{ width: 120 }}>
            <option>全部角色</option>
            <option>普通用户</option>
            <option>Plus 会员</option>
          </select>
          <select className="c-select" style={{ width: 120 }}>
            <option>全部状态</option>
            <option>正常</option>
            <option>已封禁</option>
            <option>未激活</option>
          </select>
        </div>
      </div>

      <div className="c-table-wrap">
        <table className="c-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" />
              </th>
              <th>用户</th>
              <th>角色</th>
              <th>状态</th>
              <th>积分</th>
              <th>对话 / 生图</th>
              <th>注册时间</th>
              <th>最近活跃</th>
              <th className="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <input type="checkbox" />
                </td>
                <td>
                  <Link
                    to={`/admin/users/${u.id}`}
                    className="user-cell"
                    style={{ color: 'inherit' }}
                  >
                    <span className="c-avatar c-avatar--sm" style={{ background: u.color }}>
                      {u.initials}
                    </span>
                    <span>
                      <div className="user-cell__name">{u.name}</div>
                      <div className="user-cell__email">{u.email}</div>
                    </span>
                  </Link>
                </td>
                <td>{roleBadge(u.role)}</td>
                <td>{stateBadge(u.state)}</td>
                <td>
                  <strong>{u.points.toLocaleString()}</strong>
                </td>
                <td>
                  {u.chats} / {u.images}
                </td>
                <td className="u-caption">{u.registeredAt}</td>
                <td className="u-caption">{u.lastActive}</td>
                <td className="col-actions">
                  <button
                    type="button"
                    className="c-icon-btn c-icon-btn--sm"
                    title="调整积分"
                    onClick={() => {
                      setActiveUser(u);
                      setPointsOpen(true);
                    }}
                  >
                    <Coins size={14} />
                  </button>
                  <button
                    type="button"
                    className="c-icon-btn c-icon-btn--sm"
                    title="升级 / 降级 Plus"
                    onClick={() => {
                      setActiveUser(u);
                      setPlanOpen(true);
                    }}
                  >
                    <Zap size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                  暂无用户数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination total={rows.length} />
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新增用户"
        footer={
          <>
            <button
              type="button"
              className="c-btn c-btn--secondary"
              onClick={() => setCreateOpen(false)}
            >
              取消
            </button>
          </>
        }
      >
        <CreateUserForm
          onCreated={() => {
            setCreateOpen(false);
            reloadUsers();
          }}
        />
      </Modal>

      <PointsAdjustModal
        open={pointsOpen}
        user={activeUser}
        onClose={() => setPointsOpen(false)}
        onSaved={reloadUsers}
      />
      <PlanChangeModal open={planOpen} user={activeUser} onClose={() => setPlanOpen(false)} onSaved={reloadUsers} />
    </div>
  );
};

const Pagination: FC<{ total: number }> = ({ total }) => (
  <div className="c-pagination">
    <span
      className="u-caption"
      style={{ marginRight: 'auto', paddingLeft: 8 }}
    >
      共 {total.toLocaleString()} 条 · 第 {total > 0 ? 1 : 0}-{Math.min(total, 500)} 条
    </span>
    <button type="button" className="c-page-btn" disabled>
      <ChevronLeft size={14} />
    </button>
    <button type="button" className="c-page-btn is-active">1</button>
    <button type="button" className="c-page-btn" disabled>
      <ChevronRight size={14} />
    </button>
  </div>
);

const CreateUserForm: FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('123456');
  const [plan, setPlan] = useState<'free' | 'plus'>('free');
  const [points, setPoints] = useState('200');
  const [error, setError] = useState('');

  const submit = async () => {
    const payload: CreateUserPayload = {
      phone,
      password,
      name,
      role: 'user',
      plan,
      status: 'active',
      points: Number(points) || 0,
    };
    try {
      await apiPost<{ user: ApiUser }>('/api/admin/users', payload);
      setName('');
      setPhone('');
      setPassword('123456');
      setPlan('free');
      setPoints('200');
      setError('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建用户失败');
    }
  };

  return (
    <>
      {error && <div className="c-help" style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">昵称</label>
        <input className="c-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="用户昵称" />
      </div>
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">手机号</label>
        <input className="c-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="11 位手机号" />
      </div>
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">初始密码</label>
        <input className="c-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" />
      </div>
      <div className="form-grid form-grid--2">
        <div className="c-field">
          <label className="c-label">角色</label>
          <select className="c-select" value={plan} onChange={(event) => setPlan(event.target.value as 'free' | 'plus')}>
            <option value="free">普通用户</option>
            <option value="plus">Plus</option>
          </select>
        </div>
        <div className="c-field">
          <label className="c-label">初始积分</label>
          <input className="c-input" type="number" value={points} onChange={(event) => setPoints(event.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="c-btn c-btn--primary" onClick={submit}>
          创建
        </button>
      </div>
    </>
  );
};

export const PointsAdjustModal: FC<{ open: boolean; user?: UserRow | null; onClose: () => void; onSaved?: () => void }> = ({
  open,
  user,
  onClose,
  onSaved,
}) => {
  const [amount, setAmount] = useState('1000');
  const [remark, setRemark] = useState('客服补偿');

  const submit = async () => {
    if (!user) return;
    await apiPost(`/api/admin/users/${user.id}/adjust-points`, {
      amount: Number(amount) || 0,
      remark,
    }).catch(() => undefined);
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="调整积分"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>
            确认调整
          </button>
        </>
      }
    >
      <div className="user-cell user-cell--card">
        <span className="c-avatar c-avatar--sm" style={user ? { background: user.color } : undefined}>{user?.initials ?? 'U'}</span>
        <span>
          <div className="user-cell__name">{user?.name ?? '未选择用户'}</div>
          <div className="user-cell__email">当前积分:{(user?.points ?? 0).toLocaleString()}</div>
        </span>
      </div>
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">数量</label>
        <input className="c-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </div>
      <div className="c-field">
        <label className="c-label">备注 (将记入流水)</label>
        <textarea
          className="c-textarea"
          rows={2}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder="例如:活动奖励、客服补偿"
        />
      </div>
    </Modal>
  );
};

export const PlanChangeModal: FC<{ open: boolean; user?: UserRow | null; onClose: () => void; onSaved?: () => void }> = ({
  open,
  user,
  onClose,
  onSaved,
}) => {
  const [plan, setPlan] = useState<'plus' | 'free'>(user?.role === 'plus' ? 'plus' : 'free');

  useEffect(() => {
    setPlan(user?.role === 'plus' ? 'plus' : 'free');
  }, [user]);

  const submit = async () => {
    if (!user) return;
    await apiPost(`/api/admin/users/${user.id}/change-plan`, { plan }).catch(() => undefined);
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="会员级别变更"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>
            <Zap size={14} />确认变更
          </button>
        </>
      }
    >
      <div className="user-cell user-cell--card">
        <span className="c-avatar c-avatar--sm" style={user ? { background: user.color } : undefined}>
          {user?.initials ?? 'U'}
        </span>
        <span>
          <div className="user-cell__name">{user?.name ?? '未选择用户'}</div>
          <div className="user-cell__email">当前级别:{user?.role === 'plus' ? 'Plus' : '普通用户'}</div>
        </span>
      </div>
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">变更为</label>
        <select className="c-select" value={plan} onChange={(event) => setPlan(event.target.value as 'plus' | 'free')}>
          <option value="plus">Plus 会员</option>
          <option value="free">普通用户(降级)</option>
        </select>
      </div>
      <div className="c-field">
        <span className="c-help">当前接口仅变更会员级别；如需赠送积分，请使用积分调整。</span>
      </div>
    </Modal>
  );
};
