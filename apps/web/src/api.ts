export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';

export type AuthScope = 'client' | 'admin';

const TOKEN_KEYS: Record<AuthScope, string> = {
  client: 'chatwebui:clientToken',
  admin: 'chatwebui:adminToken',
};
const LEGACY_TOKEN_KEY = 'chatwebui:token';

export type ApiModel = {
  id: string;
  provider_id: string;
  provider_name?: string;
  upstream_id: string;
  display_name: string;
  description: string;
  capabilities: string[];
  default_role?: string;
  sort_weight: number;
  points_policy_summary?: string;
};

export type AuthUser = {
  id: string;
  phone: string;
  name: string;
  role: string;
  plan: string;
  status: string;
  points: number;
  chats?: number;
  images?: number;
  avatar_url?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type ImageGenerationResponse = {
  id: string;
  model_id: string;
  image_urls: string[];
  points_cost: number;
  status: string;
};

export type SpeechResponse = {
  id: string;
  model_id: string;
  voice: string;
  format: string;
  mime_type: string;
  audio_base64: string;
  data_url: string;
  points_cost: number;
};

export type ApiConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ApiGeneration = {
  id: string;
  user_id: string;
  user_name: string;
  type: 'chat' | 'image' | 'tts';
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_name: string;
  prompt_markdown: string;
  response_markdown?: string;
  image_urls?: string[];
  points_cost: number;
  duration_ms: number;
  status: string;
  error_type?: string;
  error_message?: string;
  created_at: string;
};

export type ApiPointsLog = {
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

function currentAuthScope(): AuthScope {
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'client';
}

export function getAuthToken(scope: AuthScope = currentAuthScope()) {
  return window.localStorage.getItem(TOKEN_KEYS[scope]) ?? '';
}

export function setAuthToken(token: string, scope: AuthScope = currentAuthScope()) {
  window.localStorage.setItem(TOKEN_KEYS[scope], token);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearAuthToken(scope: AuthScope = currentAuthScope()) {
  window.localStorage.removeItem(TOKEN_KEYS[scope]);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function authHeaders(scope: AuthScope = currentAuthScope()): HeadersInit {
  const token = getAuthToken(scope);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  return parseJSON<T>(response);
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return parseJSON<T>(response);
}

export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return parseJSON<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
    },
  });
  return parseJSON<T>(response);
}

export async function apiPostForm<T>(path: string, payload: FormData): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
    },
    body: payload,
  });
  return parseJSON<T>(response);
}

export function assetUrl(path?: string) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function speakText(text: string) {
  return apiPost<SpeechResponse>('/api/audio/speech', { text });
}

async function parseJSON<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `${response.status} ${response.statusText}`);
  }
  return data as T;
}
