import { X } from 'lucide-react';
import { useEffect, type FC, type MouseEvent, type ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'default' | 'lg';
  /** 关闭按钮 X 是否显示 */
  showClose?: boolean;
};

/**
 * 通用 Modal 包装,贴 .c-modal 样式。
 * 支持 ESC 关闭、点击遮罩关闭、size lg 变体。
 */
export const Modal: FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  showClose = true,
}) => {
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

  if (!open) return null;

  return (
    <div
      className={`c-modal-mask${open ? ' is-open' : ''}`}
      onClick={onMaskClick}
      aria-hidden={!open}
    >
      <div
        className={`c-modal${size === 'lg' ? ' c-modal--lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="c-modal__header">
          <h3 className="c-modal__title">{title}</h3>
          {showClose && (
            <button className="c-icon-btn" type="button" aria-label="关闭" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
        <div className="c-modal__body">{children}</div>
        {footer && <div className="c-modal__footer">{footer}</div>}
      </div>
    </div>
  );
};
