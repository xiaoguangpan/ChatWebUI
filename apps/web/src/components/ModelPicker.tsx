import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type MouseEvent,
} from 'react';

export type ModelOption = { id: string; name: string; desc: string };

type Props = {
  selected?: ModelOption;
  options: ModelOption[];
  onSelect: (model: ModelOption) => void;
};

/**
 * Composer 内的模型选择 pill + 浮层。
 * 浮层用 position: fixed,弹出在触发器上方。
 */
export const ModelPicker: FC<Props> = ({ selected, options, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popW = Math.min(360, window.innerWidth - 16);
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: Math.max(8, left),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computePos();
    const onResize = () => computePos();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, computePos]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="mode-pill"
        type="button"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={options.length === 0}
      >
        <span>{selected?.name ?? '加载模型中'}</span>
        <ChevronDown size={14} />
      </button>
      <div
        ref={popoverRef}
        className={`c-popover${open ? ' is-open' : ''}`}
        style={
          pos
            ? { bottom: `${pos.bottom}px`, left: `${pos.left}px`, top: 'auto' }
            : undefined
        }
        role="listbox"
      >
        {options.map((model) => (
          <button
            key={model.id}
            type="button"
            className={`c-popover__item${model.id === selected?.id ? ' is-active' : ''}`}
            onClick={() => {
              onSelect(model);
              setOpen(false);
            }}
            role="option"
            aria-selected={model.id === selected?.id}
          >
            <div className="c-popover__item__main">
              <div className="c-popover__item__title">{model.name}</div>
              <div className="c-popover__item__desc">{model.desc}</div>
            </div>
            <span className="c-popover__item__check">
              <Check size={16} />
            </span>
          </button>
        ))}
      </div>
    </>
  );
};
