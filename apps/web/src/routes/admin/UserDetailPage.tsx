import { AlertTriangle, ChevronLeft, Copy, Edit2, KeyRound, MessageSquare, ThumbsDown, ThumbsUp, Volume2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost, speakText, type ApiConversation } from '../../api';
import { MarkdownText } from '../../MarkdownText';
import { Modal } from '../../components/Modal';
import { Tabs } from '../../components/Tabs';
import { PlanChangeModal, PointsAdjustModal, userFromApi, type ApiUser, type UserRow } from './UsersPage';

type DetailTab = 'overview' | 'chat' | 'generation' | 'login';

type ApiGeneration = {
  id: string;
  user_id: string;
  user_name: string;
  type: 'chat' | 'image' | 'tts';
  model_id: string;
  model_name: string;
  provider_name: string;
  prompt_markdown: string;
  response_markdown?: string;
  image_urls?: string[];
  audio_format?: string;
  tokens_in?: number;
  tokens_out?: number;
  points_cost: number;
  duration_ms: number;
  status: 'ok' | 'err';
  error_message?: string;
  created_at: string;
};

type ApiPointsLog = {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  source_type: string;
  source_id: string;
  remark: string;
  created_at: string;
};

type ApiLoginHistory = {
  id: string;
  account: string;
  ip: string;
  user_agent: string;
  status: string;
  message: string;
  created_at: string;
};

type ApiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content_markdown: string;
  model_id?: string;
  provider_id?: string;
  points_cost?: number;
  created_at: string;
};

type UserDetailPayload = {
  user: ApiUser;
  conversations: ApiConversation[];
  generations: ApiGeneration[];
  points_logs: ApiPointsLog[];
  login_history: ApiLoginHistory[];
};

const TABS: Array<{ value: DetailTab; label: string }> = [
  { value: 'overview', label: '概览' },
  { value: 'chat', label: '对话记录' },
  { value: 'generation', label: '生成记录' },
  { value: 'login', label: '登录历史' },
];

