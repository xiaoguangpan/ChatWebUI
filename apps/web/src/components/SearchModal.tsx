import { Image as ImageIcon, MessageSquare, Search, SquarePen, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, type ApiConversation, type ApiGeneration } from '../api';

type SearchModalCtx = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const SearchModalContext = createContext<SearchModalCtx | null>(null);

export function useSearchModal() {
  const ctx = useContext(SearchModalContext);
  if (!ctx) throw new Error('useSearchModal must be used within SearchModalProvider');
  return ctx;
}

export const SearchModalProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <SearchModalContext.Provider value={value}>
      {children}
      <SearchModal isOpen={isOpen} onClose={close} />
    </SearchModalContext.Provider>
  );
};

const SearchModal: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [keyword, setKeyword] = useState('');
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [generations, setGenerations] = useState<ApiGeneration[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    setKeyword('');
    Promise.all([
      apiGet<{ conversations: ApiConversation[] }>('/api/conversations'),
      apiGet<{ generations: ApiGeneration[] }>('/api/me/generations'),
    ])
      .then(([conversationRes, generationRes]) => {
        setConversations(conversationRes.conversations);
        setGenerations(generationRes.generations.filter((item) => item.type === 'image'));
      })
      .catch(() => {
        setConversations([]);
        setGenerations([]);
      });
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const chatItems = conversations
      .filter((item) => !kw || item.title.toLowerCase().includes(kw))
      .map((item) => ({ kind: 'chat' as const, id: item.id, title: item.title }));
    const imageItems = generations
      .filter((item) => !kw || item.prompt_markdown.toLowerCase().includes(kw))
      .map((item) => ({ kind: 'image' as const, id: item.id, title: truncateTitle(item.prompt_markdown || '图片生成') }));
    return [{ group: '最近', items: [...chatItems, ...imageItems] }];
  }, [conversations, generations, keyword]);

  const handleMaskClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const goNew = () => {
    onClose();
    navigate('/');
  };

  const goConversation = (id: string) => {
    onClose();
    navigate(`/c/${id}`);
  };

  const goGeneration = (id: string) => {
    onClose();
    navigate(`/image/${id}`);
  };

  return (
    <div
      className={`c-search-modal-mask${isOpen ? ' is-open' : ''}`}
      onClick={handleMaskClick}
      aria-hidden={!isOpen}
    >
      <div className="c-search-modal" role="dialog" aria-modal="true">
        <div className="c-search-modal__head">
          <span className="icon-search">
            <Search size={18} />
          </span>
          <input
            ref={inputRef}
            className="c-search-modal__input"
            placeholder="搜索聊天..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button className="c-search-modal__close" type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="c-search-modal__body">
          <button type="button" className="c-search-modal__item" onClick={goNew}>
            <SquarePen size={18} />
            <span className="c-search-modal__item__title">新聊天</span>
          </button>
          {filtered.map((group) => (
            <div key={group.group}>
              <div className="c-search-modal__group-title">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="c-search-modal__item"
                  onClick={() => item.kind === 'chat' ? goConversation(item.id) : goGeneration(item.id)}
                >
                  {item.kind === 'chat' ? <MessageSquare size={18} /> : <ImageIcon size={18} />}
                  <span className="c-search-modal__item__title">{item.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function truncateTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim();
  return title.length > 36 ? `${title.slice(0, 36)}...` : title || '图片生成';
}
