import {
  CheckCircle2,
  Clock3,
  Columns3,
  FlaskConical,
  GripVertical,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api';
import { Modal } from '../../components/Modal';
import { Tabs } from '../../components/Tabs';

type PageTab = 'providers' | 'models' | 'policies';
type ModelCategory = 'text' | 'image' | 'speech' | 'other';
type ProviderType =
  | 'openai_compatible'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'replicate'
  | 'midjourney_proxy'
  | 'comfyui'
  | 'custom';
type Capability = 'chat' | 'vision' | 'image' | 'embedding' | 'tool' | 'speech';
type Visibility = 'draft' | 'public' | 'plus' | 'admin';
type PointsPolicyId = string;
type PointsPolicyMode = 'per_call' | 'per_token';
type DefaultRole = 'chat' | 'image' | 'embedding' | 'tts';
type SmokeStatus = 'untested' | 'testing' | 'ok' | 'timeout' | 'error';
type SmokeErrorType = 'auth' | 'permission' | 'not_found' | 'rate_limit' | 'upstream' | 'timeout' | 'network' | 'format';
type HealthStatus = 'unused' | 'insufficient' | 'healthy' | 'fluctuating' | 'abnormal' | 'idle' | 'degraded';
type OptionalColumn = 'type' | 'sse' | 'points' | 'performance' | 'calls';

const REMOTE_RENDER_BATCH = 160;

type Provider = {
  id: string;
  name: string;
  short: string;
  type: ProviderType;
  typeLabel: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  remark?: string;
};

type ModelRow = {
  id: string;
  providerId: string;
  group: string;
  upstreamId: string;
  displayName: string;
  capabilities: Capability[];
  enabled: boolean;
  visibility: Visibility;
  defaultRole?: DefaultRole;
  sortWeight?: number;
  sse: boolean;
  contextWindow?: number;
  smokeStatus: SmokeStatus;
  smokeLatencyMs?: number;
  smokeError?: string;
  smokeErrorType?: SmokeErrorType;
  smokeErrorDetail?: string;
  healthStatus: HealthStatus;
  healthText: string;
  pointsPolicyId?: PointsPolicyId;
  pointsPolicySummary?: string;
  billingMode?: string;
  billingSummary?: string;
  costInput?: number;
  costOutput?: number;
  costCall?: number;
  costImage?: number;
  rpm?: number;
  tpm?: number;
  maxConcurrency?: number;
  timeoutTotalSec?: number;
  imageParams?: {
    size?: string;
    quality?: string;
    count?: number;
    asyncMode?: boolean;
  };
  calls7d: string;
};

type RemoteModel = {
  id: string;
  displayName?: string;
  group: string;
  capabilities: Capability[];
  contextWindow?: number;
};

type PointsPolicyOption = {
  id: PointsPolicyId;
  name: string;
  mode: PointsPolicyMode;
  summary: string;
  inputPer1K: number;
  outputPer1K: number;
  perChat: number;
  perImage: number;
  perSpeech: number;
  perOther: number;
  enabled: boolean;
};

type ApiProvider = {
  id: string;
  name: string;
  short: string;
  type: ProviderType;
  type_label: string;
  base_url: string;
  key_masked: string;
  enabled: boolean;
  remark?: string;
};

type ApiPointsPolicy = {
  id: string;
  name: string;
  mode: string;
  summary: string;
  input_per_1k?: number;
  output_per_1k?: number;
  per_chat?: number;
  per_image?: number;
  per_speech?: number;
  per_other?: number;
  enabled: boolean;
};

type CreateProviderPayload = {
  name: string;
  short: string;
  type: ProviderType;
  base_url: string;
  api_key: string;
  enabled: boolean;
  remark: string;
  models?: CreateModelPayload[];
};

type CreateModelPayload = {
  provider_id?: string;
  upstream_id: string;
  display_name?: string;
  group: string;
  capabilities: Capability[];
  context_window?: number;
};

type ApiModelRow = {
  id: string;
  provider_id: string;
  group: string;
  upstream_id: string;
  display_name: string;
  capabilities: Capability[];
  enabled: boolean;
  visibility: Visibility;
  default_role?: DefaultRole;
  sort_weight?: number;
  sse: boolean;
  context_window?: number;
  points_policy_id?: PointsPolicyId;
  points_policy_summary?: string;
  rpm?: number;
  tpm?: number;
  max_concurrency?: number;
  timeout_total_sec?: number;
  image_size?: string;
  image_quality?: string;
  smoke_status: SmokeStatus;
  smoke_latency_ms?: number;
  smoke_error?: string;
  smoke_error_type?: SmokeErrorType;
  smoke_error_detail?: string;
  health_status: HealthStatus;
  health_text: string;
  calls_7d: string;
};

const PAGE_TABS = [
  { value: 'providers', label: '供应商接入' },
  { value: 'models', label: '全部模型' },
  { value: 'policies', label: '积分策略' },
];

const MODEL_CATEGORY_TABS = [
  { value: 'text', label: '文字模型' },
  { value: 'image', label: '图片模型' },
  { value: 'speech', label: '语音模型' },
  { value: 'other', label: '其他模型' },
];

const REMOTE_TABS = [
  { value: 'all', label: '全部' },
  { value: 'chat', label: '对话' },
  { value: 'vision', label: '视觉' },
  { value: 'image', label: '生图' },
  { value: 'embedding', label: '嵌入' },
  { value: 'tool', label: '工具' },
];

const COLUMN_OPTIONS: { value: OptionalColumn; label: string }[] = [
  { value: 'type', label: '类型' },
  { value: 'sse', label: 'SSE' },
  { value: 'points', label: '积分策略' },
  { value: 'performance', label: '性能保护' },
  { value: 'calls', label: '7日调用' },
];

function groupBy<T extends { group: string }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    acc[item.group] ??= [];
    acc[item.group].push(item);
    return acc;
  }, {});
}

function capabilityLabel(c: Capability) {
  return ({ chat: '对话', vision: '视觉', image: '生图', embedding: '嵌入', tool: '工具', speech: '语音' } as const)[c];
}

function providerTypeLabel(type: ProviderType) {
  return (
    {
      openai_compatible: 'OpenAI 兼容',
      anthropic: 'Anthropic',
      google: 'Google',
      ollama: 'Ollama / 本地',
      replicate: 'Replicate',
      midjourney_proxy: 'MidJourney Proxy',
      comfyui: 'ComfyUI',
      custom: '自定义协议',
    } as const
  )[type];
}

function providerProtocolHint(type: ProviderType) {
  return (
    {
      openai_compatible: '使用 /v1/models 拉取模型，测试时走 OpenAI Chat / Images / Embeddings 兼容接口。',
      anthropic: '使用 Anthropic Messages 协议，模型列表和流式响应需要专用适配器。',
      google: '使用 Google Generative Language 协议，鉴权和模型路径由适配器处理。',
      ollama: '使用本地 Ollama 列表和生成接口，通常不需要 API Key。',
      replicate: '适合部分生图/多模态模型，多数任务是异步预测。',
      midjourney_proxy: '适合 MidJourney 代理，通常按任务轮询结果。',
      comfyui: '适合自托管工作流，生图参数来自工作流配置。',
      custom: '由后端自定义适配器决定拉取、测试和调用逻辑。',
    } as const
  )[type];
}

function providerRemark(provider?: Provider) {
  const remark = provider?.remark?.trim() ?? '';
  return remark;
}

function modelTypeLabel(capabilities: Capability[]) {
  if (capabilities.includes('image')) return '图片模型';
  if (capabilities.includes('speech')) return '语音模型';
  if (capabilities.includes('embedding')) return '嵌入模型';
  if (capabilities.includes('chat') || capabilities.includes('vision') || capabilities.includes('tool')) {
    return '文字模型';
  }
  return '模型';
}

function modelTypeClass(capabilities: Capability[]) {
  if (capabilities.includes('image')) return 'model-type model-type--image';
  if (capabilities.includes('speech')) return 'model-type model-type--image';
  if (capabilities.includes('embedding')) return 'model-type model-type--embedding';
  return 'model-type model-type--text';
}

function categoryForModel(model: ModelRow): ModelCategory {
  if (model.capabilities.includes('image')) return 'image';
  if (model.capabilities.includes('speech')) return 'speech';
  if (model.capabilities.includes('chat') || model.capabilities.includes('vision') || model.capabilities.includes('tool')) return 'text';
  return 'other';
}

function defaultRoleForCategory(category: ModelCategory): DefaultRole | undefined {
  if (category === 'text') return 'chat';
  if (category === 'image') return 'image';
  if (category === 'speech') return 'tts';
  return undefined;
}

function sortModelRows(items: ModelRow[], category?: ModelCategory) {
  const role = category ? defaultRoleForCategory(category) : undefined;
  return [...items].sort((a, b) => {
    const aDefault = role ? a.defaultRole === role : !!a.defaultRole;
    const bDefault = role ? b.defaultRole === role : !!b.defaultRole;
    if (aDefault !== bDefault) return aDefault ? -1 : 1;
    if ((a.sortWeight ?? 0) !== (b.sortWeight ?? 0)) return (b.sortWeight ?? 0) - (a.sortWeight ?? 0);
    return a.upstreamId.localeCompare(b.upstreamId);
  });
}

function visibilityLabel(v: Visibility) {
  return ({ draft: '未发布', public: '所有人', plus: '仅 Plus', admin: '仅管理员' } as const)[v];
}

function defaultRoleLabel(role?: DefaultRole) {
  if (!role) return '设默认';
  return ({ chat: '默认对话', image: '默认生图', embedding: '默认嵌入', tts: '默认语音' } as const)[role];
}

function defaultRoleForCapabilities(capabilities: Capability[]): DefaultRole | undefined {
  if (capabilities.includes('image')) return 'image';
  if (capabilities.includes('embedding')) return 'embedding';
  if (capabilities.includes('speech')) return 'tts';
  if (capabilities.includes('chat') || capabilities.includes('vision') || capabilities.includes('tool')) return 'chat';
  return undefined;
}

