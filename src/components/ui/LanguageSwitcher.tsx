import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      variant="ghost"
      size="small"
      onClick={toggleLanguage}
      title={i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Languages />
      <span className="text-xs font-medium uppercase">{i18n.language}</span>
    </Button>
  );
}
