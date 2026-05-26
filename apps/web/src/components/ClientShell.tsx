import { PanelLeft } from 'lucide-react';
import { useCallback, useState, type FC } from 'react';
import { Outlet } from 'react-router-dom';
import { ClientSidebar } from './ClientSidebar';
import { SearchModalProvider } from './SearchModal';

/**
 * 用户端通用骨架:左侧 Sidebar + 主区域 Outlet。
 * 主区域内的 topbar 由各页面自行渲染,以匹配每页不同的操作区。
 */
export const ClientShell: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
  const toggle = useCallback(() => {
    if (isDesktop()) {
      setSidebarCollapsed((value) => !value);
      return;
    }
    setSidebarOpen((v) => !v);
  }, []);
  const close = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => {
    if (isDesktop()) {
      setSidebarCollapsed(false);
      return;
    }
    setSidebarOpen(true);
  }, []);

  return (
    <SearchModalProvider>
      <div className={`app${sidebarCollapsed ? ' app--sidebar-collapsed' : ''}`}>
        <ClientSidebar isOpen={sidebarOpen} onToggle={toggle} onClose={close} />
        {sidebarCollapsed && (
          <button className="sidebar-restore c-icon-btn" type="button" aria-label="展开侧栏" onClick={openSidebar}>
            <PanelLeft size={20} />
          </button>
        )}
        <div
          className={`sidebar-mask${sidebarOpen ? ' is-open' : ''}`}
          onClick={close}
          aria-hidden={!sidebarOpen}
        />
        <main className="app-main">
          <Outlet context={{ openSidebar }} />
        </main>
      </div>
    </SearchModalProvider>
  );
};

export type ClientOutletCtx = { openSidebar: () => void };
