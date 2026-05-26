import { ArrowUp, Image as ImageIcon, Loader2, Menu, Mic, Plus, RotateCcw, SquarePen, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FC, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPost, type ApiGeneration, type ApiModel, type ImageGenerationResponse } from '../api';
import type { ClientOutletCtx } from '../components/ClientShell';
import { ModelPicker, type ModelOption } from '../components/ModelPicker';
import { MarkdownText } from '../MarkdownText';
import { startSpeechInput, supportsSpeechInput } from '../speechInput';

export type ImageJob = {
  id: string;
  prompt: string;
  modelId: string;
  modelName: string;
  status: 'pending' | 'ok' | 'error';
  images: string[];
  pointsCost?: number;
  error?: string;
};

export function createImageJob(id: string, prompt: string, modelId: string, modelName: string): ImageJob {
  return { id, prompt, modelId, modelName, status: 'pending', images: [] };
}

export function completeImageJob(jobs: ImageJob[], id: string, response: ImageGenerationResponse): ImageJob[] {
  return jobs.map((item) =>
    item.id === id
      ? { ...item, id: response.id, modelId: response.model_id, status: 'ok', images: response.image_urls, pointsCost: response.points_cost }
      : item,
  );
}

export function failImageJob(jobs: ImageJob[], id: string, message: string): ImageJob[] {
  return jobs.map((item) => (item.id === id ? { ...item, status: 'error', error: message } : item));
}

