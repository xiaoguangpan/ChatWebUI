import { ChevronLeft, ChevronRight, Copy, Download, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { apiGet } from '../../api';
import { Drawer } from '../../components/Drawer';
import { Tabs } from '../../components/Tabs';
import { downloadCsv } from '../../csv';

type GenStatus = 'ok' | 'err';
type GenType = 'chat' | 'image' | 'tts';

type GenRow = {
  id: string;
  user: { id: string; name: string; avatar: string; color: string };
  type: GenType;
  typeLabel: string;
  model: string;
  provider: string;
  promptShort: string;
  prompt: string;
  response?: string;
  images?: number;
  imageUrls?: string[];
  audioFormat?: string;
  tokensIn?: number;
  tokensOut?: number;
  cost: number;
  durationMs: number;
  status: GenStatus;
  time: string;
  upstream: { provider: string; endpoint: string; model: string; code: number };
  error?: { code: string; message: string; raw: string };
};

type ApiGeneration = {
  id: string;
  user_id: string;
  user_name: string;
  type: GenType;
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
  status: GenStatus;
  error_type?: string;
  error_message?: string;
  trace?: string;
  created_at: string;
};

const TABS = [
  { value: 'all', label: '全部' },
  { value: 'chat', label: '对话' },
  { value: 'image', label: '生图' },
  { value: 'err', label: '失败' },
];

function statusBadge(s: GenStatus): ReactNode {
  return (
    <span className={`dot-state dot-state--${s}`}>{s === 'ok' ? '成功' : '失败'}</span>
  );
}

function typeBadge(t: GenType): ReactNode {
  if (t === 'image') return (
    <span className="c-badge c-badge--info">生图</span>
  );
  if (t === 'tts') return <span className="c-badge c-badge--warning">语音</span>;
  return <span className="c-badge c-badge--brand">对话</span>;
}

function tokensCell(r: GenRow): string {
  if (r.type === 'image') return `${r.images ?? 0} 张`;
  if (r.type === 'tts') return r.audioFormat ? r.audioFormat.toUpperCase() : '音频';
  return `${(r.tokensIn ?? 0).toLocaleString()} in / ${(r.tokensOut ?? 0).toLocaleString()} out`;
}

function shortTime(t: string) {
  return t.split(' ')[1]?.slice(0, 5) ?? t;
}

function generationFromApi(item: ApiGeneration): GenRow {
  const typeLabel = item.type === 'image' ? '生图' : item.type === 'tts' ? '语音' : '对话';
  const ok = item.status === 'ok';
  return {
    id: item.id,
    user: { id: item.user_id, name: item.user_name, avatar: initials(item.user_name), color: '#10A37F' },
    type: item.type,
    typeLabel,
    model: item.model_name || item.model_id,
    provider: item.provider_name,
    promptShort: truncate(item.prompt_markdown, 32),
    prompt: item.prompt_markdown,
    response: item.response_markdown,
    images: item.image_urls?.length,
    imageUrls: item.image_urls,
    audioFormat: item.audio_format,
    tokensIn: item.tokens_in,
    tokensOut: item.tokens_out,
    cost: item.points_cost,
    durationMs: item.duration_ms,
    status: ok ? 'ok' : 'err',
    time: formatDateTime(item.created_at),
    upstream: {
      provider: item.provider_name,
      endpoint: item.type === 'image' ? '/v1/images/generations' : item.type === 'tts' ? '/v1/audio/speech' : '/v1/chat/completions',
      model: item.model_id,
      code: ok ? 200 : 502,
    },
    error: ok ? undefined : { code: item.error_type ?? 'UPSTREAM_ERROR', message: item.error_message ?? '请求失败', raw: item.trace ?? item.id },
  };
}

function initials(name: string) {
  const chars = name.trim().split(/\s+/).map((part) => part[0]).join('');
  return (chars || 'U').slice(0, 2).toUpperCase();
}

function truncate(value: string, length: number) {
  const chars = Array.from(value.trim());
  return chars.length > length ? `${chars.slice(0, length).join('')}...` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const GenerationsPage: FC = () => {
  const [tab, setTab] = useState('all');
  const [active, setActive] = useState<GenRow | null>(null);
  const [rows, setRows] = useState<GenRow[]>([]);

  useEffect(() => {
    apiGet<{ generations: ApiGeneration[] }>('/api/admin/generations')
      .then((res) => {
        setRows(res.generations.map(generationFromApi));
      })
      .catch(() => undefined);
  }, []);

  const exportRows = () => {
    downloadCsv(
      `generations-${new Date().toISOString().slice(0, 10)}.csv`,
      ['请求ID', '用户ID', '用户', '类型', '模型ID', '供应商', '积分消耗', '耗时ms', '状态', '时间', '提示词'],
      rows.map((row) => [
        row.id,
        row.user.id,
        row.user.name,
        row.type,
        row.model,
        row.provider,
        row.cost,
        row.durationMs,
        row.status,
        row.time,
        row.prompt,
      ]),
    );
  };

  const filtered = rows.filter((r) => {
    if (tab === 'chat') return r.type === 'chat';
    if (tab === 'image') return r.type === 'image';
    if (tab === 'err') return r.status === 'err';
    return true;
  });
  const modelNames = Array.from(new Set(rows.map((r) => r.model))).sort();

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">生成记录</h1>
          <div className="admin-page__subtitle">
            所有用户的对话与图像生成记录 · 点击行查看完整内容与失败原因
          </div>
        </div>
        <button type="button" className="c-btn c-btn--secondary" onClick={exportRows}>
          <Download size={16} />导出
        </button>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="toolbar__left">
          <div className="c-search">
            <span className="icon-search">
              <Search size={16} />
            </span>
            <input className="c-input" placeholder="搜索请求 ID、用户、提示词..." />
          </div>
          <select className="c-select" style={{ width: 140 }}>
            <option>全部模型</option>
            {modelNames.map((model) => (
              <option key={model}>{model}</option>
            ))}
          </select>
          <select className="c-select" style={{ width: 140 }}>
            <option>今日</option>
            <option>最近 7 天</option>
            <option>最近 30 天</option>
            <option>自定义</option>
          </select>
        </div>
      </div>

      <div className="c-table-wrap">
        <table className="c-table">
          <thead>
            <tr>
              <th>请求 ID</th>
              <th>用户</th>
              <th>类型</th>
              <th>模型</th>
              <th>提示词 / 摘要</th>
              <th>Tokens / 张数</th>
              <th>消耗</th>
              <th>耗时</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setActive(r)}
              >
                <td>
                  <code>{r.id}</code>
                </td>
                <td>
                  <div className="user-cell">
                    <span className="c-avatar c-avatar--sm" style={{ background: r.user.color }}>
                      {r.user.avatar}
                    </span>
                    {r.user.name}
                  </div>
                </td>
                <td>{typeBadge(r.type)}</td>
                <td>
                  <div>{r.model}</div>
                  <div className="u-caption">{r.provider}</div>
                </td>
                <td className="u-truncate" style={{ maxWidth: 280 }}>
                  {r.promptShort}
                </td>
                <td>{tokensCell(r)}</td>
                <td>{r.cost === 0 && r.status === 'err' ? '0' : `-${r.cost}`}</td>
                <td>{(r.durationMs / 1000).toFixed(1)}s</td>
                <td>{statusBadge(r.status)}</td>
                <td className="u-caption">{shortTime(r.time)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                  暂无生成记录
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
            共 {filtered.length.toLocaleString()} 条
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

      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        title={active ? `${active.typeLabel} 详情` : '请求详情'}
        subtitle={
          active ? (
            <>
              <code>{active.id}</code> · {active.time}
            </>
          ) : null
        }
        footer={
          <>
            <button
              type="button"
              className="c-btn c-btn--ghost"
              onClick={() => setActive(null)}
            >
              关闭
            </button>
            <button type="button" className="c-btn c-btn--secondary">
              <Copy size={14} />复制 Request ID
            </button>
            <button type="button" className="c-btn c-btn--secondary">
              <RefreshCw size={14} />重试
            </button>
          </>
        }
      >
        {active && <DrawerContent row={active} />}
      </Drawer>
    </div>
  );
};

const DrawerContent: FC<{ row: GenRow }> = ({ row }) => (
  <>
    <Section title="概览">
      <div className="c-drawer-meta-grid">
        <Meta k="用户" v={`${row.user.name} · ${row.user.id}`} />
        <Meta k="类型" v={row.typeLabel} />
        <Meta k="模型" v={row.model} />
        <Meta k="状态" v={statusBadge(row.status)} />
        <Meta
          k="耗时"
          v={`${(row.durationMs / 1000).toFixed(1)}s (${row.durationMs}ms)`}
        />
        <Meta
          k="消耗积分"
          v={row.cost === 0 && row.status === 'err' ? '0(已退款)' : `-${row.cost}`}
        />
        {row.type === 'chat' ? (
          <>
            <Meta k="输入 Tokens" v={(row.tokensIn ?? 0).toLocaleString()} />
            <Meta k="输出 Tokens" v={(row.tokensOut ?? 0).toLocaleString()} />
          </>
        ) : row.type === 'tts' ? (
          <>
            <Meta k="音频格式" v={row.audioFormat?.toUpperCase() ?? '音频'} />
            <Meta k="生成数量" v="1 段" />
          </>
        ) : (
          <>
            <Meta k="生成数量" v={`${row.images ?? 0} 张`} />
            <Meta k="尺寸" v="按模型或上游默认" />
          </>
        )}
      </div>
    </Section>

    <Section title="用户输入 (Prompt)" mono>
      {row.prompt}
    </Section>

    {row.type === 'chat' ? (
      <Section title="AI 回复 (Output)" mono>
        {row.response ? (
          row.response
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>
            无回复内容(请求失败)
          </span>
        )}
      </Section>
    ) : row.type === 'tts' ? (
      <Section title="语音结果">
        <span className="u-caption">语音文件格式: {row.audioFormat?.toUpperCase() ?? '未知'}</span>
      </Section>
    ) : (
      <Section title="生成结果">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          {(row.imageUrls && row.imageUrls.length > 0 ? row.imageUrls : Array.from({ length: row.images ?? 0 }, (_, i) => `placeholder:${i}`)).map((url, i) =>
            url.startsWith('placeholder:') ? (
              <div className="generations-image-placeholder" key={url}>
                {row.status === 'err' ? '生成失败' : `示例图 ${i + 1}`}
              </div>
            ) : (
              <img className="generations-image-placeholder" src={url} alt={`生成图 ${i + 1}`} key={url} />
            ),
          )}
        </div>
      </Section>
    )}

    {row.status === 'err' && row.error && (
      <Section title="失败原因" titleColor="var(--danger)" mono variant="err">
        <strong>{row.error.code}</strong>
        {'\n'}
        {row.error.message}
        {'\n\n--- raw response ---\n'}
        {row.error.raw}
      </Section>
    )}

    <Section title="上游链路 (Trace)" mono>
      {`[client] ${row.id}\n  ↓\n[router] route=${row.type} model=${row.model}\n  ↓\n[upstream:${row.upstream.provider}] ${row.upstream.endpoint}\n  └ model=${row.upstream.model}\n  └ status=${row.upstream.code} ${row.upstream.code >= 400 ? '(error)' : '(ok)'}\n  └ duration=${row.durationMs}ms`}
    </Section>
  </>
);

const Section: FC<{
  title: string;
  children: ReactNode;
  mono?: boolean;
  titleColor?: string;
  variant?: 'err';
}> = ({ title, children, mono, titleColor, variant }) => (
  <div className="c-drawer-section">
    <div className="c-drawer-section__title" style={titleColor ? { color: titleColor } : undefined}>
      {title}
    </div>
    <div
      className={`c-drawer-section__body${mono ? ' c-drawer-section__body--mono' : ''}${
        variant === 'err' ? ' c-drawer-section__body--err' : ''
      }`}
    >
      {children}
    </div>
  </div>
);

const Meta: FC<{ k: string; v: ReactNode }> = ({ k, v }) => (
  <div>
    <span className="k">{k}</span>
    <span className="v">{v}</span>
  </div>
);