export const UserDetailPage: FC = () => {
  const { id } = useParams();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [pointsOpen, setPointsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [user, setUser] = useState<UserRow | null>(null);
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [generations, setGenerations] = useState<ApiGeneration[]>([]);
  const [pointsLogs, setPointsLogs] = useState<ApiPointsLog[]>([]);
  const [loginHistory, setLoginHistory] = useState<ApiLoginHistory[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ApiConversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ApiMessage[]>([]);
  const [conversationMessageError, setConversationMessageError] = useState('');
  const [syncError, setSyncError] = useState('');

  const reloadUser = () => {
    if (!id) return;
    apiGet<UserDetailPayload>(`/api/admin/users/${id}/detail`)
      .then((res) => {
        setUser(userFromApi(res.user));
        setConversations(res.conversations);
        setGenerations(res.generations);
        setPointsLogs(res.points_logs);
        setLoginHistory(res.login_history);
        setSyncError('');
      })
      .catch((err) => setSyncError(err instanceof Error ? err.message : '用户详情加载失败'));
  };

  useEffect(() => {
    reloadUser();
  }, [id]);

  const isBanned = user?.state === 'banned';

  const chatGenerations = useMemo(() => generations.filter((item) => item.type === 'chat'), [generations]);
  const nonChatGenerations = useMemo(() => generations.filter((item) => item.type !== 'chat'), [generations]);

  const openConversation = (conversation: ApiConversation) => {
    if (!id) return;
    setSelectedConversation(conversation);
    setConversationMessages([]);
    setConversationMessageError('');
    apiGet<{ messages: ApiMessage[] }>(`/api/admin/users/${id}/conversations/${conversation.id}/messages`)
      .then((res) => setConversationMessages(res.messages))
      .catch((err) => setConversationMessageError(err instanceof Error ? err.message : '对话内容加载失败'));
  };

  const submitBanToggle = async () => {
    if (!user) return;
    await apiPost(`/api/admin/users/${user.id}/${isBanned ? 'unban' : 'ban'}`, {}).catch((err) => {
      setSyncError(err instanceof Error ? err.message : '账号状态保存失败');
    });
    reloadUser();
    setBanOpen(false);
  };

  if (!user) {
    return (
      <div className="admin-page">
        <div className="admin-page__header">
          <div>
            <Link to="/admin/users" className="u-caption admin-page__back">
              <ChevronLeft size={14} />返回用户列表
            </Link>
            <h1 className="admin-page__title" style={{ marginTop: 4 }}>用户详情</h1>
            {syncError && <div className="admin-page__subtitle">{syncError}</div>}
          </div>
        </div>
        <div className="c-card">
          <div className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
            {syncError ? '暂无用户数据' : '正在加载用户详情...'}
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { label: '总对话', value: user.chats.toLocaleString() },
    { label: '总生图', value: user.images.toLocaleString() },
    { label: '当前积分', value: user.points.toLocaleString() },
    { label: '账号状态', value: isBanned ? '已封禁' : '正常' },
  ];

  return (
    <div className="admin-page admin-page--fill">
      <div className="admin-page__header">
        <div>
          <Link to="/admin/users" className="u-caption admin-page__back">
            <ChevronLeft size={14} />返回用户列表
          </Link>
          <h1 className="admin-page__title" style={{ marginTop: 4 }}>{user.name}</h1>
          {syncError && <div className="admin-page__subtitle">{syncError}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="c-btn c-btn--secondary" onClick={() => setResetOpen(true)}>
            <KeyRound size={14} />重置密码
          </button>
          <button type="button" className="c-btn c-btn--primary" onClick={() => setPlanOpen(true)}>
            <Zap size={14} />变更会员级别
          </button>
          <button type="button" className="c-btn c-btn--danger" onClick={() => setBanOpen(true)}>
            <AlertTriangle size={14} />{isBanned ? '解除封禁' : '封禁账号'}
          </button>
        </div>
      </div>

      <div className="detail-grid detail-grid--fill">
        <div>
          <div className="c-card user-detail-card">
            <div className="user-detail-card__head">
              <span className="c-avatar c-avatar--xl" style={{ background: user.color }}>{user.initials}</span>
              <div className="user-detail-card__name">
                <div className="user-detail-card__title">{user.name}</div>
                <div className="u-caption">{user.email}</div>
              </div>
              <span className="c-badge c-badge--brand">
                <span className="dot" />{user.role === 'plus' ? 'Plus 会员' : '普通用户'}
              </span>
            </div>
            <hr className="user-detail-card__divider" />
            <ul className="user-detail-meta">
              <Meta k="用户 ID" v={user.id} mono />
              <Meta k="账号" v={user.email} />
              <Meta k="注册时间" v={user.registeredAt} />
              <Meta k="最近活跃" v={user.lastActive} />
            </ul>
          </div>

          <div className="c-card">
            <div className="c-card__header">
              <h3 className="c-card__title">积分</h3>
              <button type="button" className="c-btn c-btn--ghost c-btn--sm" onClick={() => setPointsOpen(true)}>
                <Edit2 size={14} />调整
              </button>
            </div>
            <div className="user-detail-points">{user.points.toLocaleString()}</div>
            <div className="u-caption">最近活动使用积分流水展示，避免重复维护两套记录。</div>
          </div>
        </div>

        <div className="admin-panel-stack">
          <Tabs items={TABS} value={tab} onChange={(value) => setTab(value as DetailTab)} className="user-detail-tabs" />

          <div className="stat-grid user-detail-stats">
            {stats.map((s) => (
              <div className="stat-card" key={s.label}>
                <div className="stat-card__label">{s.label}</div>
                <div className="stat-card__num user-detail-stats__num">{s.value}</div>
              </div>
            ))}
          </div>

          {tab === 'overview' && (
            <TableCard title="最近活动">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>变动</th>
                  <th>余额</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {pointsLogs.map((item) => (
                  <tr key={item.id}>
                    <td className="u-caption">{formatDate(item.created_at)}</td>
                    <td>{pointsTypeLabel(item.type)}</td>
                    <td className={item.amount >= 0 ? 'points-amount--up' : 'points-amount--down'}>
                      {item.amount >= 0 ? `+${item.amount}` : item.amount}
                    </td>
                    <td>{item.balance_after.toLocaleString()}</td>
                    <td>{item.remark || item.source_type}</td>
                  </tr>
                ))}
                {pointsLogs.length === 0 && <EmptyRow colSpan={5} text="暂无积分流水" />}
              </tbody>
            </TableCard>
          )}

          {tab === 'chat' && (
            <TableCard title="对话记录">
              <thead>
                <tr>
                  <th>会话 ID</th>
                  <th>标题</th>
                  <th>最近更新</th>
                  <th>关联生成</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.id}</code></td>
                    <td>{item.title}</td>
                    <td className="u-caption">{formatDate(item.updated_at)}</td>
                    <td>{chatGenerations.filter((gen) => gen.created_at >= item.created_at && gen.created_at <= item.updated_at).length}</td>
                    <td className="col-actions">
                      <button type="button" className="c-btn c-btn--ghost c-btn--sm" onClick={() => openConversation(item)}>
                        <MessageSquare size={14} />查看内容
                      </button>
                    </td>
                  </tr>
                ))}
                {conversations.length === 0 && <EmptyRow colSpan={5} text="暂无对话记录" />}
              </tbody>
            </TableCard>
          )}

          {tab === 'generation' && (
            <TableCard title="生成记录">
              <thead>
                <tr>
                  <th>请求 ID</th>
                  <th>类型</th>
                  <th>模型 / 供应商</th>
                  <th>消耗</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {nonChatGenerations.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.id}</code></td>
                    <td>{generationTypeLabel(item.type)}</td>
                    <td>
                      <div>{item.model_name || item.model_id}</div>
                      <div className="u-caption">{item.provider_name}</div>
                    </td>
                    <td>-{item.points_cost}</td>
                    <td>{item.status === 'ok' ? '成功' : item.error_message || '失败'}</td>
                    <td className="u-caption">{formatDate(item.created_at)}</td>
                  </tr>
                ))}
                {nonChatGenerations.length === 0 && <EmptyRow colSpan={6} text="暂无生图或语音记录" />}
              </tbody>
            </TableCard>
          )}

          {tab === 'login' && (
            <TableCard title="登录历史">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>IP</th>
                  <th>状态</th>
                  <th>设备</th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.map((item) => (
                  <tr key={item.id}>
                    <td className="u-caption">{formatDate(item.created_at)}</td>
                    <td><code>{item.ip}</code></td>
                    <td>{item.status === 'ok' ? '成功' : item.message || '失败'}</td>
                    <td className="u-caption">{item.user_agent || '-'}</td>
                  </tr>
                ))}
                {loginHistory.length === 0 && <EmptyRow colSpan={4} text="暂无登录历史" />}
              </tbody>
            </TableCard>
          )}
        </div>
      </div>

      <PointsAdjustModal open={pointsOpen} user={user} onClose={() => setPointsOpen(false)} onSaved={reloadUser} />
      <PlanChangeModal open={planOpen} user={user} onClose={() => setPlanOpen(false)} onSaved={reloadUser} />
      <ResetPasswordModal open={resetOpen} user={user} onClose={() => setResetOpen(false)} />
      <ConversationMessagesModal
        conversation={selectedConversation}
        messages={conversationMessages}
        error={conversationMessageError}
        onClose={() => setSelectedConversation(null)}
      />

      <Modal
        open={banOpen}
        onClose={() => setBanOpen(false)}
        title={isBanned ? '解除封禁' : '封禁账号'}
        footer={
          <>
            <button type="button" className="c-btn c-btn--secondary" onClick={() => setBanOpen(false)}>取消</button>
            <button type="button" className="c-btn c-btn--danger" onClick={submitBanToggle}>
              {isBanned ? '确认解除' : '确认封禁'}
            </button>
          </>
        }
      >
        {isBanned ? '解除封禁后用户可以恢复正常登录和使用。' : '封禁后用户将无法继续正常使用系统。'}
      </Modal>
    </div>
  );
};

