import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Key, Plus, Copy, Check, Trash2, Ban, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
import { useApiKeys } from '@/hooks/useApiKeys';
import type { ApiKey } from '@/lib/types';

export default function ApiKeySettings() {
  const { t } = useTranslation('settings');
  const { keys, isLoading, createKey, revokeKey, deleteKey } = useApiKeys();

  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const activeKeys = keys.filter(k => !k.revoked_at);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const { rawKey } = await createKey(newKeyName.trim());
      setCreatedRawKey(rawKey);
      setNewKeyName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdRawKey) return;
    try {
      await navigator.clipboard.writeText(createdRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleRevoke = async (key: ApiKey) => {
    if (!confirm(t('apiKeys.confirmRevoke'))) return;
    try {
      await revokeKey(key.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  };

  const handleDelete = async (key: ApiKey) => {
    if (!confirm(t('apiKeys.confirmDelete'))) return;
    try {
      await deleteKey(key.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete key');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('apiKeys.never');
    return new Date(dateStr).toLocaleDateString();
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Key className="w-5 h-5" />
        <h2 className="text-lg font-semibold">{t('apiKeys.title')}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t('apiKeys.description')}</p>

      {/* 创建区域 */}
      {createdRawKey ? (
        <div className="p-4 bg-muted/50 rounded-lg mb-4 border border-border">
          <p className="font-medium mb-1">{t('apiKeys.keyCreated')}</p>
          <p className="text-sm text-muted-foreground mb-3">{t('apiKeys.keyCreatedWarning')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-background rounded border border-border text-sm font-mono break-all">
              {createdRawKey}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="ml-1">{copied ? t('apiKeys.copied') : t('apiKeys.copy')}</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setCreatedRawKey(null)}
          >
            OK
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder={t('apiKeys.namePlaceholder')}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Button
            onClick={handleCreate}
            disabled={isCreating || !newKeyName.trim() || activeKeys.length >= 5}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            {isCreating ? t('apiKeys.creating') : t('apiKeys.create')}
          </Button>
        </div>
      )}

      {activeKeys.length >= 5 && (
        <p className="text-sm text-muted-foreground mb-4">{t('apiKeys.maxKeysReached')}</p>
      )}

      {/* Key 列表 */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('apiKeys.noKeys')}</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('apiKeys.noKeys')}</p>
      ) : (
        <div className="space-y-2 mb-4">
          {keys.map(key => (
            <div
              key={key.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                key.revoked_at ? 'bg-muted/30 opacity-60' : 'bg-muted/50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{key.name}</span>
                  <code className="text-xs text-muted-foreground font-mono">{key.key_prefix}...</code>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    key.revoked_at
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {key.revoked_at ? t('apiKeys.revoked') : t('apiKeys.active')}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t('apiKeys.lastUsed')}: {formatDate(key.last_used_at)}
                  {' · '}
                  {key.request_count} {t('apiKeys.requests')}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {!key.revoked_at && (
                  <Button variant="ghost" size="sm" onClick={() => handleRevoke(key)} title={t('apiKeys.revoke')}>
                    <Ban className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)} title={t('apiKeys.delete')}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* API 文档折叠 */}
      <button
        onClick={() => setShowDocs(!showDocs)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        {showDocs ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {t('apiKeys.docsTitle')}
      </button>
      {showDocs && (
        <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-3">
          <div>
            <p className="font-medium mb-1">{t('apiKeys.docsEndpoint')}</p>
            <code className="text-xs bg-background px-2 py-1 rounded border border-border">
              POST {baseUrl}/api/external/v1/query
            </code>
          </div>
          <div>
            <p className="font-medium mb-1">Example</p>
            <pre className="text-xs bg-background px-3 py-2 rounded border border-border overflow-x-auto whitespace-pre">{`curl -X POST ${baseUrl}/api/external/v1/query \\
  -H "X-API-Key: ak_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"search_artworks","params":{"query":"video"}}'`}</pre>
          </div>
          <div>
            <p className="font-medium mb-1">{t('apiKeys.docsActions')}</p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
              <li><code>search_artworks</code> — title, year, type, materials</li>
              <li><code>search_editions</code> — status, location, buyer, price</li>
              <li><code>search_locations</code> — name, city, type, country</li>
              <li><code>search_history</code> — edition changes, sales, dates</li>
              <li><code>get_statistics</code> — overview, by_status, by_location</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">Schema</p>
            <code className="text-xs bg-background px-2 py-1 rounded border border-border">
              GET {baseUrl}/api/external/v1/schema
            </code>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
        <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{t('apiKeys.hint')}</span>
      </p>
    </div>
  );
}
