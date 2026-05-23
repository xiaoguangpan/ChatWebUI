/* ============================================================
   admin/_partials.js · 注入侧栏与高亮当前菜单
   每个 admin 页只需引入此脚本,无需重复粘贴侧栏 HTML
   ============================================================ */
(function () {
  const NAV = [
    {
      title: '概览',
      items: [
        { key: 'dashboard',   label: '仪表盘',   icon: 'bar-chart',  href: 'dashboard.html' },
      ],
    },
    {
      title: '模型管理',
      items: [
        { key: 'ai-models',    label: 'AI 对话模型', icon: 'cpu',     href: 'ai-models.html' },
        { key: 'image-models', label: '生图模型',    icon: 'image',   href: 'image-models.html' },
      ],
    },
    {
      title: '用户与积分',
      items: [
        { key: 'users',       label: '用户管理', icon: 'users', href: 'users.html' },
        { key: 'points-log',  label: '积分流水', icon: 'coin',  href: 'points-log.html' },
      ],
    },
    {
      title: '记录与日志',
      items: [
        { key: 'generations', label: '生成记录', icon: 'history',    href: 'generations.html' },
        { key: 'system-logs', label: '系统日志', icon: 'terminal',   href: 'system-logs.html' },
      ],
    },
  ];

  function buildSidebar(activeKey) {
    let html = `
      <div class="admin-brand">
        <span class="logo">A</span>
        <div>
          <div class="admin-brand__name">智聊后台</div>
          <div class="admin-brand__sub">v 1.0.0</div>
        </div>
      </div>
      <nav class="admin-nav">
    `;
    NAV.forEach(group => {
      html += `<div class="admin-nav__group"><div class="admin-nav__title">${group.title}</div>`;
      group.items.forEach(item => {
        const active = item.key === activeKey ? ' is-active' : '';
        const badge = item.badge ? `<span class="badge">${item.badge}</span>` : '';
        html += `<a class="admin-nav__item${active}" href="${item.href}">
          <span data-icon="${item.icon}"></span>${item.label}${badge}
        </a>`;
      });
      html += `</div>`;
    });
    html += `</nav>
      <div class="admin-sidebar-footer">
        <a class="admin-nav__item" href="login.html" style="color:var(--text-secondary);">
          <span data-icon="log-out"></span>退出登录
        </a>
      </div>`;
    return html;
  }

  function buildTopbar(title) {
    return `
      <button class="c-icon-btn u-sm-only" data-toggle="sidebar" data-target=".admin-sidebar" aria-label="菜单">
        <span data-icon="menu"></span>
      </button>
      <div>
        <div class="admin-topbar__title">${title}</div>
      </div>
      <div class="admin-topbar__actions">
        <button class="c-icon-btn" aria-label="切换主题" onclick="toggleTheme()">
          <span data-icon="moon"></span>
        </button>
        <button class="c-icon-btn" aria-label="通知"><span data-icon="bell"></span></button>
        <span class="c-avatar">A</span>
      </div>
    `;
  }

  window.mountAdmin = function (opts) {
    const aside = document.querySelector('.admin-sidebar');
    if (aside) aside.innerHTML = buildSidebar(opts.active);
    const tb = document.querySelector('.admin-topbar');
    if (tb) tb.innerHTML = buildTopbar(opts.title || '');
    if (window.renderIcons) window.renderIcons();
  };
})();
