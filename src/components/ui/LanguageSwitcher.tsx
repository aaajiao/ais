import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="p-2 rounded-lg hover:bg-accent transition-colors flex items-center gap-1"
      title={i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Languages className="w-5 h-5" />
      <span className="text-xs font-medium uppercase">{i18n.language}</span>
    </button>
  );
}
