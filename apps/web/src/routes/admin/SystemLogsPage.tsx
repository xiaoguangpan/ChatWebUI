import { Download, Pause, Play, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { apiGet } from '../../api';
import { Tabs } from '../../components/Tabs';
import { downloadCsv } from '../../csv';

type Level = 'info' | 'warn' | 'error' | 'debug';

type AppLog = { time: string; level: Level; type: string; msg: string };

type ApiSystemLog = {
  id: string;
  level: Level;
  type: string;
  message: string;
  created_at: string;
};

type AccessLog = {
  time: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ua: string;
  user?: string;
};

type AuditLog = {
  time: string;
  who: string;
  who_id: string;
  action: string;
  ip: string;
  device: string;
  status: 'ok' | 'err';
};

const TABS = [
  { value: 'app', label: '应用日志' },
  { value: 'access', label: '访问日志' },
  { value: 'audit', label: '登录审计' },
];

const LEVEL_LABEL: Record<Level, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

function statusClass(code: number) {
  if (code >= 500) return 'http-status http-status--5xx';
  if (code >= 400) return 'http-status http-status--4xx';
  if (code >= 300) return 'http-status http-status--3xx';
  return 'http-status http-status--2xx';
}

function statusBucketMatches(code: number, bucket: string) {
  if (bucket === '2xx') return code >= 200 && code < 300;
  if (bucket === '3xx') return code >= 300 && code < 400;
  if (bucket === '4xx') return code >= 400 && code < 500;
  if (bucket === '5xx') return code >= 500 && code < 600;
  return true;
}

function systemLogFromApi(log: ApiSystemLog): AppLog {
  return {
    time: shortLogTime(log.created_at),
    level: log.level,
    type: log.type,
    msg: `[${log.type}] ${log.message}`,
  };
}

function kv(message: string) {
  const result: Record<string, string> = {};
  const pattern = /(\w+)=("[^"]*"|\S+)/g;
  for (const match of message.matchAll(pattern)) {
    result[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return result;
}

function accessLogFromApi(log: ApiSystemLog): AccessLog | null {
  const data = kv(log.message);
  if (!data.method || !data.path) return null;
  return {
    time: shortLogTime(log.created_at),
    ip: data.ip ?? '-',
    method: data.method,
    path: data.path,
    status: Number(data.status) || 0,
    durationMs: Number(data.duration_ms) || 0,
    ua: data.ua ?? '',
    user: data.user && data.user !== '-' ? data.user : undefined,
  };
}

function auditLogFromApi(log: ApiSystemLog): AuditLog {
  const data = kv(log.message);
  return {
    time: shortLogTime(log.created_at),
    who: data.account ?? data.operator ?? data.user ?? '-',
    who_id: data.operator ?? data.user ?? '-',
    action: auditActionLabel(log.message),
    ip: data.ip ?? '-',
    device: data.ua ?? '-',
    status: log.level === 'error' || log.message.toLowerCase().includes('failed') ? 'err' : 'ok',
  };
}

function auditActionLabel(message: string) {
  const text = message.toLowerCase();
  if (text.startsWith('login ok')) return '登录成功';
  if (text.startsWith('login failed')) return '登录失败';
  if (text.startsWith('logout')) return '退出登录';
  if (text.startsWith('admin adjust points')) return '调整积分';
  if (text.startsWith('admin change plan')) return '修改套餐';
  if (text.startsWith('admin ban user')) return '封禁用户';
  if (text.startsWith('admin unban user')) return '解除封禁';
  if (text.startsWith('admin reset password')) return '重置密码';
  if (text.startsWith('admin create points policy')) return '新增积分策略';
  if (text.startsWith('update profile')) return '更新资料';
  return message;
}

function auditAvatarText(log: AuditLog) {
  const value = log.who && log.who !== '-' ? log.who : log.who_id;
  const first = value.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

function shortLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

export const SystemLogsPage: FC = () => {
  const [tab, setTab] = useState('app');
  const [autoFollow, setAutoFollow] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [levelFilter, setLevelFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState('all');
  const boxRef = useRef<HTMLDivElement>(null);

  const loadLogs = useCallback(() => {
    apiGet<{ logs: ApiSystemLog[] }>('/api/admin/logs')
      .then((res) => {
        setAppLogs(res.logs.filter((log) => log.type !== 'access' && log.type !== 'audit').map(systemLogFromApi));
        setAccessLogs(res.logs.filter((log) => log.type === 'access').map(accessLogFromApi).filter((log): log is AccessLog => !!log));
        setAuditLogs(res.logs.filter((log) => log.type === 'audit').map(auditLogFromApi));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadLogs();
    const timer = window.setInterval(loadLogs, 5000);
    return () => window.clearInterval(timer);
  }, [loadLogs]);

  useEffect(() => {
    if (!autoFollow || tab !== 'app') return;
    const box = boxRef.current;
    if (box) box.scrollTop = 0;
  }, [appLogs.length, autoFollow, tab]);

  const k = keyword.trim().toLowerCase();
  const appTypes = useMemo(() => Array.from(new Set(appLogs.map((l) => l.type))).sort(), [appLogs]);
  const accessMethods = useMemo(() => Array.from(new Set(accessLogs.map((l) => l.method))).sort(), [accessLogs]);
  const auditActions = useMemo(() => Array.from(new Set(auditLogs.map((l) => l.action))).sort(), [auditLogs]);
  const appFiltered = useMemo(
    () =>
      appLogs.filter((l) => {
        if (levelFilter !== 'all' && l.level !== levelFilter) return false;
        if (typeFilter !== 'all' && l.type !== typeFilter) return false;
        return !k || l.msg.toLowerCase().includes(k);
      }),
    [appLogs, k, levelFilter, typeFilter],
  );
  const accessFiltered = useMemo(
    () =>
      accessLogs.filter((l) => {
        if (methodFilter !== 'all' && l.method !== methodFilter) return false;
        if (statusFilter !== 'all' && !statusBucketMatches(l.status, statusFilter)) return false;
        return !k || l.path.toLowerCase().includes(k) || l.ip.includes(k) || (l.user ?? '').toLowerCase().includes(k);
      }),
    [accessLogs, k, methodFilter, statusFilter],
  );
  const auditFiltered = useMemo(
    () =>
      auditLogs.filter((l) => {
        if (auditActionFilter !== 'all' && l.action !== auditActionFilter) return false;
        if (auditStatusFilter !== 'all' && l.status !== auditStatusFilter) return false;
        return !k || l.who.toLowerCase().includes(k) || l.action.toLowerCase().includes(k) || l.ip.includes(k);
      }),
    [auditActionFilter, auditLogs, auditStatusFilter, k],
  );

  const exportCurrent = () => {
    if (tab === 'access') {
      downloadCsv(
        `access-logs-${new Date().toISOString().slice(0, 10)}.csv`,
        ['时间', 'IP', '方法', '路径', '状态码', '耗时ms', '用户', 'UA'],
        accessFiltered.map((row) => [row.time, row.ip, row.method, row.path, row.status, row.durationMs, row.user, row.ua]),
      );
      return;
    }
    if (tab === 'audit') {
      downloadCsv(
        `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
        ['时间', '操作人', '操作人ID', '动作', 'IP', '设备', '结果'],
        auditFiltered.map((row) => [row.time, row.who, row.who_id, row.action, row.ip, row.device, row.status]),
      );
      return;
    }
    downloadCsv(
      `app-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      ['时间', '级别', '消息'],
      appFiltered.map((row) => [row.time, row.level, row.msg]),
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">系统日志</h1>
          <div className="admin-page__subtitle">来自数据库的真实应用事件、访问日志与登录审计</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'app' && (
            <button
              type="button"
              className="c-btn c-btn--secondary"
              onClick={() => setAutoFollow((v) => !v)}
            >
              {autoFollow ? <Pause size={14} /> : <Play size={14} />}
              {autoFollow ? '暂停跟随' : '实时跟随'}
            </button>
          )}
          <button type="button" className="c-btn c-btn--secondary" onClick={exportCurrent}>
            <Download size={16} />下载
          </button>
        </div>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="toolbar__left">
          <div className="c-search">
            <span className="icon-search">
              <Search size={16} />
            </span>
            <input
              className="c-input"
              placeholder={
                tab === 'app'
                  ? '搜索关键字...'
                  : tab === 'access'
                    ? '搜索 IP、路径、用户...'
                    : '搜索操作人、动作、IP...'
              }
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          {tab === 'app' && (
            <>
              <select className="c-select" style={{ width: 140 }} value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
                <option value="all">全部级别</option>
                <option value="debug">DEBUG</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
              </select>
              <select className="c-select" style={{ width: 140 }} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">全部类型</option>
                {appTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </>
          )}
          {tab === 'access' && (
            <>
              <select className="c-select" style={{ width: 140 }} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">全部状态码</option>
                <option value="2xx">2xx 成功</option>
                <option value="3xx">3xx 重定向</option>
                <option value="4xx">4xx 客户端</option>
                <option value="5xx">5xx 服务端</option>
              </select>
              <select className="c-select" style={{ width: 140 }} value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                <option value="all">全部方法</option>
                {accessMethods.map((method) => <option value={method} key={method}>{method}</option>)}
              </select>
            </>
          )}
          {tab === 'audit' && (
            <>
              <select className="c-select" style={{ width: 160 }} value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
                <option value="all">全部动作</option>
                {auditActions.map((action) => <option value={action} key={action}>{action}</option>)}
              </select>
              <select className="c-select" style={{ width: 140 }} value={auditStatusFilter} onChange={(event) => setAuditStatusFilter(event.target.value)}>
                <option value="all">全部结果</option>
                <option value="ok">成功</option>
                <option value="err">失败</option>
              </select>
            </>
          )}
        </div>
      </div>

      {tab === 'app' && (
        <div className="console-block" ref={boxRef}>
          {appFiltered.map((line, i) => (
            <div className="console-line" key={i}>
              <span className="console-line__time">{line.time}</span>
              <span className={`console-line__level console-line__level--${line.level}`}>
                {LEVEL_LABEL[line.level]}
              </span>
              <span className="console-line__msg">{line.msg}</span>
            </div>
          ))}
          {appFiltered.length === 0 && (
            <div className="console-line">
              <span className="console-line__msg">暂无应用日志</span>
            </div>
          )}
        </div>
      )}

      {tab === 'access' && (
        <div className="c-table-wrap">
          <table className="c-table access-log-table">
            <colgroup>
              <col className="access-log-table__time" />
              <col className="access-log-table__ip" />
              <col className="access-log-table__method" />
              <col className="access-log-table__path" />
              <col className="access-log-table__status" />
              <col className="access-log-table__duration" />
              <col className="access-log-table__user" />
              <col className="access-log-table__ua" />
            </colgroup>
            <thead>
              <tr>
                <th>时间</th>
                <th>IP</th>
                <th>方法</th>
                <th>路径</th>
                <th>状态</th>
                <th>耗时</th>
                <th>用户</th>
                <th>UA</th>
              </tr>
            </thead>
            <tbody>
              {accessFiltered.map((l, i) => (
                <tr key={i}>
                  <td className="u-caption">{l.time}</td>
                  <td>
                    <code>{l.ip}</code>
                  </td>
                  <td>
                    <span className={`http-method http-method--${l.method.toLowerCase()}`}>
                      {l.method}
                    </span>
                  </td>
                  <td>
                    <code className="access-log-cell access-log-cell--path" title={l.path}>{l.path}</code>
                  </td>
                  <td>
                    <span className={statusClass(l.status)}>{l.status}</span>
                  </td>
                  <td>{l.durationMs}ms</td>
                  <td>
                    <span className="access-log-cell access-log-cell--user" title={l.user ?? '—'}>{l.user ?? '—'}</span>
                  </td>
                  <td className="u-caption">
                    <span className="access-log-cell access-log-cell--ua" title={l.ua || '-'}>{l.ua || '-'}</span>
                  </td>
                </tr>
              ))}
              {accessFiltered.length === 0 && (
                <tr>
                  <td colSpan={8} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                    暂无访问日志
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="c-table-wrap">
          <table className="c-table audit-log-table">
            <colgroup>
              <col className="audit-log-table__time" />
              <col className="audit-log-table__who" />
              <col className="audit-log-table__action" />
              <col className="audit-log-table__ip" />
              <col className="audit-log-table__device" />
              <col className="audit-log-table__status" />
            </colgroup>
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>动作</th>
                <th>IP</th>
                <th>设备</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {auditFiltered.map((l, i) => (
                <tr key={i}>
                  <td className="u-caption">{l.time}</td>
                  <td>
                    <div className="user-cell">
                      <span className="c-avatar c-avatar--sm">
                        {auditAvatarText(l)}
                      </span>
                      <span>
                        <div className="user-cell__name">{l.who}</div>
                        <div className="user-cell__email">{l.who_id}</div>
                      </span>
                    </div>
                  </td>
                  <td><span className="access-log-cell" title={l.action}>{l.action}</span></td>
                  <td>
                    <code>{l.ip}</code>
                  </td>
                  <td className="u-caption"><span className="access-log-cell" title={l.device}>{l.device}</span></td>
                  <td>
                    <span className={`dot-state dot-state--${l.status}`}>
                      {l.status === 'ok' ? '成功' : '失败'}
                    </span>
                  </td>
                </tr>
              ))}
              {auditFiltered.length === 0 && (
                <tr>
                  <td colSpan={6} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                    暂无登录审计
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'app' && (
        <div className="c-pagination">
          <span
            className="u-caption"
            style={{ marginRight: 'auto', paddingLeft: 8 }}
          >
            {autoFollow ? '显示最新日志' : '已暂停跟随'}
          </span>
          <button type="button" className="c-page-btn is-active">最新</button>
        </div>
      )}
    </div>
  );
};
