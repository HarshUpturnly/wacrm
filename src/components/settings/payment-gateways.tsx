'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Gateway = {
  id?: string;
  provider: 'stripe' | 'payu' | 'razorpay';
  label: string;
  is_active?: boolean;
};

export function PaymentGatewaysSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gateways, setGateways] = useState<Gateway[]>([]);

  const [provider, setProvider] = useState<Gateway['provider']>('stripe');
  const [label, setLabel] = useState('');
  const [credentials, setCredentials] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/instagram/config?action=list_gateways');
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || 'Failed to load gateways');
        setGateways(payload.gateways ?? []);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load payment gateways');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/instagram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_payment_gateway', provider, label: label.trim() || provider, config: credentials.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save gateway');

      toast.success('Gateway saved');
      setGateways((g) => [data.gateway, ...g]);
      setLabel('');
      setCredentials('');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to save gateway');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment gateways</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleCreate}>
          <div>
            <Label htmlFor="gateway-provider">Provider</Label>
            <select id="gateway-provider" value={provider} onChange={(e) => setProvider(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="stripe">Stripe</option>
              <option value="payu">PayU</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </div>

          <div>
            <Label htmlFor="gateway-label">Label</Label>
            <Input id="gateway-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Friendly name for this account" />
          </div>

          <div>
            <Label htmlFor="gateway-creds">Credentials (JSON)</Label>
            <Input id="gateway-creds" value={credentials} onChange={(e) => setCredentials(e.target.value)} placeholder='Paste provider credentials as JSON (kept encrypted)' />
            <p className="text-xs text-muted-foreground">Credentials are stored encrypted and used server-side for creating checkouts / validating webhooks.</p>
          </div>

          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save gateway'}</Button>
        </form>

        <div className="mt-6">
          <h3 className="text-sm font-medium">Configured gateways</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : gateways.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gateways configured.</p>
          ) : (
            gateways.map((g) => (
              <div key={g.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{g.label || g.provider}</div>
                    <div className="text-xs text-muted-foreground">{g.provider}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
