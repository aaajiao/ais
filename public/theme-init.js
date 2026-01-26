// 在页面加载前应用主题，避免闪烁
(function() {
  const theme = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme !== 'light' && systemDark);
  document.documentElement.classList.add(isDark ? 'dark' : 'light');

  // 更新 theme-color meta 标签以匹配当前主题
  function updateThemeColor() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    const themeColor = isDarkMode ? '#0c0a09' : '#fafaf9'; // stone-950 / stone-50
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', themeColor);
    }
  }

  // 监听主题变化
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'class') {
        updateThemeColor();
      }
    });
  });

  observer.observe(document.documentElement, { attributes: true });

  // 初始化 theme-color
  updateThemeColor();
})();
