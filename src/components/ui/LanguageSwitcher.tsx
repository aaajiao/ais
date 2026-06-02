import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  // resolvedLanguage = 实际生效的语言（已归一为 'zh' / 'en'）；i18n.language 可能是带地区码
  // 的请求值（如非中文系统的 'de-DE'），用它判断会显示错语言。
  const current = i18n.resolvedLanguage ?? i18n.language;

  const toggleLanguage = () => {
    i18n.changeLanguage(current === 'zh' ? 'en' : 'zh');
  };

  return (
    <Button
      variant="ghost"
      size="small"
      onClick={toggleLanguage}
      title={current === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Languages />
      <span className="text-xs font-medium uppercase">{current}</span>
    </Button>
  );
}
