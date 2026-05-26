import type { FC } from 'react';

type Item = { value: string; label: string };

type Props = {
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/**
 * 受控 Tabs。沿用 .c-tabs / .c-tab 样式。
 */
export const Tabs: FC<Props> = ({ items, value, onChange, className }) => {
  return (
    <div className={`c-tabs${className ? ` ${className}` : ''}`}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={`c-tab${value === it.value ? ' is-active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
};
