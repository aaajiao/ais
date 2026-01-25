// 在页面加载前应用主题，避免闪烁
(function() {
  const theme = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme !== 'light' && systemDark);
  document.documentElement.classList.add(isDark ? 'dark' : 'light');
})();
