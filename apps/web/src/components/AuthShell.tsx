import type { FC, ReactNode } from 'react';

type Props = {
  /** 圆形 logo 内的字符 */
  logo: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** logo 背景颜色 */
  logoBg?: string;
};

/**
 * 登录 / 注册页通用骨架。
 * 认证页通用 .auth-page / .auth-card 结构。
 */
export const AuthShell: FC<Props> = ({ logo, title, subtitle, children, logoBg }) => {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo" style={logoBg ? { background: logoBg } : undefined}>
          {logo}
        </div>
        <h1 className="auth-card__title">{title}</h1>
        <p className="auth-card__subtitle">{subtitle}</p>
        {children}
      </div>
    </div>
  );
};
