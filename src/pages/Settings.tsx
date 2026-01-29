import { useTranslation } from 'react-i18next';
import ModelSettings from '@/components/settings/ModelSettings';
import ExportSettings from '@/components/settings/ExportSettings';
import ProfileSettings from '@/components/settings/ProfileSettings';
import AccountSettings from '@/components/settings/AccountSettings';

export default function Settings() {
  const { t } = useTranslation('settings');

  return (
    <div className="p-6 pb-[var(--spacing-nav-bottom)] lg:pb-6">
      <h1 className="text-page-title mb-6 xl:mb-8">{t('title')}</h1>

      {/* AI 模型设置 */}
      <ModelSettings />

      {/* 数据导出 */}
      <ExportSettings />

      {/* 项目信息 */}
      <ProfileSettings />

      {/* 账户信息 */}
      <AccountSettings />
    </div>
  );
}
