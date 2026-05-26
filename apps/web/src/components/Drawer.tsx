import { X } from 'lucide-react';
import { useEffect, type FC, type MouseEvent, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * 右侧滑入抽屉。沿用 .c-drawer 样式。
 */
export const Drawer: FC<Props> = ({ open, onClose, title, subtitle, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onMaskClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={`c-drawer-mask${open ? ' is-open' : ''}`}
      onClick={onMaskClick}
      aria-hidden={!open}
    >
      <div className="c-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="c-drawer__head">
          <div>
            <div className="c-drawer__title">{title}</div>
            {subtitle && <div className="c-drawer__sub">{subtitle}</div>}
          </div>
          <button className="c-icon-btn" type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="c-drawer__body">{children}</div>
        {footer && <div className="c-drawer__footer">{footer}</div>}
      </div>
    </div>
  );
};