export const ImagePage: FC = () => {
  const { openSidebar } = useOutletContext<ClientOutletCtx>();
  const { id: generationId } = useParams();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelOption | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRef = useRef<ReturnType<typeof startSpeechInput>>();
  const streamRef = useRef<HTMLDivElement>(null);
  const [refImage, setRefImage] = useState<File | null>(null);
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const jobsRef = useRef<ImageJob[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [error, setError] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    apiGet<{ models: ApiModel[] }>('/api/models/available?type=image')
      .then((res) => {
        const options = res.models.map(modelOptionFromApi);
        if (options.length === 0) return;
        const saved = window.localStorage.getItem('chatwebui:selectedImageModelId');
        const defaultModel = res.models.find((model) => model.default_role === 'image');
        const next = options.find((model) => model.id === defaultModel?.id) ?? options.find((model) => model.id === saved) ?? options[0];
        setModelOptions(options);
        setSelectedModel(next);
        window.localStorage.setItem('chatwebui:selectedImageModelId', next.id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewImage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewImage]);

  useEffect(() => {
    if (!generationId) {
      setJobs([]);
      return;
    }
    apiGet<{ generations: ApiGeneration[] }>('/api/me/generations')
      .then((res) => {
        const generation = res.generations.find((item) => item.id === generationId && item.type === 'image');
        const hasLocalJob = jobsRef.current.some((job) => job.id === generationId);
        setJobs(generation ? [imageJobFromGeneration(generation)] : hasLocalJob ? jobsRef.current : []);
        setError(generation || hasLocalJob ? '' : '找不到这条图片生成记录');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载图片生成记录失败'));
  }, [generationId]);

  const onSelectModel = (model: ModelOption) => {
    setSelectedModel(model);
    window.localStorage.setItem('chatwebui:selectedImageModelId', model.id);
  };

  const runGeneration = async (text: string, model: ModelOption) => {
    const generationPrompt = text.trim();
    if (!generationPrompt || loading) return;
    const id = `img_local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const job = createImageJob(id, generationPrompt, model.id, model.name);
    setJobs((prev) => [...prev, job]);
    setError('');
    setLoading(true);
    try {
      const res = await apiPost<ImageGenerationResponse>('/api/images/generations', {
        prompt: generationPrompt,
        model_id: model.id,
        count: 1,
      });
      setJobs((prev) => completeImageJob(prev, id, res));
      window.dispatchEvent(new CustomEvent('chatwebui:generations-changed'));
      navigate(`/image/${encodeURIComponent(res.id)}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : '生图失败';
      setError(message);
      setJobs((prev) => failImageJob(prev, id, message));
      window.dispatchEvent(new CustomEvent('chatwebui:generations-changed'));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;
    if (!selectedModel) {
      setError('请先选择可用的图片模型');
      return;
    }
    setPrompt('');
    await runGeneration(text, selectedModel);
  };

  const retryJob = (job: ImageJob) => {
    if (loading) return;
    const model = modelOptions.find((item) => item.id === job.modelId) ?? selectedModel;
    if (!model) {
      setError('请先选择可用的图片模型');
      return;
    }
    void runGeneration(job.prompt, model);
  };

  const deleteJob = async (job: ImageJob) => {
    if (job.status === 'pending') return;
    if (!window.confirm('确认删除这条生图记录？删除后不可恢复。')) return;
    if (!job.id.startsWith('img_local_')) {
      await apiDelete(`/api/me/generations/${encodeURIComponent(job.id)}`);
    }
    setJobs((prev) => prev.filter((item) => item.id !== job.id));
    window.dispatchEvent(new CustomEvent('chatwebui:generations-changed'));
    if (generationId === job.id) {
      navigate('/image', { replace: true });
    }
  };

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (prompt.trim()) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
    }
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
      onText: (value) => setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${value}` : value)),
      onEnd: () => setListening(false),
      onError: setSpeechError,
    });
  };

  return (
    <>
      <header className="app-topbar">
        <button className="c-icon-btn" type="button" aria-label="菜单" onClick={openSidebar}>
          <Menu size={20} />
        </button>
        <div className="app-topbar__spacer" />
        <div className="app-topbar__actions">
          <Link className="c-icon-btn" to="/" aria-label="新建会话">
            <SquarePen size={20} />
          </Link>
        </div>
      </header>

      <div className="thread-root image-thread-root">
        <div className="chat-stream" ref={streamRef}>
          {jobs.length === 0 && (
            <div className="chat-welcome">
              <h1 className="chat-welcome__title">想生成什么图片?</h1>
            </div>
          )}
          <div className="chat-stream__inner">
            {jobs.map((job) => (
              <ImageJobMessages
                job={job}
                key={job.id}
                onPreview={(url, index) => setPreviewImage({ url, alt: `生成图片 ${index + 1}` })}
                onRetry={retryJob}
                onDelete={deleteJob}
              />
            ))}
          </div>
        </div>

        <div className="composer">
          <div className="composer__inner">
            <form className="composer__bar" onSubmit={onSubmit}>
              <div className="composer__row">
                <textarea
                  className="composer__textarea"
                  placeholder="描述你想要的图片,例如:一只穿宇航服的橘猫坐在月球眺望地球"
                  rows={1}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={onTextareaKeyDown}
                  aria-label="图片提示词输入框"
                />
              </div>
              <div className="composer__tools">
                <div className="composer__left">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => setRefImage(e.target.files?.[0] ?? null)}
                  />
                  <button
                    className="c-icon-btn"
                    type="button"
                    aria-label="参考图"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus size={20} />
                  </button>
                  {refImage && (
                    <span className="composer__attachment">{refImage.name}</span>
                  )}
                </div>
                <div className="composer__right">
                  <ModelPicker
                    selected={selectedModel}
                    options={modelOptions}
                    onSelect={onSelectModel}
                  />
                  <button
                    className={`c-icon-btn${listening ? ' is-active' : ''}`}
                    type="button"
                    aria-label={supportsSpeechInput() ? '语音输入' : '当前浏览器不支持语音输入'}
                    aria-pressed={listening}
                    onClick={toggleSpeech}
                  >
                    <Mic size={20} />
                  </button>
                  <button
                    className="send-btn"
                    type="submit"
                    aria-label={loading ? '正在生成' : '生成'}
                    disabled={!prompt.trim() || loading || !selectedModel}
                  >
                    {loading ? <Loader2 size={16} className="u-spin" /> : <ArrowUp size={18} />}
                  </button>
                </div>
              </div>
            </form>
            {error && <div className="c-help image-error">{error}</div>}
            {speechError && <div className="c-help composer__speech-error">{speechError}</div>}
            <div className="composer__hint">生成图片会消耗积分,具体扣费随模型而定。</div>
          </div>
        </div>
      </div>

      {previewImage && (
        <div className="image-preview-mask" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <button className="image-preview-close" type="button" aria-label="关闭预览" onClick={() => setPreviewImage(null)}>
            <X size={20} />
          </button>
          <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <img src={previewImage.url} alt={previewImage.alt} />
          </div>
        </div>
      )}
    </>
  );
};

const ImageJobMessages: FC<{
  job: ImageJob;
  onPreview: (url: string, index: number) => void;
  onRetry: (job: ImageJob) => void;
  onDelete: (job: ImageJob) => void;
}> = ({ job, onPreview, onRetry, onDelete }) => (
  <>
    <div className="msg msg--user">
      <span className="msg__avatar msg__avatar--user">我</span>
      <div className="msg__body">
        <div className="msg__content">
          <MarkdownText>{job.prompt}</MarkdownText>
        </div>
      </div>
    </div>
    <div className="msg msg--ai">
      <span className="msg__avatar msg__avatar--ai">图</span>
      <div className="msg__body">
        {job.status === 'pending' && (
          <div className="image-status">
            <ImageIcon size={18} />
            <span>正在生成</span>
            <span className="msg__thinking" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        {job.status === 'error' && (
          <div className="image-status image-status--error">
            <span>{job.error || '生图失败'}</span>
          </div>
        )}
        {job.status === 'ok' && (
          <>
            <div className="image-message-grid">
              {job.images.map((url, index) => (
                <button
                  className="image-message-grid__item"
                  type="button"
                  aria-label={`放大查看图片 ${index + 1}`}
                  key={`${url}-${index}`}
                  onClick={() => onPreview(url, index)}
                >
                  <img src={url} alt={`生成图片 ${index + 1}`} />
                </button>
              ))}
            </div>
            <div className="msg__meta">
              <span>{job.modelName}</span>
              {job.pointsCost ? <span>-{job.pointsCost} 积分</span> : null}
            </div>
          </>
        )}
        {job.status !== 'pending' && (
          <div className="msg__actions image-job-actions">
            <button className="c-btn c-btn--secondary c-btn--sm" type="button" onClick={() => onRetry(job)}>
              <RotateCcw size={14} />重新生成
            </button>
            <button className="c-btn c-btn--danger c-btn--sm" type="button" onClick={() => onDelete(job)}>
              <Trash2 size={14} />删除
            </button>
          </div>
        )}
      </div>
    </div>
  </>
);

function modelOptionFromApi(model: ApiModel): ModelOption {
  const modelId = model.upstream_id || model.display_name || model.id;
  const provider = model.provider_name || model.provider_id || '未知供应商';
  return {
    id: model.id,
    name: `${modelId} / ${provider}`,
    desc: model.description || model.points_policy_summary || model.capabilities.join(' / '),
  };
}

function imageJobFromGeneration(generation: ApiGeneration): ImageJob {
  const provider = generation.provider_name || generation.provider_id;
  const modelName = provider ? `${generation.model_name} / ${provider}` : generation.model_name;
  return {
    id: generation.id,
    prompt: generation.prompt_markdown,
    modelId: generation.model_id,
    modelName,
    status: generation.status === 'ok' ? 'ok' : 'error',
    images: generation.image_urls ?? [],
    pointsCost: generation.points_cost,
    error: generation.error_message,
  };
}
