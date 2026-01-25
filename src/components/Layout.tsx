import { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';
import { useThemeContext } from '@/contexts/ThemeContext';
import { MessageSquare, Sun, Moon, Home, Package, FileDown, MessageCircle } from 'lucide-react';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import ChatSidebar from './ChatSidebar';

// 页面宽度配置
type PageWidthConfig = {
  maxWidth: string;  // Tailwind max-w 类
  centered: boolean; // 是否居中
};

const PAGE_WIDTH_CONFIG: Record<string, PageWidthConfig> = {
  // 仪表盘：统计卡片网格需要较宽空间
  '/': { maxWidth: 'max-w-6xl', centered: true },
  // 列表页：需要展示较多信息
  '/artworks': { maxWidth: 'max-w-5xl', centered: true },
  '/editions': { maxWidth: 'max-w-5xl', centered: true },
  // 详情页：聚焦内容展示
  '/artworks/': { maxWidth: 'max-w-4xl', centered: true },  // 匹配 /artworks/:id
  '/editions/': { maxWidth: 'max-w-4xl', centered: true },  // 匹配 /editions/:id
  // 设置和位置：表单类页面
  '/settings': { maxWidth: 'max-w-3xl', centered: true },
  '/locations': { maxWidth: 'max-w-4xl', centered: true },
  '/links': { maxWidth: 'max-w-4xl', centered: true },
  // 导入页面
  '/import': { maxWidth: 'max-w-4xl', centered: true },
  // 回收站
  '/trash': { maxWidth: 'max-w-4xl', centered: true },
  // 对话页面：特殊处理，需要全高度
  '/chat': { maxWidth: 'max-w-4xl', centered: true },
};

// 获取页面宽度配置
function getPageWidthConfig(pathname: string): PageWidthConfig {
  // 精确匹配
  if (PAGE_WIDTH_CONFIG[pathname]) {
    return PAGE_WIDTH_CONFIG[pathname];
  }
  // 前缀匹配（用于详情页）
  for (const [pattern, config] of Object.entries(PAGE_WIDTH_CONFIG)) {
    if (pattern.endsWith('/') && pathname.startsWith(pattern)) {
      return config;
    }
  }
  // 默认配置
  return { maxWidth: 'max-w-5xl', centered: true };
}

export default function Layout() {
  const { t } = useTranslation('nav');
  const { user, signOut } = useAuthContext();
  const { resolvedTheme, toggleTheme } = useThemeContext();
  const location = useLocation();
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
  };

  // 在对话页面隐藏侧边栏（避免重复）
  const showChatSidebar = location.pathname !== '/chat';

  // 获取当前页面的宽度配置
  const pageWidthConfig = useMemo(
    () => getPageWidthConfig(location.pathname),
    [location.pathname]
  );

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* 桌面端顶部导航 */}
      <header className="hidden md:flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold tracking-tight">{t('appTitle')}</h1>
          <nav className="flex gap-6">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('home')}
            </NavLink>
            <NavLink
              to="/artworks"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('artworks')}
            </NavLink>
            <NavLink
              to="/editions"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('editions')}
            </NavLink>
            <NavLink
              to="/locations"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('locations')}
            </NavLink>
            <NavLink
              to="/links"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('links')}
            </NavLink>
            <NavLink
              to="/import"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('import')}
            </NavLink>
            <NavLink
              to="/trash"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('trash')}
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
              }
            >
              {t('settings')}
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {/* 桌面端对话按钮：切换侧边栏 */}
          <button
            onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
            className={`hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              chatSidebarOpen
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider font-medium">{t('chat')}</span>
          </button>
          {/* 平板端对话链接 (md 到 lg 之间) */}
          <NavLink
            to="/chat"
            className="hidden md:flex lg:hidden items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider font-medium">{t('chat')}</span>
          </NavLink>
          {/* 语言切换 */}
          <LanguageSwitcher />
          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title={resolvedTheme === 'dark' ? t('switchToLight') : t('switchToDark')}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
          {/* 用户信息和登出 */}
          <div className="flex items-center gap-3">
            {user?.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="text-sm text-muted-foreground hidden xl:inline">
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 + 侧边栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0 relative">
          <div className={`${pageWidthConfig.maxWidth} ${pageWidthConfig.centered ? 'mx-auto' : ''}`}>
            <Outlet />
          </div>
        </main>

        {/* 桌面端侧边对话面板 */}
        {showChatSidebar && (
          <ChatSidebar
            isOpen={chatSidebarOpen}
            onToggle={() => setChatSidebarOpen(!chatSidebarOpen)}
          />
        )}
      </div>

      {/* iPad 竖屏浮动对话按钮 (md 到 lg 之间，非 chat 页面) */}
      {showChatSidebar && (
        <Link
          to="/chat"
          className="hidden md:flex lg:hidden fixed right-4 bottom-4 w-14 h-14 bg-primary text-primary-foreground rounded-full items-center justify-center shadow-lg z-40 hover:opacity-90 transition-opacity"
          aria-label={t('chat')}
        >
          <MessageSquare className="w-6 h-6" />
        </Link>
      )}

      {/* 移动端底部导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-50">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 min-w-[60px] ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <Home className="w-5 h-5" />
          <span className="text-xs mt-1 uppercase tracking-wider">{t('home')}</span>
        </NavLink>
        <NavLink
          to="/artworks"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 min-w-[60px] ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <Package className="w-5 h-5" />
          <span className="text-xs mt-1 uppercase tracking-wider">{t('artworks')}</span>
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 min-w-[60px] ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <FileDown className="w-5 h-5" />
          <span className="text-xs mt-1 uppercase tracking-wider">{t('import')}</span>
        </NavLink>
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 min-w-[60px] ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs mt-1 uppercase tracking-wider">{t('chat')}</span>
        </NavLink>
      </nav>
    </div>
  );
}
