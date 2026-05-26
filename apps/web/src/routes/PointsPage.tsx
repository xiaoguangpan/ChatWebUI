import { Image as ImageIcon, MessageSquare, Plus, Star } from 'lucide-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { apiGet, type ApiPointsLog } from '../api';
import { SubPageHeader } from '../components/SubPageHeader';
import { Tabs } from '../components/Tabs';

type LogItem = {
  id: string;
  category: 'expense' | 'income';
  icon: ReactNode;
  title: string;
  desc: string;
  amount: number;
  group: string;
};

const TABS = [
  { value: 'all', label: '全部' },
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
];

export const PointsPage: FC = () => {
  const [tab, setTab] = useState('all');
  const [points, setPoints] = useState(0);
  const [logs, setLogs] = useState<LogItem[]>([]);

  useEffect(() => {
    apiGet<{ points: number }>('/api/me/points')
      .then((res) => setPoints(res.points))
      .catch(() => undefined);
    apiGet<{ logs: ApiPointsLog[] }>('/api/me/points/logs')
      .then((res) => setLogs(res.logs.map(logFromApi)))
      .catch(() => setLogs([]));
  }, []);

  const filtered = logs.filter((it) => {
    if (tab === 'income') return it.category === 'income';
    if (tab === 'expense') return it.category === 'expense';
    return true;
  });

  const groups = filtered.reduce<Record<string, LogItem[]>>((acc, it) => {
    (acc[it.group] ??= []).push(it);
    return acc;
  }, {});

  return (
    <>
      <SubPageHeader title="积分流水" back="/profile" />

      <div className="page">
        <div className="page__inner">
          <section className="points-card">
            <div className="points-card__label">当前积分</div>
            <div className="points-card__num">{points.toLocaleString()}</div>
            <div className="points-card__row">
              <span>收入与支出来自真实积分流水</span>
            </div>
          </section>

          <Tabs items={TABS} value={tab} onChange={setTab} />

          {Object.entries(groups).map(([group, items]) => (
            <div className="list-group" key={group}>
              <div className="list-group__title">{group}</div>
              {items.map((it) => (
                <div className="list-item" key={it.id}>
                  <span className={`list-item__icon points-icon points-icon--${it.category}`}>
                    {it.icon}
                  </span>
                  <div className="list-item__body">
                    <div className="list-item__title">{it.title}</div>
                    <div className="list-item__desc">{it.desc}</div>
                  </div>
                  <strong className={it.category === 'income' ? 'points-amount--up' : 'points-amount--down'}>
                    {it.amount > 0 ? `+${it.amount}` : it.amount}
                  </strong>
                </div>
              ))}
            </div>
          ))}

          {filtered.length === 0 && <div className="u-caption u-text-center">暂无积分流水</div>}
        </div>
      </div>
    </>
  );
};

function logFromApi(log: ApiPointsLog): LogItem {
  const category = log.amount >= 0 ? 'income' : 'expense';
  return {
    id: log.id,
    category,
    icon: iconForLog(log),
    title: log.remark || labelForType(log.type),
    desc: shortDateTime(log.created_at),
    amount: log.amount,
    group: groupForDate(log.created_at),
  };
}

function iconForLog(log: ApiPointsLog) {
  if (log.source_type === 'generation' && log.remark.includes('生图')) return <ImageIcon size={18} />;
  if (log.source_type === 'generation') return <MessageSquare size={18} />;
  if (log.amount > 0) return <Plus size={18} />;
  return <Star size={18} />;
}

function labelForType(type: string) {
  if (type === 'consume') return '积分消费';
  if (type === 'reward') return '积分奖励';
  return '积分变动';
}

function groupForDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更早';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return '今天';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  return '更早';
}

function shortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