const ConversationMessagesModal: FC<{
  conversation: ApiConversation | null;
  messages: ApiMessage[];
  error: string;
  onClose: () => void;
}> = ({ conversation, messages, error, onClose }) => (
  <Modal
    open={!!conversation}
    onClose={onClose}
    title={conversation ? `对话内容 · ${conversation.title}` : '对话内容'}
    size="lg"
    footer={<button type="button" className="c-btn c-btn--secondary" onClick={onClose}>关闭</button>}
  >
    {error && <div className="c-help" style={{ color: 'var(--danger)' }}>{error}</div>}
    <div className="admin-chat-transcript">
      {messages.map((message) => (
        <AdminConversationMessage message={message} key={message.id} />
      ))}
      {!error && messages.length === 0 && (
        <div className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
          正在加载或暂无消息
        </div>
      )}
    </div>
  </Modal>
);

const AdminConversationMessage: FC<{ message: ApiMessage }> = ({ message }) => {
  const [speaking, setSpeaking] = useState(false);
  const isUser = message.role === 'user';
  const content = message.content_markdown.trim();

  const copy = () => {
    if (!content) return;
    void navigator.clipboard?.writeText(content);
  };

  const speak = async () => {
    if (!content || speaking) return;
    setSpeaking(true);
    try {
      const res = await speakText(content);
      await new Audio(res.data_url).play();
    } finally {
      setSpeaking(false);
    }
  };

  return (
    <div className={`msg ${isUser ? 'msg--user' : 'msg--ai'} admin-chat-message`}>
      <span className={`msg__avatar ${isUser ? 'msg__avatar--user' : 'msg__avatar--ai'}`}>{isUser ? '我' : 'C'}</span>
      <div className="msg__body">
        <div className="admin-chat-message__head">
          <strong>{isUser ? '用户' : message.role === 'assistant' ? '助手' : '系统'}</strong>
          <span>{formatDate(message.created_at)}</span>
        </div>
        <div className="msg__content">
          <MarkdownText>{message.content_markdown}</MarkdownText>
        </div>
        {(message.model_id || message.provider_id || message.points_cost) && (
          <div className="msg__meta">
            {message.model_id && <span>{message.model_id}</span>}
            {message.provider_id && <span>{message.provider_id}</span>}
            {message.points_cost ? <span>-{message.points_cost} 积分</span> : null}
          </div>
        )}
        <div className="msg__actions">
          <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="复制" onClick={copy}>
            <Copy size={14} />
          </button>
          {!isUser && (
            <>
              <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="赞">
                <ThumbsUp size={14} />
              </button>
              <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="踩">
                <ThumbsDown size={14} />
              </button>
              <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="朗读" disabled={speaking} onClick={speak}>
                <Volume2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Meta: FC<{ k: string; v: string; mono?: boolean }> = ({ k, v, mono }) => (
  <li className="user-detail-meta__row">
    <span className="u-text-tertiary">{k}</span>
    <strong className={mono ? 'user-detail-meta__value user-detail-meta__value--mono' : 'user-detail-meta__value'}>{v}</strong>
  </li>
);

const TableCard: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className="c-card user-detail-recent admin-table-card">
    <div className="c-card__header">
      <h3 className="c-card__title">{title}</h3>
    </div>
    <div className="c-table-wrap c-table-wrap--fill">
      <table className="c-table">{children}</table>
    </div>
  </div>
);

const EmptyRow: FC<{ colSpan: number; text: string }> = ({ colSpan, text }) => (
  <tr>
    <td colSpan={colSpan} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
      {text}
    </td>
  </tr>
);

const ResetPasswordModal: FC<{ open: boolean; user: UserRow; onClose: () => void }> = ({ open, user, onClose }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      await apiPost(`/api/admin/users/${user.id}/reset-password`, {
        new_password: password,
        password_confirm: confirm,
      });
      setPassword('');
      setConfirm('');
      setError('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置密码失败');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="重置用户密码"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>确认重置</button>
        </>
      }
    >
      <div className="user-cell user-cell--card">
        <span className="c-avatar c-avatar--sm" style={{ background: user.color }}>{user.initials}</span>
        <span>
          <div className="user-cell__name">{user.name}</div>
          <div className="user-cell__email">{user.email}</div>
        </span>
      </div>
      {error && <div className="c-help" style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="c-field" style={{ marginBottom: 12 }}>
        <label className="c-label">新密码</label>
        <input className="c-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <div className="c-field">
        <label className="c-label">再次输入密码</label>
        <input className="c-input" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </div>
    </Modal>
  );
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pointsTypeLabel(type: string) {
  return ({ recharge: '充值', consume: '消费', reward: '奖励', admin: '管理调整', refund: '退款' } as Record<string, string>)[type] ?? type;
}

function generationTypeLabel(type: string) {
  return ({ chat: '对话', image: '生图', tts: '语音' } as Record<string, string>)[type] ?? type;
}
