import { memo, useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';

/**
 * 将流式返回的 Markdown 渲染为 HTML。
 * - 直接复用原型 `.msg__content` 下的 <p>/<pre>/<code>/<ul>/<ol>/<h*>/<table> 样式
 * - `language-mermaid` 代码块改用 MermaidBlock 异步渲染流程图/脑图
 */

type CodeProps = ComponentPropsWithoutRef<'code'> & { inline?: boolean };

function getCodeText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getCodeText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return getCodeText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

function MarkdownTextImpl({ children, deferDiagrams = false }: { children: string; deferDiagrams?: boolean }) {
  const components = useMemo(
    () => ({
      a({ children: linkChildren, href, ...rest }: ComponentPropsWithoutRef<'a'>) {
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
            {linkChildren}
          </a>
        );
      },
      code({ inline, className, children: codeChildren, ...rest }: CodeProps) {
        if (!inline && className === 'language-mermaid' && !deferDiagrams) {
          return <MermaidBlock code={getCodeText(codeChildren).replace(/\n$/, '')} />;
        }
        return (
          <code className={className} {...rest}>
            {codeChildren}
          </code>
        );
      },
    }),
    [deferDiagrams],
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}

export const MarkdownText = memo(MarkdownTextImpl);
