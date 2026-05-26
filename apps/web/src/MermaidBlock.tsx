import { useEffect, useRef, useState } from 'react';
import { currentTheme, type ThemeMode } from './theme';

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default);
  }
  return mermaidPromise;
}

let renderSeq = 0;

export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => currentTheme());
  const idRef = useRef(`mmd-${(++renderSeq).toString(36)}`);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<{ theme?: ThemeMode }>).detail?.theme;
      setTheme(next ?? currentTheme());
    };
    window.addEventListener('chatwebui:theme-changed', onThemeChange);
    return () => window.removeEventListener('chatwebui:theme-changed', onThemeChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const trimmed = code.trim();
    if (!trimmed) {
      setSvg(null);
      setError(null);
      return;
    }

    loadMermaid().then(async (mermaid) => {
      try {
        mermaid.initialize(mermaidConfig(theme));
        const ok = await mermaid.parse(trimmed, { suppressErrors: true });
        if (cancelled) return;
        if (ok === false) {
          setError(null);
          setSvg(null);
          return;
        }
        const { svg: rendered } = await mermaid.render(`${idRef.current}-${theme}-${++renderSeq}`, trimmed);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setSvg(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  if (svg) {
    return <div className="msg__mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  if (error) {
    return (
      <div className="msg__mermaid msg__mermaid--error" role="note" aria-label="Mermaid 渲染失败">
        <div className="msg__mermaid__hint">Mermaid 渲染失败:{error}</div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="msg__mermaid msg__mermaid--loading" role="status" aria-label="Mermaid 渲染中">
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function mermaidConfig(theme: ThemeMode) {
  const light = theme === 'light';
  return {
    startOnLoad: false,
    theme: 'base' as const,
    securityLevel: 'loose' as const,
    fontFamily:
      'ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    themeVariables: {
      background: 'transparent',
      mainBkg: light ? '#ffffff' : '#2f2f2f',
      primaryColor: light ? '#ffffff' : '#2f2f2f',
      primaryBorderColor: light ? '#d4d4d4' : '#525252',
      primaryTextColor: light ? '#0d0d0d' : '#ececec',
      secondaryColor: light ? '#f7f7f7' : '#282828',
      tertiaryColor: light ? '#fafafa' : '#242424',
      lineColor: light ? '#5d5d5d' : '#b4b4b4',
      textColor: light ? '#0d0d0d' : '#ececec',
      nodeTextColor: light ? '#0d0d0d' : '#ececec',
      clusterBkg: light ? '#f7f7f7' : '#242424',
      clusterBorder: light ? '#d4d4d4' : '#525252',
      edgeLabelBackground: light ? '#ffffff' : '#2f2f2f',
    },
  };
}
