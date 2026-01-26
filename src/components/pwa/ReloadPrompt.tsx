import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from 'react-i18next'

export function ReloadPrompt() {
  const { t } = useTranslation('common')
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      // Check for updates every hour
      if (r) {
        setInterval(() => {
          r.update()
        }, 60 * 60 * 1000)
      }
    }
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg p-4 shadow-lg max-w-xs">
      <p className="text-sm mb-3">{t('newVersionAvailable')}</p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="text-sm font-medium underline underline-offset-2 hover:no-underline"
      >
        {t('reloadNow')}
      </button>
    </div>
  )
}
