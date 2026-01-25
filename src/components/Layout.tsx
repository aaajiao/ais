import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { useThemeContext } from '@/contexts/ThemeContext';
import ChatSidebar from './ChatSidebar';

export default function Layout() {
  const { user, signOut } = useAuthContext();
  const { resolvedTheme, toggleTheme } = useThemeContext();
  const location = useLocation();
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
  };

  // 在对话页面隐藏侧边栏（避免重复）
  const showChatSidebar = location.pathname !== '/chat';

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* 桌面端顶部导航 */}
      <header className="hidden md:flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold">aaajiao 作品管理</h1>
          <nav className="flex gap-6">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `hover:text-foreground transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`
              }
            >
              首页
            </NavLink>
            <NavLink
              to="/artworks"
              className={({ isActive }) =>
                `hover:text-foreground transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`
              }
            >
              作品
            </NavLink>
            <NavLink
              to="/editions"
              className={({ isActive }) =>
                `hover:text-foreground transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`
              }
            >
              版本
            </NavLink>
            <NavLink
              to="/locations"
              className={({ isActive }) =>
                `hover:text-foreground transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`
              }
            >
              位置
            </NavLink>
            <NavLink
              to="/import"
              className={({ isActive }) =>
                `hover:text-foreground transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`
              }
            >
              导入
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `hover:text-foreground transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`
              }
            >
              设置
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {/* 桌面端对话按钮：切换侧边栏 */}
          <button
            onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
            className={`hidden lg:flex px-4 py-2 rounded-lg transition-colors ${
              chatSidebarOpen
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            对话
          </button>
          {/* 移动/平板端对话链接 */}
          <NavLink
            to="/chat"
            className="lg:hidden px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            对话
          </NavLink>
          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到深色模式'}
          >
            {resolvedTheme === 'dark' ? '☀️' : '🌙'}
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
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 + 侧边栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0 relative">
          <Outlet />
        </main>

        {/* 桌面端侧边对话面板 */}
        {showChatSidebar && (
          <ChatSidebar
            isOpen={chatSidebarOpen}
            onToggle={() => setChatSidebarOpen(!chatSidebarOpen)}
          />
        )}
      </div>

      {/* 移动端底部导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-50">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <span className="text-xl">🏠</span>
          <span className="text-xs mt-1">首页</span>
        </NavLink>
        <NavLink
          to="/artworks"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <span className="text-xl">📦</span>
          <span className="text-xs mt-1">作品</span>
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <span className="text-xl">📥</span>
          <span className="text-xs mt-1">导入</span>
        </NavLink>
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 px-4 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
          }
        >
          <span className="text-xl">💬</span>
          <span className="text-xs mt-1">对话</span>
        </NavLink>
      </nav>
    </div>
  );
}
