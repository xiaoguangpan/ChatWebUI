import { ChevronLeft, ChevronRight, Download, Search, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { apiGet } from '../../api';
import { downloadCsv } from '../../csv';

type LogType = 'recharge' | 'consume' | 'reward' | 'admin' | 'refund';
type TypeFilter = LogType | 'all';
type RangeFilter = 'all' | 'today' | '7d' | '30d';

type Row = {
  id: string;
  user: { name: string; avatar: string; color?: string };
  type: LogType;
  amount: number;
  balance: number;
  sourceType: string;
  ref?: string;
  remark: string;
  time: string;
  createdAt: string;
};

type ApiPointsLog = {
  id: string;
  user_name: string;
  type: LogType;
  amount: number;
  balance_after: number;
  source_type: string;
  source_id: string;
  remark: string;
  created_at: string;
};

function typeBadge(t: LogType): ReactNode {
  switch (t) {
    case 'recharge':
      return <span className="c-badge c-badge--success">充值</span>;
    case 'consume':
      return <span className="c-badge c-badge--danger">消耗</span>;
    case 'reward':
      return <span className="c-badge c-badge--info">奖励</span>;
    case 'admin':
      return <span className="c-badge c-badge--warning">管理调整</span>;
    case 'refund':
      return <span className="c-badge">退款</span>;
  }
}

export const PointsLogPage: FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');

  const filteredRows = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const since = rangeSince(rangeFilter);
    return rows.filter((row) => {
      const byKeyword =
        !k ||
        row.id.toLowerCase().includes(k) ||
        row.user.name.toLowerCase().includes(k) ||
        row.sourceType.toLowerCase().includes(k) ||
        (row.ref ?? '').toLowerCase().includes(k) ||
        row.remark.toLowerCase().includes(k);
      const byType = typeFilter === 'all' || row.type === typeFilter;
      const createdAt = new Date(row.createdAt);
      const byRange = !since || (!Number.isNaN(createdAt.getTime()) && createdAt >= since);
      return byKeyword && byType && byRange;
    });
  }, [keyword, rangeFilter, rows, typeFilter]);

  const added = filteredRows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const consumed = filteredRows.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0);

  useEffect(() => {
    apiGet<{ logs: ApiPointsLog[] }>('/api/admin/points-log')
      .then((res) => {
        setRows(res.logs.map(pointsLogFromApi));
      })
      .catch(() => undefined);
  }, []);

  const exportRows = () => {
    downloadCsv(
      `points-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ['流水ID', '用户', '类型', '变动', '余额', '关联ID', '备注', '时间'],
      filteredRows.map((row) => [row.id, row.user.name, row.type, row.amount, row.balance, row.ref, row.remark, row.time]),
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">积分流水</h1>
          <div className="admin-page__subtitle">系统所有积分变动记录</div>
        </div>
        <button type="button" className="c-btn c-btn--secondary" onClick={exportRows}>
          <Download size={16} />导出
        </button>
      </div>

      <div className="stat-grid">
        {[
          { label: '累计新增积分', value: `+${added.toLocaleString()}`, delta: '当前列表内的奖励、充值、补偿', trend: undefined },
          { label: '累计消耗积分', value: consumed.toLocaleString(), delta: '当前列表内的对话、生图、语音', trend: undefined },
          { label: '有流水账户', value: String(new Set(filteredRows.map((row) => row.user.name)).size), delta: '当前列表内有积分变动', trend: undefined },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-card__label">{s.label}</div>
            <div className="stat-card__num">{s.value}</div>
            <div className={`stat-card__delta${s.trend ? ` stat-card__delta--${s.trend}` : ''}`}>
              {s.trend === 'up' && <TrendingUp size={12} />}
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="toolbar__left">
          <div className="c-search">
            <span className="icon-search">
              <Search size={16} />
            </span>
            <input
              className="c-input"
              placeholder="用户、流水号、关联 ID、备注..."
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <select className="c-select" style={{ width: 140 }} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
            <option value="all">全部类型</option>
            <option value="recharge">充值</option>
            <option value="consume">消耗</option>
            <option value="reward">奖励</option>
            <option value="admin">管理员调整</option>
            <option value="refund">退款</option>
          </select>
          <select className="c-select" style={{ width: 140 }} value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value as RangeFilter)}>
            <option value="all">全部时间</option>
            <option value="today">今日</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
        </div>
      </div>

      <div className="c-table-wrap">
        <table className="c-table">
          <thead>
            <tr>
              <th>流水号</th>
              <th>用户</th>
              <th>类型</th>
              <th>变动</th>
              <th>余额</th>
              <th>关联</th>
              <th>备注</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.id}</code>
                </td>
                <td>
                  <div className="user-cell">
                    <span
                      className="c-avatar c-avatar--sm"
                      style={r.user.color ? { background: r.user.color } : undefined}
                    >
                      {r.user.avatar}
                    </span>
                    {r.user.name}
                  </div>
                </td>
                <td>{typeBadge(r.type)}</td>
                <td>
                  <strong className={r.amount > 0 ? 'points-amount--up' : 'points-amount--down'}>
                    {r.amount > 0 ? `+${r.amount.toLocaleString()}` : r.amount.toLocaleString()}
                  </strong>
                </td>
                <td>{r.balance.toLocaleString()}</td>
                <td>{r.ref ? <code>{r.ref}</code> : '—'}</td>
                <td>{r.remark}</td>
                <td className="u-caption">{r.time}</td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                  暂无匹配的积分流水
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="c-pagination">
          <span
            className="u-caption"
            style={{ marginRight: 'auto', paddingLeft: 8 }}
          >
            共 {filteredRows.length.toLocaleString()} 条
          </span>
          <button type="button" className="c-page-btn" disabled>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="c-page-btn is-active">1</button>
          <button type="button" className="c-page-btn" disabled>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

function pointsLogFromApi(log: ApiPointsLog): Row {
  return {
    id: log.id,
    user: { name: log.user_name, avatar: initials(log.user_name) },
    type: log.type,
    amount: log.amount,
    balance: log.balance_after,
    sourceType: log.source_type,
    ref: log.source_id,
    remark: log.remark,
    time: shortTime(log.created_at),
    createdAt: log.created_at,
  };
}

function initials(name: string) {
  const chars = name.trim().split(/\s+/).map((part) => part[0]).join('');
  return (chars || 'U').slice(0, 2).toUpperCase();
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function rangeSince(range: RangeFilter) {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
