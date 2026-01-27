import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export default function AccountSettings() {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuthContext();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-4">{t('account.title')}</h2>

      {user ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-12 h-12 rounded-full"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <p className="font-medium">
                {user.user_metadata?.full_name || user.email}
              </p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              variant="destructive"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? t('account.signingOut') : t('account.signOut')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">{t('account.notLoggedIn')}</p>
      )}
    </div>
  );
}
