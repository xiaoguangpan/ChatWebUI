import { ChevronLeft } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  title: string;
  back?: string;
  right?: ReactNode;
};

/**
 * 客户端子页通用 topbar。左上返回箭头、居中标题、右侧可塞自定义按钮。
 * 与 .app-topbar 共用样式,保证移动端页面标题区一致。
 */
export const SubPageHeader: FC<Props> = ({ title, back, right }) => {
  const navigate = useNavigate();
  return (
    <header className="app-topbar sub-page-header">
      <button
        className="c-icon-btn"
        type="button"
        aria-label="返回"
        onClick={() => (back ? navigate(back) : navigate(-1))}
      >
        <ChevronLeft size={20} />
      </button>
      <span className="app-topbar__title">{title}</span>
      <div className="app-topbar__actions">{right}</div>
    </header>
  );
};