function supportsSse(capabilities: Capability[]) {
  return capabilities.includes('chat');
}

function isImageModel(model: ModelRow) {
  return model.capabilities.includes('image');
}

function policiesForModels(policies: PointsPolicyOption[], models: ModelRow[]) {
  const hasImage = models.some(isImageModel);
  return hasImage ? policies.filter((policy) => policy.mode === 'per_call') : policies;
}

function confirmImageSmokeTest(items: ModelRow[]) {
  const imageCount = items.filter(isImageModel).length;
  if (imageCount === 0) return true;
  return window.confirm(`已选择 ${imageCount} 个图片模型。图片模型连通性测试通常耗时更久，并且可能消耗上游生图额度，是否确认测试？`);
}

function pointsSummary(model: ModelRow) {
  return model.pointsPolicySummary ?? model.billingSummary ?? '默认策略';
}

function contextLabel(value?: number) {
  if (!value) return '—';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  return `${Math.round(value / 1000)}K`;
}

function providerColor(id: string) {
  return ({ openai: '#10A37F', nvidia: '#76B900', siliconflow: '#6366F1', anthropic: '#F59E0B', local: '#64748B' } as Record<string, string>)[id] ?? '#8B5CF6';
}

function providerFromApi(provider: ApiProvider): Provider {
  return {
    id: provider.id,
    name: provider.name,
    short: provider.short,
    type: provider.type,
    typeLabel: provider.type_label,
    baseUrl: provider.base_url,
    apiKey: provider.key_masked,
    enabled: provider.enabled,
    remark: provider.remark,
  };
}

function pointsPolicyFromApi(policy: ApiPointsPolicy): PointsPolicyOption {
  const tokenRate = (policy.input_per_1k ?? 0) + (policy.output_per_1k ?? 0);
  const mode: PointsPolicyMode = policy.mode === 'per_token' || tokenRate > 0 ? 'per_token' : 'per_call';
  return {
    id: policy.id,
    name: policy.name,
    mode,
    summary: policy.summary,
    inputPer1K: policy.input_per_1k ?? 0,
    outputPer1K: policy.output_per_1k ?? 0,
    perChat: policy.per_chat ?? 2,
    perImage: policy.per_image ?? 10,
    perSpeech: policy.per_speech ?? 2,
    perOther: policy.per_other ?? 1,
    enabled: policy.enabled,
  };
}

function policyPayload(policy: PointsPolicyOption) {
  return {
    id: policy.id,
    name: policy.name,
    mode: policy.mode,
    summary: policy.summary,
    input_per_1k: policy.mode === 'per_token' ? policy.inputPer1K : 0,
    output_per_1k: policy.mode === 'per_token' ? policy.outputPer1K : 0,
    per_chat: policy.mode === 'per_call' ? policy.perChat : 0,
    per_image: policy.mode === 'per_call' ? policy.perImage : 0,
    per_speech: policy.mode === 'per_call' ? policy.perSpeech : 0,
    per_other: policy.mode === 'per_call' ? policy.perOther : 0,
    enabled: policy.enabled,
  };
}

function modelFromApi(model: ApiModelRow): ModelRow {
  return {
    id: model.id,
    providerId: model.provider_id,
    group: model.group,
    upstreamId: model.upstream_id,
    displayName: model.display_name,
    capabilities: model.capabilities,
    enabled: model.enabled,
    visibility: model.visibility,
    defaultRole: model.default_role,
    sortWeight: model.sort_weight,
    sse: model.sse,
    contextWindow: model.context_window,
    smokeStatus: model.smoke_status,
    smokeLatencyMs: model.smoke_latency_ms,
    smokeError: model.smoke_error,
    smokeErrorType: model.smoke_error_type,
    smokeErrorDetail: model.smoke_error_detail,
    healthStatus: model.health_status,
    healthText: model.health_text,
    pointsPolicyId: model.points_policy_id,
    pointsPolicySummary: model.points_policy_summary,
    rpm: model.rpm,
    tpm: model.tpm,
    maxConcurrency: model.max_concurrency,
    timeoutTotalSec: model.timeout_total_sec,
    imageParams: model.image_size || model.image_quality ? { size: model.image_size, quality: model.image_quality } : undefined,
    calls7d: model.calls_7d,
  };
}

function apiPatchFromModelPatch(patch: Partial<ModelRow>) {
  return {
    display_name: patch.displayName,
    enabled: patch.enabled,
    visibility: patch.visibility,
    default_role: patch.defaultRole,
    sort_weight: patch.sortWeight,
    sse: patch.sse,
    points_policy_id: patch.pointsPolicyId,
    image_size: patch.imageParams?.size,
    image_quality: patch.imageParams?.quality,
  };
}

function smokeErrorTypeLabel(type?: SmokeErrorType) {
  if (!type) return '失败';
  return (
    {
      auth: '401 Key',
      permission: '403 权限',
      not_found: '404 模型',
      rate_limit: '429 限流',
      upstream: '上游错误',
      timeout: '超时',
      network: '网络错误',
      format: '格式错误',
    } as const
  )[type];
}

