import {
  ArrowUp,
  Copy,
  Menu,
  Mic,
  Plus,
  Square,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { apiBaseUrl, apiDelete, apiGet, apiPost, authHeaders, getAuthToken, setAuthToken, speakText, type ApiModel, type AuthResponse } from '../api';
import { ModelPicker, type ModelOption } from '../components/ModelPicker';
import type { ClientOutletCtx } from '../components/ClientShell';
import { MarkdownText } from '../MarkdownText';
import { Modal } from '../components/Modal';
import { startSpeechInput, supportsSpeechInput } from '../speechInput';

type ApiMessage = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content_markdown: string;
  model_id?: string;
  provider_id?: string;
  points_cost?: number;
  created_at: string;
};

type ChatMessageRow = ApiMessage & {
  pending?: boolean;
  local?: boolean;
};

type SsePayload = {
  type?: 'meta' | 'delta' | 'usage' | 'done' | 'error';
  text?: string;
  message?: string;
  conversation_id?: string;
  usage?: { points_cost?: number };
};

type ChatRequestMessage = {
  role: 'user' | 'assistant' | 'system';
  content: { type: 'text'; text: string }[];
};

type StreamEntry = {
  id: string;
  status: 'connecting' | 'streaming' | 'done' | 'error';
  messages: ChatMessageRow[];
  error?: string;
};

const streamEntries = new Map<string, StreamEntry>();
const streamSubscribers = new Set<() => void>();

function notifyStreams() {
  streamSubscribers.forEach((callback) => callback());
}

function subscribeStreams(callback: () => void) {
  streamSubscribers.add(callback);
  return () => {
    streamSubscribers.delete(callback);
  };
}

function setStreamEntry(id: string, patch: Partial<StreamEntry>) {
  const prev = streamEntries.get(id);
  streamEntries.set(id, { id, status: 'connecting', messages: [], ...prev, ...patch });
  notifyStreams();
}

function deleteStreamEntry(id: string) {
  streamEntries.delete(id);
  notifyStreams();
}

function moveStreamEntry(from: string, to: string) {
  const entry = streamEntries.get(from);
  if (!entry) return;
  streamEntries.delete(from);
  streamEntries.set(to, { ...entry, id: to });
  notifyStreams();
}

