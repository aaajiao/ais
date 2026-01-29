import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfile, useUpdateProfile } from '@/hooks/queries/useProfile';
import { Input } from '@/components/ui/input';
import { Lightbulb } from 'lucide-react';

export default function ProfileSettings() {
  const { t } = useTranslation('settings');
  const { name, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [inputValue, setInputValue] = useState('');
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (name !== null && name !== undefined && !initializedRef.current) {
      setInputValue(name);
      initializedRef.current = true;
    }
  }, [name]);

  const saveValue = useCallback((value: string) => {
    const trimmed = value.trim();
    const currentName = name || '';
    if (trimmed === currentName) return;

    updateProfile.mutate(trimmed || null, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  }, [name, updateProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveValue(value), 800);
  };

  // 失焦时立即保存
  const handleBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveValue(inputValue);
  };

  // 清理
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const previewStudioName = inputValue.trim()
    ? `${inputValue.trim()} studio`
    : 'aaajiao studio';

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">{t('profile.title')}</h2>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="artist-name" className="text-sm font-medium">
              {t('profile.artistName')}
            </label>
            {updateProfile.isPending && (
              <span className="text-xs text-muted-foreground">{t('profile.saving')}</span>
            )}
            {saved && (
              <span className="text-xs text-muted-foreground">{t('profile.saved')}</span>
            )}
            {updateProfile.isError && (
              <span className="text-xs text-destructive">{t('profile.error')}</span>
            )}
          </div>
          <Input
            id="artist-name"
            value={inputValue}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="aaajiao"
            disabled={isLoading}
          />
        </div>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {t('profile.hint', { studioName: previewStudioName })}
          </span>
        </div>
      </div>
    </div>
  );
}
