import {
  Coins,
  Image as ImageIcon,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api';
import { DonutChart } from '../../components/charts/DonutChart';
import { TrendLineChart } from '../../components/charts/TrendLineChart';

type DashboardGeneration = {
  id: string;
  user_name: string;
  type: string;
  model_name: string;
  points_cost: number;
  created_at: string;
};

type DashboardResponse = {
  summary: {
    users: number;
    conversations: number;
    images: number;
    points: number;
  };
  trend: number[];
  model_usage: Record<string, number>;
  recent: DashboardGeneration[];
  system: Record<string, unknown>;
};

const STATS = [
  {
    label: '总用户数',
    icon: <Users size={14} />,
    value: '0',
    delta: '等待后端数据',
    trend: 'up' as const,
  },
  {
    label: '总对话数',
    icon: <MessageSquare size={14} />,
    value: '0',
    delta: '等待后端数据',
    trend: 'up' as const,
  },
  {
    label: '生成图片',
    icon: <ImageIcon size={14} />,
    value: '0',
    delta: '等待后端数据',
    trend: 'up' as const,
  },
  {
    label: '积分消耗',
    icon: <Coins size={14} />,
    value: '0',
    delta: '等待后端数据',
    trend: 'down' as const,
  },
];

const TREND: number[] = [];
const TREND_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const PIE_DATA: { value: number; color: string; label: string }[] = [];

const RECENT: { user: string; avatar: string; color: string; type: string; model: string; cost: string; time: string }[] = [];

const SYSTEM_BARS = [
  { label: 'API 平均响应', value: '等待后端数据', percent: 0, color: 'var(--success)' },
  { label: '当前模型数', value: '0', percent: 0, color: 'var(--success)' },
  { label: '数据库', value: '等待后端数据', percent: 0, color: 'var(--warning)' },
  { label: '运行模式', value: '后端 API', percent: 0, color: 'var(--success)' },
];

export const DashboardPage: FC = () => {
  const [stats, setStats] = useState(STATS);
  const [trend, setTrend] = useState(TREND);
  const [pieData, setPieData] = useState(PIE_DATA);
  const [recent, setRecent] = useState(RECENT);
  const [systemBars, setSystemBars] = useState(SYSTEM_BARS);

  const loadDashboard = useCallback(() => {
    apiGet<DashboardResponse>('/api/admin/dashboard')
      .then((data) => {
        setStats([
          {
            label: '总用户数',
            icon: <Users size={14} />,
            value: data.summary.users.toLocaleString(),
            delta: '实时统计',
            trend: 'up' as const,
          },
          {
            label: '总对话数',
            icon: <MessageSquare size={14} />,
            value: data.summary.conversations.toLocaleString(),
            delta: '实时统计',
            trend: 'up' as const,
          },
          {
            label: '生成图片',
            icon: <ImageIcon size={14} />,
            value: data.summary.images.toLocaleString(),
            delta: '实时统计',
            trend: 'up' as const,
          },
          {
            label: '积分消耗',
            icon: <Coins size={14} />,
            value: data.summary.points.toLocaleString(),
            delta: '实时统计',
            trend: 'down' as const,
          },
        ]);
        setTrend(data.trend);
        const usage = Object.entries(data.model_usage).filter(([, value]) => value > 0);
        const totalUsage = usage.reduce((sum, [, value]) => sum + value, 0) || 1;
        const colors = ['#10A37F', '#3B82F6', '#F0B72F', '#EF4444', '#8B5CF6'];
        setPieData(
          usage.map(([label, value], index) => ({
            label,
            value: Math.round((value / totalUsage) * 100),
            color: colors[index % colors.length],
          })),
        );
        setRecent(
          data.recent.slice(0, 5).map((item) => ({
            user: item.user_name,
            avatar: initials(item.user_name),
            color: '#10A37F',
            type: item.type === 'image' ? '生图' : item.type === 'tts' ? '语音' : '对话',
            model: item.model_name,
            cost: `${item.points_cost} 积分`,
            time: shortDateTime(item.created_at),
          })),
        );
        setSystemBars([
          { label: 'API 平均响应', value: String(data.system.api_latency ?? '后端 API'), percent: 38, color: 'var(--success)' },
          { label: '当前模型数', value: String(data.system.models ?? 0), percent: 28, color: 'var(--success)' },
          { label: '数据库', value: String(data.system.database ?? '等待后端数据'), percent: 62, color: 'var(--warning)' },
          { label: '运行模式', value: String(data.system.mode ?? '后端 API'), percent: 34, color: 'var(--success)' },
        ]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => loadDashboard();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadDashboard();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('chatwebui:conversations-changed', refresh);
    window.addEventListener('chatwebui:generations-changed', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('chatwebui:conversations-changed', refresh);
      window.removeEventListener('chatwebui:generations-changed', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadDashboard]);

  return (
    <div className="admin-page admin-page--dashboard">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">仪表盘</h1>
          <div className="admin-page__subtitle">运营数据 · 最近 7 天</div>
        </div>
        <select className="c-select" style={{ width: 160 }}>
          <option>最近 7 天</option>
          <option>最近 30 天</option>
          <option>本月</option>
          <option>本年</option>
        </select>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-card__label">
              {s.icon}
              {s.label}
            </div>
            <div className="stat-card__num">{s.value}</div>
            <div className={`stat-card__delta stat-card__delta--${s.trend}`}>
              {s.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-card__header">
            <div>
              <div className="chart-card__title">对话量趋势</div>
              <div className="u-caption">每日对话次数</div>
            </div>
            <span className="c-badge c-badge--info">7 日</span>
          </div>
          <TrendLineChart data={trend} labels={TREND_LABELS} height={240} />
        </div>

        <div className="chart-card">
          <div className="chart-card__header">
            <div className="chart-card__title">模型使用占比</div>
          </div>
          <DonutChart data={pieData} size={220} />
          <div className="dashboard-pie-legend">
            {pieData.map((p) => (
              <div className="dashboard-pie-legend__row" key={p.label}>
                <span>
                  <span
                    className="dashboard-pie-legend__dot"
                    style={{ background: p.color }}
                  />
                  {p.label}
                </span>
                <strong>{p.value}%</strong>
              </div>
            ))}
            {pieData.length === 0 && <div className="u-caption">暂无模型使用数据</div>}
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-card__header">
            <div className="chart-card__title">最近活动</div>
            <Link to="/admin/generations" className="u-caption">
              查看全部 →
            </Link>
          </div>
          <div className="c-table-wrap" style={{ border: 0 }}>
            <table className="c-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>类型</th>
                  <th>模型</th>
                  <th>消耗</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <div className="user-cell">
                        <span className="c-avatar c-avatar--sm" style={{ background: r.color }}>
                          {r.avatar}
                        </span>
                        <span className="user-cell__name">{r.user}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`c-badge ${r.type === '生图' ? 'c-badge--info' : 'c-badge--brand'}`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td>{r.model}</td>
                    <td>{r.cost}</td>
                    <td className="u-caption">{r.time}</td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                      暂无最近活动
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card__header">
            <div className="chart-card__title">系统状态</div>
            <span className="c-badge c-badge--success">
              <span className="dot" />正常
            </span>
          </div>
          <ul className="dashboard-system-list">
            {systemBars.map((b) => (
              <li key={b.label}>
                <ProgressRow label={b.label} value={b.value} percent={b.percent} color={b.color} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const ProgressRow: FC<{ label: string; value: ReactNode; percent: number; color: string }> = ({
  label,
  value,
  percent,
  color,
}) => (
  <>
    <div className="dashboard-system-list__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
    <div className="dashboard-progress">
      <div
        className="dashboard-progress__bar"
        style={{ width: `${percent}%`, background: color }}
      />
    </div>
  </>
);

function initials(name: string) {
  const chars = name.trim().split(/\s+/).map((part) => part[0]).join('');
  return (chars || 'U').slice(0, 2).toUpperCase();
}

function shortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
