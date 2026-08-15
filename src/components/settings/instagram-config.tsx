'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

type InstagramRule = {
  id?: string;
  keyword: string;
  match_type: 'contains' | 'exact' | 'word';
  trigger_type: 'dm' | 'comment' | 'both';
  reply_text?: string;
  is_active?: boolean;
};

const MASKED_TOKEN = '••••••••••';

export function InstagramConfig() {
  const { user, accountId, loading: sessionLoading, profileLoading, canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [matchType, setMatchType] = useState<InstagramRule['match_type']>('contains');
  const [triggerType, setTriggerType] = useState<InstagramRule['trigger_type']>('both');
  const [rules, setRules] = useState<InstagramRule[]>([]);

  useEffect(() => {
    if (sessionLoading || profileLoading || !user || !accountId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const response = await fetch('/api/instagram/config', { method: 'GET' });
        const payload = await response.json();
        setBusinessAccountId(payload.config?.business_account_id ?? '');
        setVerifyToken(payload.config?.webhook_verify_token ?? '');
        setAccessToken(payload.config?.access_token ?? '');
        setRules((payload.rules ?? []).map((rule: InstagramRule) => ({ ...rule, is_active: rule.is_active ?? true })));
      } catch (error) {
        console.error('[instagram-config] failed to load config:', error);
        toast.error('Failed to load Instagram configuration');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [sessionLoading, profileLoading, user, accountId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditSettings) {
      toast.error('You do not have permission to edit workspace settings');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/instagram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_account_id: businessAccountId,
          access_token: accessToken && accessToken !== MASKED_TOKEN ? accessToken : '',
          webhook_verify_token: verifyToken,
          keywords: rules,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save Instagram settings');
      }

      toast.success('Instagram settings saved');
      if (payload.config?.access_token) {
        setAccessToken(MASKED_TOKEN);
      }
    } catch (error) {
      console.error('[instagram-config] failed to save config:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save Instagram configuration');
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    const keyword = keywordInput.trim();
    if (!keyword) {
      toast.error('Enter a keyword before saving it');
      return;
    }

    setRules((current) => [
      ...current,
      {
        keyword,
        match_type: matchType,
        trigger_type: triggerType,
        reply_text: '',
        is_active: true,
      },
    ]);
    setKeywordInput('');
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, idx) => idx !== index));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instagram</CardTitle>
        <CardDescription>Manage Instagram DM/comment keyword automation and webhook settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <AlertTitle>Keyword rules are stored in the app</AlertTitle>
          <AlertDescription>
            Keep your keyword triggers in the workspace database instead of environment variables so your team can add, edit, and remove rules without redeploying.
          </AlertDescription>
        </Alert>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading Instagram settings…</p>
        ) : (
          <form className="space-y-6" onSubmit={handleSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="instagram-business-account-id">Business account ID</Label>
                <Input
                  id="instagram-business-account-id"
                  value={businessAccountId}
                  onChange={(event) => setBusinessAccountId(event.target.value)}
                  placeholder="17841402123456789"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagram-webhook-token">Webhook verify token</Label>
                <Input
                  id="instagram-webhook-token"
                  value={verifyToken}
                  onChange={(event) => setVerifyToken(event.target.value)}
                  placeholder="your-custom-token"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram-access-token">Access token</Label>
              <Input
                id="instagram-access-token"
                type="password"
                value={accessToken || ''}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="Paste an Instagram Graph API access token"
              />
            </div>

            <div className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="instagram-keyword">Keyword</Label>
                  <Input
                    id="instagram-keyword"
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                    placeholder="price, quote, hello"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagram-match-type">Match type</Label>
                  <select
                    id="instagram-match-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={matchType}
                    onChange={(event) => setMatchType(event.target.value as InstagramRule['match_type'])}
                  >
                    <option value="contains">Contains</option>
                    <option value="exact">Exact</option>
                    <option value="word">Whole word</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagram-trigger-type">Trigger</Label>
                  <select
                    id="instagram-trigger-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={triggerType}
                    onChange={(event) => setTriggerType(event.target.value as InstagramRule['trigger_type'])}
                  >
                    <option value="both">DM + comment</option>
                    <option value="dm">DM only</option>
                    <option value="comment">Comment only</option>
                  </select>
                </div>

                <Button type="button" variant="secondary" onClick={addRule}>
                  Add rule
                </Button>
              </div>

              <div className="space-y-2">
                {rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keyword rules configured yet.</p>
                ) : (
                  rules.map((rule, index) => (
                    <div key={`${rule.keyword}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                      <div>
                        <p className="font-medium">{rule.keyword}</p>
                        <p className="text-xs text-muted-foreground">
                          {rule.match_type} · {rule.trigger_type}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(index)}>
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Button type="submit" disabled={saving || !canEditSettings}>
              {saving ? 'Saving…' : 'Save Instagram settings'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