export const ChatPage: FC = () => {
  const { openSidebar } = useOutletContext<ClientOutletCtx>();
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [streamVersion, setStreamVersion] = useState(0);
  const [draftStreamId, setDraftStreamId] = useState('');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelOption | undefined>();
  const [historyMessages, setHistoryMessages] = useState<ApiMessage[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [pendingAuthPrompt, setPendingAuthPrompt] = useState('');

  const reloadMessages = useCallback((id: string) => {
    apiGet<{ messages: ApiMessage[] }>(`/api/conversations/${id}/messages`)
      .then((res) => {
        setHistoryMessages(res.messages);
        const entry = streamEntries.get(id);
        if (entry?.status === 'done') deleteStreamEntry(id);
      })
      .catch(() => setHistoryMessages([]));
  }, []);

  useEffect(() => subscribeStreams(() => setStreamVersion((value) => value + 1)), []);

  useEffect(() => {
    apiGet<{ models: ApiModel[] }>('/api/models/available?type=chat')
      .then((res) => {
        const options = res.models.map(modelOptionFromApi);
        if (options.length === 0) return;
        const saved = window.localStorage.getItem('chatwebui:selectedChatModelId');
        const defaultModel = res.models.find((model) => model.default_role === 'chat');
        const next = options.find((model) => model.id === defaultModel?.id) ?? options.find((model) => model.id === saved) ?? options[0];
        setModelOptions(options);
        setSelectedModel(next);
        window.localStorage.setItem('chatwebui:selectedChatModelId', next.id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setDraftStreamId('');
    if (!conversationId) {
      setHistoryMessages([]);
      return;
    }
    reloadMessages(conversationId);
  }, [conversationId, reloadMessages]);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; tempId?: string }>).detail;
      if (!detail?.id) return;
      if (detail.tempId && detail.tempId === draftStreamId) {
        setDraftStreamId('');
        navigate(`/c/${encodeURIComponent(detail.id)}`, { replace: true });
      }
    };
    const onUpdated = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id || id !== currentRouteConversationId()) return;
      reloadMessages(id);
    };
    window.addEventListener('chatwebui:conversation-created', onCreated);
    window.addEventListener('chatwebui:conversation-updated', onUpdated);
    return () => {
      window.removeEventListener('chatwebui:conversation-created', onCreated);
      window.removeEventListener('chatwebui:conversation-updated', onUpdated);
    };
  }, [draftStreamId, navigate, reloadMessages]);

  useEffect(() => {
    const auth = searchParams.get('auth');
    if (auth !== 'login' && auth !== 'register') return;
    setAuthMode(auth);
    setAuthOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onAuthRequired = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setPendingAuthPrompt(detail?.prompt ?? '');
      setAuthMode('login');
      setAuthOpen(true);
    };
    window.addEventListener('chatwebui:auth-required', onAuthRequired);
    return () => window.removeEventListener('chatwebui:auth-required', onAuthRequired);
  }, []);

  useEffect(() => {
    const onNewChat = () => {
      if (currentRouteConversationId()) return;
      setDraftStreamId('');
      setHistoryMessages([]);
    };
    window.addEventListener('chatwebui:new-chat', onNewChat);
    return () => window.removeEventListener('chatwebui:new-chat', onNewChat);
  }, []);

  const activeStreamId = conversationId || draftStreamId;
  const streamEntry = activeStreamId ? streamEntries.get(activeStreamId) : undefined;
  const messages = useMemo(() => {
    if (conversationId) return mergeHistoryWithStream(historyMessages, streamEntry);
    return streamEntry?.messages ?? [];
  }, [conversationId, historyMessages, streamEntry, streamVersion]);

  const isRunning = streamEntry?.status === 'connecting' || streamEntry?.status === 'streaming';

  const handleSelectModel = (model: ModelOption) => {
    setSelectedModel(model);
    window.localStorage.setItem('chatwebui:selectedChatModelId', model.id);
  };

  const requestNewChat = () => {
    window.dispatchEvent(new CustomEvent('chatwebui:new-chat'));
  };

  const sendMessage = (text: string) => {
    const prompt = text.trim();
    if (!prompt || !selectedModel || isRunning) return;
    const targetId = conversationId || draftStreamId || `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    if (!conversationId) setDraftStreamId(targetId);
    startChatStream({
      streamId: targetId,
      conversationId: conversationId ?? '',
      prompt,
      modelId: selectedModel.id,
    });
  };

  const continueAfterAuth = () => {
    setAuthOpen(false);
    const prompt = pendingAuthPrompt.trim();
    setPendingAuthPrompt('');
    if (prompt) {
      window.setTimeout(() => sendMessage(prompt), 0);
    }
  };

  const deleteConversation = async () => {
    if (!conversationId) return;
    if (!window.confirm('确认删除这条聊天记录？删除后不可恢复。')) return;
    await apiDelete(`/api/conversations/${conversationId}`);
    deleteStreamEntry(conversationId);
    setHistoryMessages([]);
    window.dispatchEvent(new CustomEvent('chatwebui:conversations-changed'));
    navigate('/', { replace: true });
  };

  const deleteMessagePair = async (message: ChatMessageRow) => {
    if (!conversationId || message.local) return;
    if (!window.confirm('确认删除这一轮问答？删除答案会同时删除对应提问，避免污染后续上下文。')) return;
    await apiDelete(`/api/conversations/${conversationId}/messages/${message.id}`);
    reloadMessages(conversationId);
    window.dispatchEvent(new CustomEvent('chatwebui:conversations-changed'));
  };

  return (
    <>
      <header className="app-topbar">
        <button className="c-icon-btn" type="button" aria-label="菜单" onClick={openSidebar}>
          <Menu size={20} />
        </button>
        <div className="app-topbar__spacer" />
        <div className="app-topbar__actions">
          <Link className="c-icon-btn" to="/" aria-label="新建会话" onClick={requestNewChat}>
            <SquarePen size={20} />
          </Link>
          {conversationId && (
            <button className="c-icon-btn" type="button" aria-label="删除当前聊天" onClick={deleteConversation}>
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </header>

      <div className="thread-root">
        <div className="chat-stream">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <h1 className="chat-welcome__title">今天有什么计划?</h1>
            </div>
          )}
          <div className="chat-stream__inner">
            {messages.map((message) => (
              <ChatBubble message={message} onDelete={deleteMessagePair} key={message.id} />
            ))}
          </div>
        </div>
        <ChatComposer
          selectedModel={selectedModel}
          modelOptions={modelOptions}
          isRunning={isRunning}
          onSend={sendMessage}
          onSelectModel={handleSelectModel}
        />
      </div>
      <InlineAuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={continueAfterAuth}
      />
    </>
  );
};

const InlineAuthModal: FC<{
  open: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, initialMode, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError('');
    }
  }, [initialMode, open]);

  const submit = async () => {
    setError('');
    if (mode === 'register' && password !== passwordConfirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<AuthResponse>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        phone: account,
        password,
        password_confirm: passwordConfirm,
      });
      setAuthToken(res.token, 'client');
      window.dispatchEvent(new CustomEvent('chatwebui:auth-changed'));
      setAccount('');
      setPassword('');
      setPasswordConfirm('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? '登录失败' : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'login' ? '登录后继续对话' : '注册后继续对话'}
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>稍后</button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit} disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录并继续' : '注册并继续'}
          </button>
        </>
      }
    >
      <div className="inline-auth-tabs">
        <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>登录</button>
        <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>注册</button>
      </div>
      <div className="c-field" style={{ marginTop: 14 }}>
        <label className="c-label">手机号 / 邮箱</label>
        <input className="c-input" value={account} onChange={(event) => setAccount(event.target.value)} />
      </div>
      <div className="c-field" style={{ marginTop: 12 }}>
        <label className="c-label">密码</label>
        <input className="c-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      {mode === 'register' && (
        <div className="c-field" style={{ marginTop: 12 }}>
          <label className="c-label">确认密码</label>
          <input className="c-input" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
        </div>
      )}
      {error && <div className="c-help" style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}
      <div className="c-help" style={{ marginTop: 12 }}>未登录可试用 3 次。登录或注册后，当前这次提问会继续发送。</div>
    </Modal>
  );
};

function modelOptionFromApi(model: ApiModel): ModelOption {
  const modelId = model.upstream_id || model.display_name || model.id;
  const provider = model.provider_name || model.provider_id || '未知供应商';
  return {
    id: model.id,
    name: `${modelId} / ${provider}`,
    desc: model.description || model.points_policy_summary || model.capabilities.join(' / '),
  };
}

const ChatBubble: FC<{ message: ChatMessageRow; onDelete: (message: ChatMessageRow) => void }> = ({ message, onDelete }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`msg ${isUser ? 'msg--user' : 'msg--ai'}`}>
      <span className={`msg__avatar ${isUser ? 'msg__avatar--user' : 'msg__avatar--ai'}`}>{isUser ? '我' : 'C'}</span>
      <div className="msg__body">
        <div className="msg__content">
          {message.pending && !message.content_markdown ? (
            <ThinkingState />
          ) : (
            <MarkdownText deferDiagrams={message.local && message.role === 'assistant'}>{message.content_markdown}</MarkdownText>
          )}
        </div>
        {(message.model_id || message.points_cost) && (
          <div className="msg__meta">
            {message.model_id ? <span>{message.model_id}</span> : null}
            {message.points_cost ? <span>-{message.points_cost} 积分</span> : null}
          </div>
        )}
        <MessageActions message={message} onDelete={onDelete} />
      </div>
    </div>
  );
};

const MessageActions: FC<{ message: ChatMessageRow; onDelete: (message: ChatMessageRow) => void }> = ({ message, onDelete }) => {
  const [speaking, setSpeaking] = useState(false);
  const content = message.content_markdown.trim();
  const isAssistant = message.role === 'assistant';

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
    <div className="msg__actions">
      <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="复制" disabled={!content} onClick={copy}>
        <Copy size={14} />
      </button>
      {isAssistant && (
        <>
          <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="赞">
            <ThumbsUp size={14} />
          </button>
          <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="踩">
            <ThumbsDown size={14} />
          </button>
          <button className="c-icon-btn c-icon-btn--sm" type="button" aria-label="朗读" disabled={!content || speaking} onClick={speak}>
            <Volume2 size={14} />
          </button>
        </>
      )}
      {!message.local && (
        <button className="c-icon-btn c-icon-btn--sm c-icon-btn--danger" type="button" aria-label="删除这一轮" onClick={() => onDelete(message)}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};

const ThinkingState: FC = () => (
  <span className="msg__thinking" aria-label="正在输出">
    <span />
    <span />
    <span />
  </span>
);

type ChatComposerProps = {
  selectedModel?: ModelOption;
  modelOptions: ModelOption[];
  isRunning: boolean;
  onSend: (text: string) => void;
  onSelectModel: (model: ModelOption) => void;
};

const ChatComposer: FC<ChatComposerProps> = ({ selectedModel, modelOptions, isRunning, onSend, onSelectModel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRef = useRef<ReturnType<typeof startSpeechInput>>();
  const [attachments, setAttachments] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');

  const submit = () => {
    const prompt = text.trim();
    if (!prompt || isRunning) return;
    setText('');
    onSend(prompt);
  };

  const toggleSpeech = () => {
    setSpeechError('');
    if (listening) {
      speechRef.current?.stop();
      setListening(false);
      return;
    }
    setListening(true);
    speechRef.current = startSpeechInput({
      onText: (value) => setText((prev) => (prev.trim() ? `${prev.trim()} ${value}` : value)),
      onEnd: () => setListening(false),
      onError: setSpeechError,
    });
  };

  return (
    <div className="composer">
      <div className="composer__inner">
        <div className="composer__bar">
          {attachments.length > 0 && (
            <div className="composer__attachments">
              {attachments.map((file) => (
                <span className="composer__attachment" key={`${file.name}-${file.size}`}>
                  {file.name}
                </span>
              ))}
            </div>
          )}
          <div className="composer__row">
            <textarea
              className="composer__textarea"
              placeholder="有问题,尽管问"
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              aria-label="消息输入框"
            />
          </div>
          <div className="composer__tools">
            <div className="composer__left">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
              />
              <button className="c-icon-btn" type="button" aria-label="附件" onClick={() => fileInputRef.current?.click()}>
                <Plus size={20} />
              </button>
            </div>
            <div className="composer__right">
              <ModelPicker selected={selectedModel} options={modelOptions} onSelect={onSelectModel} />
              <button
                className={`c-icon-btn${listening ? ' is-active' : ''}`}
                type="button"
                aria-label={supportsSpeechInput() ? '语音输入' : '当前浏览器不支持语音输入'}
                aria-pressed={listening}
                onClick={toggleSpeech}
              >
                <Mic size={20} />
              </button>
              <button className="send-btn" type="button" aria-label={isRunning ? '正在生成' : '发送'} disabled={isRunning || !text.trim()} onClick={submit}>
                {isRunning ? <Square size={14} /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </div>
        {speechError && <div className="c-help composer__speech-error">{speechError}</div>}
        <div className="composer__hint">AI 可能会犯错,请核实重要信息。</div>
      </div>
    </div>
  );
};

function startChatStream(input: { streamId: string; conversationId: string; prompt: string; modelId: string }) {
  const now = new Date().toISOString();
  const userMessage: ChatMessageRow = {
    id: `local_user_${input.streamId}`,
    conversation_id: input.conversationId,
    role: 'user',
    content_markdown: input.prompt,
    created_at: now,
    local: true,
  };
  const assistantMessage: ChatMessageRow = {
    id: `local_assistant_${input.streamId}`,
    conversation_id: input.conversationId,
    role: 'assistant',
    content_markdown: '',
    created_at: now,
    pending: true,
    local: true,
  };
  const previousMessages = input.conversationId ? [] : streamEntries.get(input.streamId)?.messages.filter((message) => !message.pending) ?? [];
  const messages = [...previousMessages, userMessage, assistantMessage];
  setStreamEntry(input.streamId, { status: 'connecting', messages });
  void runChatStream({
    ...input,
    requestMessages: rowsToThreadMessages(input.conversationId ? [userMessage] : [...previousMessages, userMessage]),
  });
}

async function runChatStream(input: { streamId: string; conversationId: string; prompt: string; modelId: string; requestMessages: ChatRequestMessage[] }) {
  let streamId = input.streamId;
  let activeConversationId = input.conversationId;
  let text = '';
  try {
    const response = await fetch(`${apiBaseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-ChatWebUI-Guest-Id': guestSessionId(),
        ...authHeaders(),
      },
      body: JSON.stringify({
        prompt: input.prompt,
        messages: input.requestMessages,
        model_id: input.modelId,
        conversation_id: input.conversationId,
      }),
    });
    if (response.status === 401 && !getAuthToken('client')) {
      window.dispatchEvent(new CustomEvent('chatwebui:auth-required', { detail: { prompt: input.prompt, modelId: input.modelId } }));
      removeLastPendingTurn(streamId);
      return;
    }
    if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText}`);
    for await (const payload of readSseStream(response)) {
      if (payload.type === 'meta' && payload.conversation_id) {
        activeConversationId = payload.conversation_id;
        if (payload.conversation_id !== streamId) {
          moveStreamEntry(streamId, payload.conversation_id);
          streamId = payload.conversation_id;
        }
        window.dispatchEvent(new CustomEvent('chatwebui:conversation-created', { detail: { id: payload.conversation_id, tempId: input.streamId } }));
        window.dispatchEvent(new CustomEvent('chatwebui:conversations-changed'));
      }
      if (payload.type === 'error') throw new Error(payload.message || '模型返回错误');
      if (payload.type === 'delta' && payload.text) {
        text += payload.text;
        updateAssistantStreamMessage(streamId, { content_markdown: text, pending: false });
        setStreamEntry(streamId, { status: 'streaming' });
      }
      if (payload.type === 'usage') {
        updateAssistantStreamMessage(streamId, { points_cost: payload.usage?.points_cost });
      }
      if (payload.type === 'done') {
        setStreamEntry(streamId, { status: 'done' });
        if (activeConversationId) {
          window.dispatchEvent(new CustomEvent('chatwebui:conversation-updated', { detail: { id: activeConversationId } }));
          window.dispatchEvent(new CustomEvent('chatwebui:conversations-changed'));
        }
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '请求失败';
    updateAssistantStreamMessage(streamId, { content_markdown: message, pending: false });
    setStreamEntry(streamId, { status: 'error', error: message });
  }
}

function rowsToThreadMessages(messages: ChatMessageRow[]): ChatRequestMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .filter((message) => message.content_markdown.trim() !== '')
    .map((message) => ({
      role: message.role,
      content: [{ type: 'text', text: message.content_markdown }],
    }));
}

function removeLastPendingTurn(streamId: string) {
  const entry = streamEntries.get(streamId);
  if (!entry) return;
  setStreamEntry(streamId, {
    status: 'done',
    messages: entry.messages.slice(0, -2),
  });
}

function updateAssistantStreamMessage(streamId: string, patch: Partial<ChatMessageRow>) {
  const entry = streamEntries.get(streamId);
  if (!entry) return;
  let targetIndex = -1;
  for (let index = entry.messages.length - 1; index >= 0; index -= 1) {
    if (entry.messages[index].role === 'assistant') {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex < 0) return;
  const messages = entry.messages.map((message, index) => (index === targetIndex ? { ...message, ...patch } : message));
  setStreamEntry(streamId, { messages });
}

function mergeHistoryWithStream(historyMessages: ApiMessage[], streamEntry?: StreamEntry) {
  if (!streamEntry) return historyMessages;
  const streamMessages = streamEntry.messages;
  const currentPrompt = streamMessages.find((message) => message.local && message.role === 'user')?.content_markdown.trim();
  if (!currentPrompt) return [...historyMessages, ...streamMessages];
  let duplicateStart = -1;
  for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
    const message = historyMessages[i];
    if (message.role === 'user' && message.content_markdown.trim() === currentPrompt) {
      duplicateStart = i;
      break;
    }
  }
  const historyBeforeCurrentTurn = duplicateStart >= 0 ? historyMessages.slice(0, duplicateStart) : historyMessages;
  return [...historyBeforeCurrentTurn, ...streamMessages];
}

async function* readSseStream(response: Response) {
  if (!response.body) throw new Error('SSE response body is empty');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const event of events) {
      const payload = parseSsePayload(event);
      if (payload) yield payload;
    }
  }
  buffer += decoder.decode();
  const payload = parseSsePayload(buffer);
  if (payload) yield payload;
}

function parseSsePayload(rawEvent: string): SsePayload | null {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s?/, ''))
    .join('\n')
    .trim();
  if (!data || data === '[DONE]') return null;
  return JSON.parse(data) as SsePayload;
}

function currentRouteConversationId() {
  const match = window.location.pathname.match(/^\/c\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function guestSessionId() {
  const key = 'chatwebui:guestId';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}