function smokeLabel(m: ModelRow) {
  if (m.smokeStatus === 'testing') return '测试中...';
  if (m.smokeStatus === 'ok') {
    const latency = m.smokeLatencyMs ?? 0;
    return latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(2)}s`;
  }
  if (m.smokeStatus === 'timeout') return smokeErrorTypeLabel(m.smokeErrorType ?? 'timeout');
  if (m.smokeStatus === 'error') return smokeErrorTypeLabel(m.smokeErrorType);
  return '未测试';
}

function smokeTitle(m: ModelRow) {
  if (m.smokeStatus === 'ok') return `连通正常,延迟 ${smokeLabel(m)}`;
  if (m.smokeStatus === 'testing') return '正在测试';
  return m.smokeErrorDetail || m.smokeError || smokeLabel(m);
}

function smokeClass(s: SmokeStatus) {
  if (s === 'ok') return 'model-smoke model-smoke--ok';
  if (s === 'timeout' || s === 'error') return 'model-smoke model-smoke--err';
  if (s === 'testing') return 'model-smoke model-smoke--testing';
  return 'model-smoke';
}

function healthClass(s: HealthStatus) {
  if (s === 'healthy') return 'dot-state dot-state--ok';
  if (s === 'fluctuating' || s === 'degraded' || s === 'insufficient') return 'dot-state dot-state--warn';
  if (s === 'abnormal') return 'dot-state dot-state--err';
  return 'dot-state';
}

function healthText(model: ModelRow) {
  if (model.healthStatus === 'idle' || model.healthStatus === 'unused') return '未调用';
  if (model.healthStatus === 'insufficient') return '数据不足';
  const text = normalizeHealthSeconds(model.healthText);
  if (model.healthStatus === 'degraded' || model.healthStatus === 'fluctuating') return `波动 · ${text}`;
  if (model.healthStatus === 'abnormal') return `异常 · ${text}`;
  return `健康 · ${text}`;
}

function normalizeHealthSeconds(text: string) {
  return text.replace(/(\d+(?:\.\d+)?)ms/g, (_, value: string) => `${(Number(value) / 1000).toFixed(2)}s`);
}

function modelFromRemote(providerId: string, remote: RemoteModel): ModelRow {
  const id = `${providerId}-${remote.id}`.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const isImage = remote.capabilities.includes('image');
  const parts = remote.id.split('/');
  return {
    id,
    providerId,
    group: remote.group,
    upstreamId: remote.id,
    displayName: remote.displayName ?? parts[parts.length - 1] ?? remote.id,
    capabilities: remote.capabilities,
    enabled: true,
    visibility: 'draft',
    sortWeight: 100,
    sse: supportsSse(remote.capabilities),
    contextWindow: remote.contextWindow,
    smokeStatus: 'untested',
    healthStatus: 'unused',
    healthText: '未调用',
    pointsPolicyId: 'default_call',
    pointsPolicySummary: '默认按次策略',
    rpm: isImage ? 30 : 300,
    tpm: isImage ? undefined : 20000,
    maxConcurrency: isImage ? 4 : 12,
    timeoutTotalSec: isImage ? 180 : 90,
    imageParams: isImage ? { count: 1, asyncMode: false } : undefined,
    calls7d: '0',
  };
}

export const ModelServicePage: FC = () => {
  const [tab, setTab] = useState<PageTab>('providers');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [pointsPolicies, setPointsPolicies] = useState<PointsPolicyOption[]>([]);
  const [providerKeyword, setProviderKeyword] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [modelKeyword, setModelKeyword] = useState('');
  const [modelCategory, setModelCategory] = useState<ModelCategory>('text');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteTab, setRemoteTab] = useState('all');
  const [remoteKeyword, setRemoteKeyword] = useState('');
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [selectedRemoteIds, setSelectedRemoteIds] = useState<string[]>([]);
  const [configModel, setConfigModel] = useState<ModelRow | null>(null);
  const [bulkVisibilityOpen, setBulkVisibilityOpen] = useState(false);
  const [bulkPointsOpen, setBulkPointsOpen] = useState(false);
  const [manualModelOpen, setManualModelOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [smokeDetailModel, setSmokeDetailModel] = useState<ModelRow | null>(null);
  const [defaultGuardMessage, setDefaultGuardMessage] = useState('');
  const [editingPolicy, setEditingPolicy] = useState<PointsPolicyOption | null>(null);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const [dragModelId, setDragModelId] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<OptionalColumn[]>([]);
  const [syncError, setSyncError] = useState('');

  const reloadAdminModelData = async () => {
    const [providerRes, modelRes, policyRes] = await Promise.all([
      apiGet<{ providers: ApiProvider[] }>('/api/admin/providers'),
      apiGet<{ models: ApiModelRow[] }>('/api/admin/models'),
      apiGet<{ policies: ApiPointsPolicy[] }>('/api/admin/points-policies'),
    ]);
    const nextProviders = providerRes.providers.map(providerFromApi);
    const nextModels = modelRes.models.map(modelFromApi);
    const nextPolicies = policyRes.policies.map(pointsPolicyFromApi);
    setProviders(nextProviders);
    setModels(nextModels);
    setPointsPolicies(nextPolicies);
    setSelectedProviderId((current) => nextProviders.some((provider) => provider.id === current) ? current : nextProviders[0]?.id ?? '');
    setSyncError('');
  };

  useEffect(() => {
    reloadAdminModelData().catch((err) => {
      setSyncError(err instanceof Error ? err.message : '后台模型服务接口暂不可用');
    });
  }, []);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? providers[0];
  const providerModels = selectedProvider ? models.filter((m) => m.providerId === selectedProvider.id) : [];
  const providerGroups = groupBy(providerModels);

  const filteredProviders = useMemo(() => {
    const k = providerKeyword.trim().toLowerCase();
    if (!k) return providers;
    return providers.filter(
      (p) => p.name.toLowerCase().includes(k) || p.baseUrl.toLowerCase().includes(k),
    );
  }, [providerKeyword, providers]);

  const filteredModels = useMemo(() => {
    const k = modelKeyword.trim().toLowerCase();
    return sortModelRows(models.filter((m) => {
      const byCategory = categoryForModel(m) === modelCategory;
      const byCapability = capabilityFilter === 'all' || m.capabilities.includes(capabilityFilter as Capability);
      const byProvider = providerFilter === 'all' || m.providerId === providerFilter;
      const byVisibility = visibilityFilter === 'all' || m.visibility === visibilityFilter;
      const provider = providers.find((p) => p.id === m.providerId);
      const byKeyword =
        !k ||
        m.displayName.toLowerCase().includes(k) ||
        m.upstreamId.toLowerCase().includes(k) ||
        provider?.name.toLowerCase().includes(k);
      return byCategory && byCapability && byProvider && byVisibility && byKeyword;
    }), modelCategory);
  }, [capabilityFilter, modelCategory, modelKeyword, models, providerFilter, providers, visibilityFilter]);

  const toggleProvider = (id: string) => {
    const current = providers.find((p) => p.id === id);
    if (!current) return;
    const enabled = !current.enabled;
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, enabled } : p)));
    apiPatch<{ provider: ApiProvider }>(`/api/admin/providers/${id}`, { enabled })
      .then((res) => {
        setProviders((prev) => prev.map((p) => (p.id === id ? providerFromApi(res.provider) : p)));
        setSyncError('');
      })
      .catch((err) => setSyncError(err instanceof Error ? err.message : '供应商状态保存失败'));
  };

  const patchModel = async (id: string, patch: Partial<ModelRow>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    try {
      const res = await apiPatch<{ model: ApiModelRow }>(`/api/admin/models/${id}`, apiPatchFromModelPatch(patch));
      setModels((prev) => prev.map((m) => (m.id === id ? modelFromApi(res.model) : m)));
      setSyncError('');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '模型配置保存失败');
    }
  };

  const toggleModel = (id: string) => {
    const current = models.find((m) => m.id === id);
    if (!current) return;
    void patchModel(id, { enabled: !current.enabled });
  };

  const markSmokeTesting = (ids: string[]) => {
    setModels((prev) =>
      prev.map((m) =>
        ids.includes(m.id)
          ? { ...m, smokeStatus: 'testing', smokeError: undefined, smokeErrorType: undefined, smokeErrorDetail: undefined }
          : m,
      ),
    );
  };

  const setSmokeTesting = (ids: string[]) => {
    const items = models.filter((model) => ids.includes(model.id));
    if (!confirmImageSmokeTest(items)) return;
    markSmokeTesting(ids);
    ids.forEach((id) => {
      apiPost<{ model: ApiModelRow }>(`/api/admin/models/${id}/test`, {})
        .then((res) => {
          setModels((prev) => prev.map((m) => (m.id === id ? modelFromApi(res.model) : m)));
          setSyncError('');
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : '测试失败';
          setModels((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    smokeStatus: 'error',
                    smokeLatencyMs: undefined,
                    smokeError: message,
                    smokeErrorType: 'upstream',
                    smokeErrorDetail: message,
                  }
                : m,
            ),
          );
        });
    });
  };

  const testCurrentProvider = () => {
    if (!selectedProvider) return;
    const testableModels = providerModels.filter((model) => !isImageModel(model));
    if (testableModels.length === 0) {
      setSyncError('当前供应商只有图片模型，图片模型请单独点击测试。');
      return;
    }
    markSmokeTesting(testableModels.map((m) => m.id));
    apiPost<{ models: ApiModelRow[] }>(`/api/admin/providers/${selectedProvider.id}/test-models`, {})
      .then((res) => {
        const updated = new Map(res.models.map((model) => [model.id, modelFromApi(model)]));
        setModels((prev) => prev.map((model) => updated.get(model.id) ?? model));
        setSyncError('');
      })
      .catch(() => undefined);
  };

  const discoverSelectedProviderModels = async () => {
    if (!selectedProvider) return;
    setRemoteOpen(true);
    setRemoteLoading(true);
    setRemoteError('');
    setRemoteModels([]);
    setSelectedRemoteIds([]);
    setRemoteTab('all');
    setRemoteKeyword('');
    try {
      const res = await apiPost<{ models: RemoteModel[] }>(`/api/admin/providers/${selectedProvider.id}/discover-models`, {});
      const imported = new Set(models.filter((model) => model.providerId === selectedProvider.id).map((model) => model.upstreamId));
      setRemoteModels(res.models);
      setSelectedRemoteIds(res.models.filter((model) => imported.has(model.id)).map((model) => model.id));
      setSyncError('');
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : '获取供应商模型失败');
    } finally {
      setRemoteLoading(false);
    }
  };

  const createModel = async (remote: RemoteModel) => {
    if (!selectedProvider) throw new Error('请先选择供应商');
    const payload: CreateModelPayload = {
      provider_id: selectedProvider.id,
      upstream_id: remote.id,
      display_name: remote.displayName,
      group: remote.group,
      capabilities: remote.capabilities,
      context_window: remote.contextWindow,
    };
    const res = await apiPost<{ model: ApiModelRow }>('/api/admin/models', payload);
    return modelFromApi(res.model);
  };

  const importSelectedRemote = () => {
    if (!selectedProvider) return;
    const providerImported = new Map(providerModels.map((model) => [model.upstreamId, model.id]));
    const selectedSet = new Set(selectedRemoteIds);
    const selected = remoteModels
      .filter((m) => selectedSet.has(m.id))
      .filter((m) => !providerImported.has(m.id));
    const removed = remoteModels
      .filter((model) => providerImported.has(model.id) && !selectedSet.has(model.id))
      .map((model) => providerImported.get(model.id))
      .filter((id): id is string => !!id);
    const optimistic = selected.map((m) => modelFromRemote(selectedProvider.id, m));
    setModels((prev) => [...prev.filter((model) => !removed.includes(model.id)), ...optimistic]);
    Promise.all([
      ...selected.map((model) => createModel(model)),
      ...removed.map((id) => apiDelete(`/api/admin/models/${id}`).then(() => null)),
    ])
      .then((created) => {
        const createdModels = created.filter((item): item is ModelRow => !!item && typeof item === 'object' && 'upstreamId' in item);
        setModels((prev) => {
          const withoutOptimistic = prev.filter((model) => !optimistic.some((item) => item.id === model.id));
          return [...withoutOptimistic, ...createdModels];
        });
        setSyncError('');
      })
      .catch((err) => {
        setSyncError(err instanceof Error ? err.message : '保存模型选择失败');
        void reloadAdminModelData();
      });
    setRemoteOpen(false);
    setSelectedRemoteIds([]);
    setRemoteKeyword('');
  };

  const selectAllVisible = (checked: boolean) => {
    setSelectedIds(checked ? filteredModels.map((m) => m.id) : []);
  };

  const updateSelectedModels = async (patch: Partial<ModelRow>) => {
    setModels((prev) => prev.map((m) => (selectedIds.includes(m.id) ? { ...m, ...patch } : m)));
    await Promise.all(selectedIds.map((id) => apiPatch(`/api/admin/models/${id}`, apiPatchFromModelPatch(patch)).catch(() => null)));
    void reloadAdminModelData();
  };

  const commitSortWeight = (model: ModelRow, value: string) => {
    const sortWeight = Number(value);
    if (!Number.isFinite(sortWeight) || sortWeight === (model.sortWeight ?? 100)) return;
    void patchModel(model.id, { sortWeight });
  };

  const reorderModels = (dragId: string, targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = filteredModels.findIndex((model) => model.id === dragId);
    const to = filteredModels.findIndex((model) => model.id === targetId);
    if (from < 0 || to < 0) return;
    const ordered = [...filteredModels];
    const [dragged] = ordered.splice(from, 1);
    ordered.splice(to, 0, dragged);
    const topWeight = Math.max(1000, ...models.filter((model) => categoryForModel(model) === modelCategory).map((model) => model.sortWeight ?? 0));
    const updates = ordered.map((model, index) => ({ ...model, sortWeight: topWeight + (ordered.length - index) * 10 }));
    const updateMap = new Map(updates.map((model) => [model.id, model]));
    setModels((prev) => prev.map((model) => updateMap.get(model.id) ?? model));
    Promise.all(updates.map((model) => apiPatch(`/api/admin/models/${model.id}`, apiPatchFromModelPatch({ sortWeight: model.sortWeight })).catch(() => null)))
      .then(() => {
        if (updates[0]?.id === dragId) {
          setDefaultModel(updates[0]);
        } else {
          void reloadAdminModelData();
        }
      })
      .catch(() => void reloadAdminModelData());
  };

  const savePolicy = (policy: PointsPolicyOption) => {
    const payload = policyPayload(policy);
    const request = editingPolicy
      ? apiPatch<{ policy: ApiPointsPolicy }>(`/api/admin/points-policies/${editingPolicy.id}`, payload)
      : apiPost<{ policy: ApiPointsPolicy }>('/api/admin/points-policies', payload);
    request
      .then((res) => {
        const next = pointsPolicyFromApi(res.policy);
        setPointsPolicies((prev) => [...prev.filter((item) => item.id !== next.id), next].sort((a, b) => a.id.localeCompare(b.id)));
        setPolicyEditorOpen(false);
        setEditingPolicy(null);
        setSyncError('');
      })
      .catch((err) => setSyncError(err instanceof Error ? err.message : '积分策略保存失败'));
  };

  const setDefaultModel = (model: ModelRow) => {
    const role = defaultRoleForCapabilities(model.capabilities);
    if (!role) return;
    if (model.visibility !== 'public') {
      setDefaultGuardMessage('只有“所有人可见”的模型才能设置为默认模型。请先把该模型的可见性改为“所有人可见”，再设置默认模型。');
      return;
    }
    setModels((prev) => prev.map((m) => ({ ...m, defaultRole: m.id === model.id ? role : m.defaultRole === role ? undefined : m.defaultRole })));
    apiPost<{ model: ApiModelRow }>(`/api/admin/models/${model.id}/set-default`, { role })
      .then((res) => {
        setModels((prev) => prev.map((m) => (m.id === model.id ? modelFromApi(res.model) : m.defaultRole === role ? { ...m, defaultRole: undefined } : m)));
        setSyncError('');
      })
      .catch((err) => setSyncError(err instanceof Error ? err.message : '设置默认模型失败'));
  };

  const addManualModel = (remote: RemoteModel) => {
    if (!selectedProvider) return;
    const next = modelFromRemote(selectedProvider.id, remote);
    setModels((prev) => [...prev, next]);
    createModel(remote)
      .then((created) => {
        setModels((prev) => prev.map((model) => (model.id === next.id ? created : model)));
        setSyncError('');
      })
      .catch((err) => setSyncError(err instanceof Error ? err.message : '手动添加模型失败'));
    setManualModelOpen(false);
    setRemoteOpen(false);
  };

  const toggleColumn = (column: OptionalColumn) => {
    setVisibleColumns((prev) => (prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]));
  };

  const selectedCount = selectedIds.length;

  return (
    <div className="admin-page admin-page--model-service">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">模型服务</h1>
          <div className="admin-page__subtitle">
            供应商接入保持简单直观,模型运营策略集中在全部模型中统一管理
          </div>
        </div>
        <button type="button" className="c-btn c-btn--primary" onClick={() => setAddProviderOpen(true)}>
          <Plus size={16} />新增供应商
        </button>
      </div>

      <Tabs items={PAGE_TABS} value={tab} onChange={(value) => setTab(value as PageTab)} />
      {syncError && (
        <div className="model-test-notice" style={{ marginTop: 12 }}>
          <Info size={18} />
          <span>{syncError}</span>
        </div>
      )}

      {tab === 'providers' && (
        <div className="model-service-layout">
          <aside className="provider-panel">
            <div className="c-search provider-panel__search">
              <span className="icon-search">
                <Search size={16} />
              </span>
              <input
                className="c-input c-input--sm"
                placeholder="搜索供应商..."
                value={providerKeyword}
                onChange={(e) => setProviderKeyword(e.target.value)}
              />
            </div>
            <div className="provider-list">
              {filteredProviders.map((provider) => (
                <button
                  type="button"
                  className={`provider-item${provider.id === selectedProvider?.id ? ' is-active' : ''}`}
                  key={provider.id}
                  onClick={() => setSelectedProviderId(provider.id)}
                >
                  <span className="provider-item__avatar" style={{ background: providerColor(provider.id) }}>
                    {provider.short}
                  </span>
                  <span className="provider-item__body">
                    <span className="provider-item__name">{provider.name}</span>
                    <span className="provider-item__type">{provider.typeLabel}</span>
                  </span>
                  <span className={`provider-item__state${provider.enabled ? ' is-on' : ''}`}>
                    {provider.enabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              ))}
              {filteredProviders.length === 0 && (
                <div className="u-caption" style={{ padding: 16 }}>
                  暂无供应商
                </div>
              )}
            </div>
            <button type="button" className="provider-add" onClick={() => setAddProviderOpen(true)}>
              <Plus size={14} />添加
            </button>
          </aside>

          <section className="provider-detail">
            <div className="provider-detail__header">
              <div>
                <div className="provider-detail__title">
                  {selectedProvider?.name ?? '暂无供应商'}
                  <span className="u-caption" style={{ marginLeft: 8 }}>
                    {selectedProvider?.typeLabel ?? '请先新增供应商'}
                  </span>
                </div>
                <div className="provider-detail__desc">{providerRemark(selectedProvider) || '新增供应商后即可导入模型并进行测试。'}</div>
                <div className="provider-detail__hint">{selectedProvider ? providerProtocolHint(selectedProvider.type) : '供应商密钥只在后端保存。'}</div>
              </div>
              <label className="c-switch">
                <input
                  type="checkbox"
                  checked={selectedProvider?.enabled ?? false}
                  disabled={!selectedProvider}
                  onChange={() => selectedProvider && toggleProvider(selectedProvider.id)}
                />
                <span className="c-switch__slider" />
              </label>
            </div>

            <div className="provider-config-card">
              <div className="form-grid form-grid--2">
                <div className="c-field">
                  <label className="c-label">API 密钥</label>
                  <input className="c-input" type="password" value={selectedProvider?.apiKey ?? ''} readOnly />
                  <span className="c-help">密钥仅后端保存,前端不落明文。</span>
                </div>
                <div className="c-field">
                  <label className="c-label">API 地址</label>
                  <input className="c-input" value={selectedProvider?.baseUrl ?? ''} readOnly />
                  <span className="c-help">例如 /v1/chat/completions 将由协议适配器自动拼接。</span>
                </div>
              </div>
            </div>

            <div className="provider-model-toolbar">
              <div>
                <div className="provider-model-toolbar__title">模型</div>
                <div className="u-caption">共 {providerModels.length} 个已导入模型</div>
              </div>
              <div className="provider-model-toolbar__actions">
                <button type="button" className="c-btn c-btn--secondary" disabled={!selectedProvider} onClick={discoverSelectedProviderModels}>
                  <Plus size={15} />添加模型
                </button>
                <button type="button" className="c-btn c-btn--primary" disabled={!selectedProvider} onClick={testCurrentProvider}>
                  <Zap size={15} />测试当前供应商非图片模型
                </button>
              </div>
            </div>

            <div className="provider-model-list">
              {Object.entries(providerGroups).map(([group, rows]) => (
                <div className="model-group" key={group}>
                  <div className="model-group__head">
                    <span>{group}</span>
                    <span className="c-badge c-badge--brand">{rows.length}</span>
                  </div>
                  {rows.map((model) => (
                    <div className="provider-model-row" key={model.id}>
                      <div className="provider-model-row__main">
                        <div className="model-title-line">
                          <code>{model.upstreamId}</code>
                          <span className={modelTypeClass(model.capabilities)}>{modelTypeLabel(model.capabilities)}</span>
                        </div>
                        <div className="provider-model-row__meta">
                          <span>{modelTypeLabel(model.capabilities)}</span>
                          {model.contextWindow ? <span>{contextLabel(model.contextWindow)}</span> : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={smokeClass(model.smokeStatus)}
                        title={smokeTitle(model)}
                        disabled={!model.smokeErrorDetail && !model.smokeError && model.smokeStatus !== 'error' && model.smokeStatus !== 'timeout'}
                        onClick={() => setSmokeDetailModel(model)}
                      >
                        {model.smokeStatus === 'testing' && <Loader2 size={13} className="u-spin" />}
                        {model.smokeStatus === 'ok' && <CheckCircle2 size={13} />}
                        {(model.smokeStatus === 'timeout' || model.smokeStatus === 'error') && <XCircle size={13} />}
                        {model.smokeStatus === 'untested' && <Clock3 size={13} />}
                        {smokeLabel(model)}
                      </button>
                      <span className="provider-model-row__right">
                        <button
                          type="button"
                          className="c-btn c-btn--ghost c-btn--sm"
                          onClick={() => setSmokeTesting([model.id])}
                        >
                          测试
                        </button>
                        <button
                          type="button"
                          className="c-icon-btn c-icon-btn--sm"
                          title="配置"
                          onClick={() => setConfigModel(model)}
                        >
                          <Settings2 size={14} />
                        </button>
                        <label className="c-switch">
                          <input type="checkbox" checked={model.enabled} onChange={() => toggleModel(model.id)} />
                          <span className="c-switch__slider" />
                        </label>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {selectedProvider && providerModels.length === 0 && (
                <div className="u-caption" style={{ padding: 16 }}>
                  当前供应商暂无已导入模型
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'models' && (
        <>
          <div style={{ marginTop: 16 }}>
            <Tabs
              items={MODEL_CATEGORY_TABS}
              value={modelCategory}
              onChange={(value) => {
                setModelCategory(value as ModelCategory);
                setSelectedIds([]);
              }}
            />
          </div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <div className="toolbar__left">
              <div className="c-search">
                <span className="icon-search">
                  <Search size={16} />
                </span>
                <input
                  className="c-input"
                  placeholder="搜索模型、Provider..."
                  value={modelKeyword}
                  onChange={(e) => setModelKeyword(e.target.value)}
                />
              </div>
              <select className="c-select" style={{ width: 140 }} value={capabilityFilter} onChange={(e) => setCapabilityFilter(e.target.value)}>
                <option value="all">全部能力</option>
                <option value="chat">对话</option>
                <option value="vision">视觉</option>
                <option value="image">生图</option>
                <option value="embedding">嵌入</option>
                <option value="tool">工具</option>
              </select>
              <select className="c-select" style={{ width: 160 }} value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
                <option value="all">全部供应商</option>
                {providers.map((provider) => (
                  <option value={provider.id} key={provider.id}>{provider.name}</option>
                ))}
              </select>
              <select className="c-select" style={{ width: 140 }} value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}>
                <option value="all">全部可见性</option>
                <option value="draft">未发布</option>
                <option value="public">所有人</option>
                <option value="plus">仅 Plus</option>
                <option value="admin">仅管理员</option>
              </select>
            </div>
            <div className="toolbar__right">
              <button type="button" className="c-btn c-btn--secondary" onClick={() => setColumnsOpen(true)}>
                <Columns3 size={15} />列设置
              </button>
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="bulk-action-bar">
              <span>已选 {selectedCount} 个模型</span>
              <button type="button" className="c-btn c-btn--secondary c-btn--sm" onClick={() => updateSelectedModels({ enabled: true })}>启用</button>
              <button type="button" className="c-btn c-btn--secondary c-btn--sm" onClick={() => updateSelectedModels({ enabled: false })}>停用</button>
              <button type="button" className="c-btn c-btn--secondary c-btn--sm" onClick={() => setBulkVisibilityOpen(true)}>设置可见性</button>
              <button type="button" className="c-btn c-btn--secondary c-btn--sm" onClick={() => setBulkPointsOpen(true)}>设置积分策略</button>
              <button type="button" className="c-btn c-btn--secondary c-btn--sm" onClick={() => setSmokeTesting(selectedIds)}>批量测试</button>
              <button type="button" className="c-btn c-btn--ghost c-btn--sm" onClick={() => setSelectedIds([])}>取消选择</button>
            </div>
          )}

          <div className="c-table-wrap">
            <table className="c-table model-service-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={filteredModels.length > 0 && selectedIds.length === filteredModels.length}
                      onChange={(e) => selectAllVisible(e.target.checked)}
                    />
                  </th>
                  <th>模型</th>
                  <th>供应商</th>
                  {visibleColumns.includes('type') && <th>类型</th>}
                  <th>连通性</th>
                  <th>真实健康</th>
                  <th>可见性</th>
                  <th>默认</th>
                  <th>权重</th>
                  {visibleColumns.includes('sse') && <th>SSE</th>}
                  {visibleColumns.includes('points') && <th>积分策略</th>}
                  {visibleColumns.includes('performance') && <th>性能</th>}
                  {visibleColumns.includes('calls') && <th>7日调用</th>}
                  <th>状态</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((model) => {
                  const provider = providers.find((p) => p.id === model.providerId);
                  const selected = selectedIds.includes(model.id);
                  const role = defaultRoleForCategory(modelCategory);
                  const categoryModels = sortModelRows(models.filter((item) => categoryForModel(item) === modelCategory), modelCategory);
                  const hasExplicitDefault = role ? categoryModels.some((item) => item.defaultRole === role) : false;
                  const isEffectiveDefault = !!role && (model.defaultRole === role || (!hasExplicitDefault && categoryModels[0]?.id === model.id));
                  return (
                    <tr
                      key={model.id}
                      draggable
                      onDragStart={() => setDragModelId(model.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderModels(dragModelId, model.id);
                        setDragModelId('');
                      }}
                    >
                      <td className="model-drag-cell" title="拖动调整排序">
                        <GripVertical size={16} />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, model.id] : prev.filter((id) => id !== model.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="model-name-cell">
                          <div className="model-title-line">
                            <strong>{model.upstreamId}</strong>
                            <span className={modelTypeClass(model.capabilities)}>{modelTypeLabel(model.capabilities)}</span>
                          </div>
                          <code>{provider?.name ?? model.providerId}</code>
                          <div className="model-cap-list">
                            {model.capabilities.map((cap) => (
                              <span key={cap}>{capabilityLabel(cap)}</span>
                            ))}
                            <span>{contextLabel(model.contextWindow)}</span>
                          </div>
                        </div>
                      </td>
                      <td>{provider?.name ?? '—'}</td>
                      {visibleColumns.includes('type') && <td>{modelTypeLabel(model.capabilities)}</td>}
                      <td>
                        <button
                          type="button"
                          className={smokeClass(model.smokeStatus)}
                          title={smokeTitle(model)}
                          disabled={!model.smokeErrorDetail && !model.smokeError && model.smokeStatus !== 'error' && model.smokeStatus !== 'timeout'}
                          onClick={() => setSmokeDetailModel(model)}
                        >
                          {smokeLabel(model)}
                          {(model.smokeStatus === 'timeout' || model.smokeStatus === 'error') && model.smokeErrorDetail ? <Info size={12} /> : null}
                        </button>
                      </td>
                      <td>
                        <span className={healthClass(model.healthStatus)}>{healthText(model)}</span>
                      </td>
                      <td>{visibilityLabel(model.visibility)}</td>
                      <td>
                        <button type="button" className={`default-pill${isEffectiveDefault ? ' is-on' : ''}`} onClick={() => setDefaultModel(model)}>
                          {isEffectiveDefault ? <Star size={12} /> : null}
                          {isEffectiveDefault ? defaultRoleLabel(role) : defaultRoleLabel(undefined)}
                        </button>
                      </td>
                      <td>
                        <input
                          className="model-weight-input"
                          type="number"
                          defaultValue={model.sortWeight ?? 100}
                          onBlur={(event) => commitSortWeight(model, event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                        />
                      </td>
                      {visibleColumns.includes('sse') && <td>{supportsSse(model.capabilities) ? (model.sse ? '开启' : '关闭') : '—'}</td>}
                      {visibleColumns.includes('points') && <td>{pointsSummary(model)}</td>}
                      {visibleColumns.includes('performance') && (
                        <td>
                          <div className="u-caption">
                            {model.rpm ?? '—'} RPM / {model.tpm ?? '—'} TPM
                          </div>
                          <div className="u-caption">{model.timeoutTotalSec ?? '—'}s · 并发 {model.maxConcurrency ?? '—'}</div>
                        </td>
                      )}
                      {visibleColumns.includes('calls') && <td>{model.calls7d}</td>}
                      <td>
                        <label className="c-switch">
                          <input type="checkbox" checked={model.enabled} onChange={() => toggleModel(model.id)} />
                          <span className="c-switch__slider" />
                        </label>
                      </td>
                      <td className="col-actions">
                        <button type="button" className="c-icon-btn c-icon-btn--sm" title="测试" onClick={() => setSmokeTesting([model.id])}>
                          <FlaskConical size={14} />
                        </button>
                        <button type="button" className="c-icon-btn c-icon-btn--sm" title="配置" onClick={() => setConfigModel(model)}>
                          <SlidersHorizontal size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredModels.length === 0 && (
                  <tr>
                    <td colSpan={15} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                      暂无模型数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'policies' && (
        <section className="points-policy-panel">
          <div className="provider-model-toolbar">
            <div>
              <div className="provider-model-toolbar__title">积分策略</div>
              <div className="u-caption">策略只保留“按次”和“按 Token”两种计费方式，模型在配置中选择策略。</div>
            </div>
            <button
              type="button"
              className="c-btn c-btn--primary"
              onClick={() => {
                setEditingPolicy(null);
                setPolicyEditorOpen(true);
              }}
            >
              <Plus size={15} />新增策略
            </button>
          </div>
          <div className="c-table-wrap">
            <table className="c-table points-policy-table">
              <thead>
                <tr>
                  <th>策略</th>
                  <th>计费方式</th>
                  <th>扣费</th>
                  <th>说明</th>
                  <th>状态</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {pointsPolicies.map((policy) => (
                  <tr key={policy.id}>
                    <td>
                      <strong>{policy.name}</strong>
                      <div className="u-caption">{policy.id}</div>
                    </td>
                    <td>{policy.mode === 'per_token' ? '按 Token' : '按次'}</td>
                    <td>
                      {policy.mode === 'per_token'
                        ? `输入 ${policy.inputPer1K}/千Token · 输出 ${policy.outputPer1K}/千Token`
                        : `文字 ${policy.perChat} · 图片 ${policy.perImage} · 语音 ${policy.perSpeech} · 其他 ${policy.perOther}`}
                    </td>
                    <td>{policy.summary}</td>
                    <td>{policy.enabled ? '启用' : '停用'}</td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="c-icon-btn c-icon-btn--sm"
                        title="编辑"
                        onClick={() => {
                          setEditingPolicy(policy);
                          setPolicyEditorOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {pointsPolicies.length === 0 && (
                  <tr>
                    <td colSpan={6} className="u-caption" style={{ textAlign: 'center', padding: 24 }}>
                      暂无积分策略
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AddProviderModal
        open={addProviderOpen}
        onClose={() => setAddProviderOpen(false)}
        onAdd={(payload) => {
          apiPost<{ provider: ApiProvider; models?: ApiModelRow[] }>('/api/admin/providers', payload)
            .then((res) => {
              const provider = providerFromApi(res.provider);
              setProviders((prev) => [...prev.filter((item) => item.id !== provider.id), provider]);
              const importedModels = res.models?.map(modelFromApi) ?? [];
              if (importedModels.length > 0) {
                setModels((prev) => [
                  ...prev.filter((item) => !importedModels.some((model) => model.id === item.id)),
                  ...importedModels,
                ]);
              }
              setSelectedProviderId(provider.id);
              setAddProviderOpen(false);
              setSyncError('');
            })
            .catch((err) => setSyncError(err instanceof Error ? err.message : '新增供应商失败'));
        }}
      />

      <RemoteModelModal
        open={remoteOpen}
        onClose={() => setRemoteOpen(false)}
        providerName={selectedProvider?.name ?? '暂无供应商'}
        remoteModels={remoteModels}
        loading={remoteLoading}
        error={remoteError}
        selectedRemoteIds={selectedRemoteIds}
        remoteTab={remoteTab}
        remoteKeyword={remoteKeyword}
        importedKeys={selectedProvider ? new Set(models.filter((m) => m.providerId === selectedProvider.id).map((m) => m.upstreamId)) : new Set()}
        onRemoteTabChange={setRemoteTab}
        onRemoteKeywordChange={setRemoteKeyword}
        onRefresh={discoverSelectedProviderModels}
        onManualAdd={() => setManualModelOpen(true)}
        onToggle={(id) =>
          setSelectedRemoteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
        }
        onConfirm={importSelectedRemote}
      />

      <ManualModelModal
        open={manualModelOpen}
        onClose={() => setManualModelOpen(false)}
        providerName={selectedProvider?.name ?? '暂无供应商'}
        onAdd={addManualModel}
      />

      <ModelConfigModal
        model={configModel}
        policies={pointsPolicies}
        onClose={() => setConfigModel(null)}
        onSave={(patch: Partial<ModelRow>) => {
          if (!configModel) return;
          void patchModel(configModel.id, patch);
          setConfigModel(null);
        }}
      />

      <BulkVisibilityModal
        open={bulkVisibilityOpen}
        count={selectedCount}
        onClose={() => setBulkVisibilityOpen(false)}
        onApply={(visibility) => {
          updateSelectedModels({ visibility });
          setBulkVisibilityOpen(false);
        }}
      />

      <BulkPointsModal
        open={bulkPointsOpen}
        count={selectedCount}
        models={models.filter((model) => selectedIds.includes(model.id))}
        policies={pointsPolicies}
        onClose={() => setBulkPointsOpen(false)}
        onApply={(patch: Partial<ModelRow>) => {
          updateSelectedModels(patch);
          setBulkPointsOpen(false);
        }}
      />

      <ColumnSettingsModal
        open={columnsOpen}
        visibleColumns={visibleColumns}
        onClose={() => setColumnsOpen(false)}
        onToggle={toggleColumn}
      />

      <PolicyEditorModal
        open={policyEditorOpen}
        policy={editingPolicy}
        onClose={() => {
          setPolicyEditorOpen(false);
          setEditingPolicy(null);
        }}
        onSave={savePolicy}
      />

      <Modal
        open={!!defaultGuardMessage}
        onClose={() => setDefaultGuardMessage('')}
        title="无法设置默认模型"
        footer={<button type="button" className="c-btn c-btn--primary" onClick={() => setDefaultGuardMessage('')}>知道了</button>}
      >
        {defaultGuardMessage}
      </Modal>

      <SmokeDetailModal
        model={smokeDetailModel}
        provider={providers.find((item) => item.id === smokeDetailModel?.providerId)}
        onClose={() => setSmokeDetailModel(null)}
      />
    </div>
  );
};

type SmokeDetailModalProps = {
  model: ModelRow | null;
  provider?: Provider;
  onClose: () => void;
};

const SmokeDetailModal: FC<SmokeDetailModalProps> = ({ model, provider, onClose }) => {
  if (!model) return null;
  const detail = model.smokeErrorDetail || model.smokeError || smokeTitle(model);
  return (
    <Modal
      open={!!model}
      onClose={onClose}
      title="连通性错误详情"
      size="lg"
      footer={<button type="button" className="c-btn c-btn--primary" onClick={onClose}>关闭</button>}
    >
      <div className="strategy-modal-grid">
        <div className="c-field">
          <label className="c-label">供应商</label>
          <input className="c-input" value={provider?.name ?? model.providerId} readOnly />
        </div>
        <div className="c-field">
          <label className="c-label">模型 ID</label>
          <input className="c-input" value={model.upstreamId} readOnly />
        </div>
        <div className="c-field">
          <label className="c-label">错误类型</label>
          <input className="c-input" value={smokeErrorTypeLabel(model.smokeErrorType)} readOnly />
        </div>
        <div className="c-field">
          <label className="c-label">状态</label>
          <input className="c-input" value={smokeLabel(model)} readOnly />
        </div>
      </div>
      <div className="model-smoke-detail">{detail}</div>
    </Modal>
  );
};

type AddProviderModalProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (provider: CreateProviderPayload) => void;
};

const AddProviderModal: FC<AddProviderModalProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [type, setType] = useState<ProviderType>('openai_compatible');
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [capability, setCapability] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const providerPayload = (): CreateProviderPayload => ({
    name: name || '未命名供应商',
    short: (name || 'N').slice(0, 1).toUpperCase(),
    type,
    base_url: baseUrl,
    api_key: apiKey,
    enabled: true,
    remark: '',
  });

  const filteredModels = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return remoteModels.filter((model) => {
      const byCapability = capability === 'all' || model.capabilities.includes(capability as Capability);
      const byKeyword = !k || model.id.toLowerCase().includes(k) || model.group.toLowerCase().includes(k);
      return byCapability && byKeyword;
    });
  }, [capability, keyword, remoteModels]);

  const discover = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await apiPost<{ models: RemoteModel[] }>('/api/admin/providers/discover-models', providerPayload());
      setRemoteModels(res.models);
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取供应商模型失败');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    const selectedModels = remoteModels
      .filter((model) => selectedIds.includes(model.id))
      .map<CreateModelPayload>((model) => ({
        upstream_id: model.id,
        display_name: model.displayName || model.id,
        group: model.group,
        capabilities: model.capabilities,
        context_window: model.contextWindow,
      }));
    onAdd({ ...providerPayload(), models: selectedModels });
    setName('');
    setApiKey('');
    setRemoteModels([]);
    setSelectedIds([]);
    setKeyword('');
    setCapability('all');
    setError('');
  };

  const toggleVisible = () => {
    const visible = filteredModels.map((model) => model.id);
    const allSelected = visible.length > 0 && visible.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => allSelected ? prev.filter((id) => !visible.includes(id)) : Array.from(new Set([...prev, ...visible])));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新增供应商"
      size="lg"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>
            保存并导入 {selectedIds.length} 个模型
          </button>
        </>
      }
    >
      <div className="form-grid form-grid--2">
        <div className="c-field">
          <label className="c-label">供应商类型</label>
          <select className="c-select" value={type} onChange={(e) => setType(e.target.value as ProviderType)}>
            <option value="openai_compatible">OpenAI 兼容</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="ollama">Ollama / 本地</option>
            <option value="replicate">Replicate</option>
            <option value="midjourney_proxy">MidJourney Proxy</option>
            <option value="comfyui">ComfyUI</option>
            <option value="custom">自定义</option>
          </select>
          <span className="c-help">{providerProtocolHint(type)}</span>
        </div>
        <div className="c-field">
          <label className="c-label">名称</label>
          <input className="c-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 SiliconFlow" />
        </div>
        <div className="c-field" style={{ gridColumn: '1 / -1' }}>
          <label className="c-label">API 地址</label>
          <input className="c-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="c-field" style={{ gridColumn: '1 / -1' }}>
          <label className="c-label">API Key</label>
          <input className="c-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </div>
      </div>

      <div className="provider-model-toolbar" style={{ marginTop: 16 }}>
        <div>
          <div className="provider-model-toolbar__title">模型发现</div>
          <div className="u-caption">先拉取上游模型,再勾选需要导入的模型。</div>
        </div>
        <button type="button" className="c-btn c-btn--secondary" onClick={discover} disabled={loading || !baseUrl || !apiKey}>
          {loading ? <Loader2 size={15} className="u-spin" /> : <RefreshCw size={15} />}
          获取模型
        </button>
      </div>

      {error && (
        <div className="model-test-notice" style={{ marginTop: 12 }}>
          <Info size={18} />
          <span>{error}</span>
        </div>
      )}

      {remoteModels.length > 0 && (
        <div className="remote-model-modal" style={{ marginTop: 12 }}>
          <div className="remote-model-modal__top">
            <div className="c-search">
              <span className="icon-search"><Search size={16} /></span>
              <input className="c-input" placeholder="搜索模型 ID / 分组" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <select className="c-select" style={{ width: 132 }} value={capability} onChange={(e) => setCapability(e.target.value)}>
              <option value="all">全部能力</option>
              <option value="chat">对话</option>
              <option value="image">生图</option>
              <option value="embedding">嵌入</option>
              <option value="speech">语音</option>
            </select>
            <button type="button" className="c-btn c-btn--secondary c-btn--sm" onClick={toggleVisible}>勾选当前</button>
          </div>
          <div className="remote-model-list">
            {filteredModels.map((model) => {
              const selected = selectedIds.includes(model.id);
              return (
                <label
                  className={`remote-model-row${selected ? ' is-selected' : ''}`}
                  key={model.id}
                >
                  <input
                    className="remote-model-row__check"
                    type="checkbox"
                    checked={selected}
                    onChange={() => setSelectedIds((prev) => selected ? prev.filter((id) => id !== model.id) : [...prev, model.id])}
                  />
                  <span className="remote-model-row__main">
                    <span className="remote-model-row__id">{model.id}</span>
                    <span className="remote-model-row__sub">
                      <span className={modelTypeClass(model.capabilities)}>{modelTypeLabel(model.capabilities)}</span>
                      <span>{model.group}</span>
                      {model.contextWindow ? <span>{contextLabel(model.contextWindow)}</span> : null}
                    </span>
                  </span>
                  <span className="remote-model-row__action">{selected ? '待导入' : '未选择'}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
};

type RemoteModelModalProps = {
  open: boolean;
  onClose: () => void;
  providerName: string;
  remoteModels: RemoteModel[];
  loading: boolean;
  error: string;
  selectedRemoteIds: string[];
  remoteTab: string;
  remoteKeyword: string;
  importedKeys: Set<string>;
  onRemoteTabChange: (value: string) => void;
  onRemoteKeywordChange: (value: string) => void;
  onRefresh: () => void;
  onManualAdd: () => void;
  onToggle: (id: string) => void;
  onConfirm: () => void;
};

const RemoteModelModal: FC<RemoteModelModalProps> = ({
  open,
  onClose,
  providerName,
  remoteModels,
  loading,
  error,
  selectedRemoteIds,
  remoteTab,
  remoteKeyword,
  importedKeys,
  onRemoteTabChange,
  onRemoteKeywordChange,
  onRefresh,
  onManualAdd,
  onToggle,
  onConfirm,
}) => {
  const [visibleCount, setVisibleCount] = useState(REMOTE_RENDER_BATCH);
  useEffect(() => {
    setVisibleCount(REMOTE_RENDER_BATCH);
  }, [remoteModels, remoteKeyword, remoteTab, open]);
  const selectedSet = useMemo(() => new Set(selectedRemoteIds), [selectedRemoteIds]);
  const filteredModels = useMemo(() => {
    const keyword = remoteKeyword.trim().toLowerCase();
    return remoteModels.filter((model) => {
      const byTab = remoteTab === 'all' || model.capabilities.includes(remoteTab as Capability);
      const byKeyword = !keyword || model.id.toLowerCase().includes(keyword) || model.group.toLowerCase().includes(keyword);
      return byTab && byKeyword;
    });
  }, [remoteKeyword, remoteModels, remoteTab]);
  const visibleModels = filteredModels.slice(0, visibleCount);
  const groups = groupBy(visibleModels);
  const importedCount = remoteModels.filter((model) => importedKeys.has(model.id)).length;
  const newSelectedCount = remoteModels.filter((model) => selectedSet.has(model.id) && !importedKeys.has(model.id)).length;
  const deleteCount = remoteModels.filter((model) => importedKeys.has(model.id) && !selectedSet.has(model.id)).length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${providerName} · 模型列表`}
      size="lg"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onManualAdd}>手动添加模型</button>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" disabled={loading || remoteModels.length === 0} onClick={onConfirm}>
            保存选择
          </button>
        </>
      }
    >
      <div className="remote-model-modal">
        <div className="remote-model-modal__top">
          <div className="c-search">
            <span className="icon-search"><Search size={16} /></span>
            <input className="c-input" placeholder="搜索模型 ID / 名称" value={remoteKeyword} onChange={(e) => onRemoteKeywordChange(e.target.value)} />
          </div>
          <button type="button" className="c-icon-btn" aria-label="刷新" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'u-spin' : undefined} />
          </button>
        </div>
        {error && (
          <div className="model-test-notice" style={{ marginBottom: 12 }}>
            <Info size={18} />
            <span>{error}</span>
          </div>
        )}
        <Tabs items={REMOTE_TABS} value={remoteTab} onChange={onRemoteTabChange} />
        <div className="remote-model-summary">
          <span>拉取 {remoteModels.length} 个</span>
          <span>当前显示 {filteredModels.length} 个</span>
          <span>已导入 {importedCount} 个</span>
          <span>新勾选 {newSelectedCount} 个</span>
          {deleteCount > 0 && <span className="remote-model-summary__danger">将删除 {deleteCount} 个</span>}
        </div>
        <div className="remote-model-list">
          {Object.entries(groups).map(([group, rows]) => (
            <div className="remote-model-group" key={group}>
              <div className="remote-model-group__head">
                <span>{group}</span>
                <span className="c-badge c-badge--brand">{rows.length}</span>
              </div>
              {rows.map((model) => {
                const imported = importedKeys.has(model.id);
                const selected = selectedSet.has(model.id);
                const action = imported && !selected ? '将删除' : imported ? '已导入' : selected ? '待导入' : '未选择';
                return (
                  <label
                    className={`remote-model-row${selected ? ' is-selected' : ''}${imported ? ' is-imported' : ''}`}
                    key={model.id}
                  >
                    <input
                      className="remote-model-row__check"
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(model.id)}
                    />
                    <span className="remote-model-row__main">
                      <span className="remote-model-row__id">{model.id}</span>
                      <span className="remote-model-row__sub">
                        <span className={modelTypeClass(model.capabilities)}>{modelTypeLabel(model.capabilities)}</span>
                        {model.capabilities.map((cap) => (
                          <span key={cap}>{capabilityLabel(cap)}</span>
                        ))}
                        <span>{contextLabel(model.contextWindow)}</span>
                      </span>
                    </span>
                    <span className="remote-model-row__action">{action}</span>
                  </label>
                );
              })}
            </div>
          ))}
          {!loading && visibleCount < filteredModels.length && (
            <button type="button" className="remote-model-more" onClick={() => setVisibleCount((count) => count + REMOTE_RENDER_BATCH)}>
              显示更多 ({Math.min(visibleCount, filteredModels.length)} / {filteredModels.length})
            </button>
          )}
          {loading && (
            <div className="u-caption" style={{ padding: 24, textAlign: 'center' }}>
              正在从供应商拉取模型...
            </div>
          )}
          {!loading && remoteModels.length === 0 && (
            <div className="u-caption" style={{ padding: 24, textAlign: 'center' }}>
              暂无可导入的上游模型，请手动添加模型 ID
            </div>
          )}
          {!loading && remoteModels.length > 0 && filteredModels.length === 0 && (
            <div className="u-caption" style={{ padding: 24, textAlign: 'center' }}>
              当前筛选条件下没有模型，请清空搜索或切回“全部”。
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

type ManualModelModalProps = {
  open: boolean;
  onClose: () => void;
  providerName: string;
  onAdd: (model: RemoteModel) => void;
};

const ManualModelModal: FC<ManualModelModalProps> = ({ open, onClose, providerName, onAdd }) => {
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [type, setType] = useState<'text' | 'image' | 'embedding'>('text');
  const [contextWindow, setContextWindow] = useState('128000');

  const submit = () => {
    if (!modelId.trim()) return;
    const capabilities: Capability[] = type === 'image' ? ['image'] : type === 'embedding' ? ['embedding'] : ['chat'];
    const group = modelId.includes('/') ? modelId.split('/')[0] : type;
    onAdd({
      id: modelId.trim(),
      displayName: displayName.trim() || undefined,
      group,
      capabilities,
      contextWindow: type === 'text' ? Number(contextWindow) || undefined : undefined,
    });
    setModelId('');
    setDisplayName('');
    setType('text');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`手动添加模型 · ${providerName}`}
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>添加模型</button>
        </>
      }
    >
      <div className="form-grid form-grid--2">
        <div className="c-field" style={{ gridColumn: '1 / -1' }}>
          <label className="c-label">模型 ID</label>
          <input className="c-input" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="例如 gpt-image-2 / grok-imagine-image-lite" />
        </div>
        <div className="c-field">
          <label className="c-label">显示名称</label>
          <input className="c-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="可选" />
        </div>
        <div className="c-field">
          <label className="c-label">模型类型</label>
          <select className="c-select" value={type} onChange={(e) => setType(e.target.value as 'text' | 'image' | 'embedding')}>
            <option value="text">文字模型</option>
            <option value="image">图片模型</option>
            <option value="embedding">嵌入模型</option>
          </select>
        </div>
        {type === 'text' && (
          <div className="c-field" style={{ gridColumn: '1 / -1' }}>
            <label className="c-label">上下文长度</label>
            <input className="c-input" value={contextWindow} onChange={(e) => setContextWindow(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
};

type ModelConfigModalProps = {
  model: ModelRow | null;
  policies: PointsPolicyOption[];
  onClose: () => void;
  onSave: (patch: Partial<ModelRow>) => void;
};

const ModelConfigModal: FC<ModelConfigModalProps> = ({ model, policies, onClose, onSave }) => {
  const availablePolicies = useMemo(() => (model ? policiesForModels(policies, [model]) : policies), [model, policies]);
  const [visibility, setVisibility] = useState<Visibility>(model?.visibility ?? 'draft');
  const [pointsPolicyId, setPointsPolicyId] = useState<PointsPolicyId>(model?.pointsPolicyId ?? availablePolicies[0]?.id ?? '');
  const [sortWeight, setSortWeight] = useState(String(model?.sortWeight ?? 100));
  const [sse, setSse] = useState(model?.sse ?? true);
  const [imageSize, setImageSize] = useState(model?.imageParams?.size ?? '');
  const [imageQuality, setImageQuality] = useState(model?.imageParams?.quality ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!model) return;
    const nextPolicies = policiesForModels(policies, [model]);
    setVisibility(model.visibility);
    setPointsPolicyId(nextPolicies.some((policy) => policy.id === model.pointsPolicyId) ? model.pointsPolicyId ?? '' : nextPolicies[0]?.id ?? '');
    setSortWeight(String(model.sortWeight ?? 100));
    setSse(model.sse);
    setImageSize(model.imageParams?.size ?? '');
    setImageQuality(model.imageParams?.quality ?? '');
    setAdvancedOpen(false);
  }, [model, policies]);

  if (!model) return null;

  const isImage = model.capabilities.includes('image');
  const policy = availablePolicies.find((item) => item.id === pointsPolicyId);

  const save = () => {
    onSave({
      visibility,
      ...(policy ? { pointsPolicyId: policy.id, pointsPolicySummary: policy.summary } : {}),
      sortWeight: Number(sortWeight) || 100,
      sse: supportsSse(model.capabilities) ? sse : false,
      ...(isImage ? { imageParams: { size: imageSize.trim(), quality: imageQuality.trim() } } : {}),
    });
  };

  return (
    <Modal
      open={!!model}
      onClose={onClose}
      title={`模型配置 · ${model.upstreamId}`}
      size="lg"
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" onClick={save}>保存</button>
        </>
      }
    >
      <div className="strategy-modal-grid">
        <div className="c-field">
          <label className="c-label">模型 ID</label>
          <input className="c-input" value={model.upstreamId} readOnly />
        </div>
        <div className="c-field">
          <label className="c-label">用户可见性</label>
          <select className="c-select" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="draft">未发布</option>
            <option value="public">所有人可见</option>
            <option value="plus">仅 Plus 可见</option>
            <option value="admin">仅管理员</option>
          </select>
        </div>
        <div className="c-field">
          <label className="c-label">积分策略</label>
          <select className="c-select" value={pointsPolicyId} disabled={availablePolicies.length === 0} onChange={(e) => setPointsPolicyId(e.target.value)}>
            {availablePolicies.length === 0 && <option value="">暂无积分策略</option>}
            {availablePolicies.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
          <span className="c-help">{policy?.summary ?? (isImage ? '图片模型固定使用按次策略' : '暂无可用积分策略')}</span>
        </div>
        <div className="c-field">
          <label className="c-label">排序权重</label>
          <input className="c-input" type="number" value={sortWeight} onChange={(e) => setSortWeight(e.target.value)} />
        </div>
        {supportsSse(model.capabilities) && (
          <div className="c-field">
            <label className="c-label">SSE 流式输出</label>
            <label className="c-switch">
              <input type="checkbox" checked={sse} onChange={(e) => setSse(e.target.checked)} />
              <span className="c-switch__slider" />
            </label>
          </div>
        )}
      </div>
      {isImage && (
        <details className="model-advanced" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
          <summary>生图参数（按需展开）</summary>
          <div className="strategy-modal-grid">
            <div className="c-field">
              <label className="c-label">默认尺寸</label>
              <input
                className="c-input"
                value={imageSize}
                placeholder="留空使用上游默认"
                onChange={(e) => setImageSize(e.target.value)}
              />
            </div>
            <div className="c-field">
              <label className="c-label">默认质量</label>
              <select className="c-select" value={imageQuality} onChange={(e) => setImageQuality(e.target.value)}>
                <option value="">上游默认</option>
                <option value="standard">standard</option>
                <option value="hd">hd</option>
                <option value="auto">auto</option>
              </select>
            </div>
          </div>
        </details>
      )}
    </Modal>
  );
};

type BulkVisibilityModalProps = {
  open: boolean;
  count: number;
  onClose: () => void;
  onApply: (visibility: Visibility) => void;
};

const BulkVisibilityModal: FC<BulkVisibilityModalProps> = ({ open, count, onClose, onApply }) => {
  const [visibility, setVisibility] = useState<Visibility>('draft');
  return (
    <Modal open={open} onClose={onClose} title="批量设置可见性" footer={
      <>
        <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
        <button type="button" className="c-btn c-btn--primary" onClick={() => onApply(visibility)}>应用</button>
      </>
    }>
      <div className="c-field">
        <label className="c-label">作用于 {count} 个模型</label>
        <select className="c-select" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          <option value="draft">未发布</option>
          <option value="public">所有人可见</option>
          <option value="plus">仅 Plus 可见</option>
        </select>
      </div>
    </Modal>
  );
};

type BulkPointsModalProps = {
  open: boolean;
  count: number;
  models: ModelRow[];
  policies: PointsPolicyOption[];
  onClose: () => void;
  onApply: (patch: Partial<ModelRow>) => void;
};

const BulkPointsModal: FC<BulkPointsModalProps> = ({ open, count, models, policies, onClose, onApply }) => {
  const availablePolicies = useMemo(() => policiesForModels(policies, models), [models, policies]);
  const [policyId, setPolicyId] = useState<PointsPolicyId>(availablePolicies[0]?.id ?? '');
  const policy = availablePolicies.find((item) => item.id === policyId);
  const hasImage = models.some(isImageModel);

  useEffect(() => {
    if (open) setPolicyId(availablePolicies[0]?.id ?? '');
  }, [availablePolicies, open]);

  return (
    <Modal open={open} onClose={onClose} title="批量设置积分策略" footer={
      <>
        <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
        <button
          type="button"
          className="c-btn c-btn--primary"
          disabled={!policy}
          onClick={() => policy && onApply({ pointsPolicyId: policy.id, pointsPolicySummary: policy.summary })}
        >
          应用
        </button>
      </>
    }>
      <div className="c-field">
        <label className="c-label">作用于 {count} 个模型</label>
        <select className="c-select" value={policyId} disabled={availablePolicies.length === 0} onChange={(e) => setPolicyId(e.target.value)}>
          {availablePolicies.length === 0 && <option value="">暂无积分策略</option>}
          {availablePolicies.map((item) => (
            <option value={item.id} key={item.id}>{item.name}</option>
          ))}
        </select>
        <span className="c-help">{policy?.summary ?? (hasImage ? '已选图片模型，不能使用按 Token 策略' : '暂无可用积分策略')}</span>
      </div>
    </Modal>
  );
};

type PolicyEditorModalProps = {
  open: boolean;
  policy: PointsPolicyOption | null;
  onClose: () => void;
  onSave: (policy: PointsPolicyOption) => void;
};

const PolicyEditorModal: FC<PolicyEditorModalProps> = ({ open, policy, onClose, onSave }) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<PointsPolicyMode>('per_call');
  const [perChat, setPerChat] = useState('2');
  const [perImage, setPerImage] = useState('10');
  const [perSpeech, setPerSpeech] = useState('2');
  const [perOther, setPerOther] = useState('1');
  const [inputPer1K, setInputPer1K] = useState('1');
  const [outputPer1K, setOutputPer1K] = useState('1');
  const [summary, setSummary] = useState('');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!open) return;
    setId(policy?.id ?? '');
    setName(policy?.name ?? '');
    setMode(policy?.mode ?? 'per_call');
    setPerChat(String(policy?.perChat ?? 2));
    setPerImage(String(policy?.perImage ?? 10));
    setPerSpeech(String(policy?.perSpeech ?? 2));
    setPerOther(String(policy?.perOther ?? 1));
    setInputPer1K(String(policy?.inputPer1K ?? 1));
    setOutputPer1K(String(policy?.outputPer1K ?? 1));
    setSummary(policy?.summary ?? '');
    setEnabled(policy?.enabled ?? true);
  }, [open, policy]);

  const submit = () => {
    const nextName = name.trim();
    if (!nextName) return;
    const next: PointsPolicyOption = {
      id: policy?.id ?? id.trim(),
      name: nextName,
      mode,
      summary: summary.trim() || (mode === 'per_token' ? '按总 Token 计费；图片模型固定按次' : '按模型类型每次调用计费'),
      perChat: mode === 'per_call' ? Math.max(0, Number(perChat) || 0) : 0,
      perImage: mode === 'per_call' ? Math.max(0, Number(perImage) || 0) : 0,
      perSpeech: mode === 'per_call' ? Math.max(0, Number(perSpeech) || 0) : 0,
      perOther: mode === 'per_call' ? Math.max(0, Number(perOther) || 0) : 0,
      inputPer1K: mode === 'per_token' ? Math.max(0, Number(inputPer1K) || 0) : 0,
      outputPer1K: mode === 'per_token' ? Math.max(0, Number(outputPer1K) || 0) : 0,
      enabled,
    };
    onSave(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={policy ? '编辑积分策略' : '新增积分策略'}
      footer={
        <>
          <button type="button" className="c-btn c-btn--secondary" onClick={onClose}>取消</button>
          <button type="button" className="c-btn c-btn--primary" onClick={submit}>保存</button>
        </>
      }
    >
      <div className="strategy-modal-grid">
        <div className="c-field">
          <label className="c-label">策略 ID</label>
          <input className="c-input" value={id} disabled={!!policy} onChange={(event) => setId(event.target.value)} placeholder="留空则按名称生成" />
        </div>
        <div className="c-field">
          <label className="c-label">策略名称</label>
          <input className="c-input" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="c-field">
          <label className="c-label">计费方式</label>
          <select className="c-select" value={mode} onChange={(event) => setMode(event.target.value as PointsPolicyMode)}>
            <option value="per_call">按次</option>
            <option value="per_token">按 Token</option>
          </select>
        </div>
        <div className="c-field">
          <label className="c-label">状态</label>
          <label className="c-switch">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span className="c-switch__slider" />
          </label>
        </div>
        {mode === 'per_call' ? (
          <>
            <div className="c-field">
              <label className="c-label">文字每次</label>
              <input className="c-input" type="number" min="0" value={perChat} onChange={(event) => setPerChat(event.target.value)} />
            </div>
            <div className="c-field">
              <label className="c-label">图片每次</label>
              <input className="c-input" type="number" min="0" value={perImage} onChange={(event) => setPerImage(event.target.value)} />
            </div>
            <div className="c-field">
              <label className="c-label">语音每次</label>
              <input className="c-input" type="number" min="0" value={perSpeech} onChange={(event) => setPerSpeech(event.target.value)} />
            </div>
            <div className="c-field">
              <label className="c-label">其他每次</label>
              <input className="c-input" type="number" min="0" value={perOther} onChange={(event) => setPerOther(event.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="c-field">
              <label className="c-label">输入每千 Token</label>
              <input className="c-input" type="number" min="0" value={inputPer1K} onChange={(event) => setInputPer1K(event.target.value)} />
            </div>
            <div className="c-field">
              <label className="c-label">输出每千 Token</label>
              <input className="c-input" type="number" min="0" value={outputPer1K} onChange={(event) => setOutputPer1K(event.target.value)} />
            </div>
          </>
        )}
        <div className="c-field" style={{ gridColumn: '1 / -1' }}>
          <label className="c-label">说明</label>
          <input className="c-input" value={summary} onChange={(event) => setSummary(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
};

type ColumnSettingsModalProps = {
  open: boolean;
  visibleColumns: OptionalColumn[];
  onClose: () => void;
  onToggle: (column: OptionalColumn) => void;
};

const ColumnSettingsModal: FC<ColumnSettingsModalProps> = ({ open, visibleColumns, onClose, onToggle }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="列设置"
    footer={<button type="button" className="c-btn c-btn--primary" onClick={onClose}>完成</button>}
  >
    <div className="column-settings">
      <div className="model-test-notice">
        <Info size={18} />
        <span>默认只显示模型、供应商、连通性、真实健康、可见性、默认、状态和操作，其他信息按需打开。</span>
      </div>
      {COLUMN_OPTIONS.map((item) => (
        <label className="column-setting-row" key={item.value}>
          <span>{item.label}</span>
          <input type="checkbox" checked={visibleColumns.includes(item.value)} onChange={() => onToggle(item.value)} />
        </label>
      ))}
    </div>
  </Modal>
);
