'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadAccountMedia, MEDIA_MAX_BYTES } from '@/lib/storage/upload-media';

type Product = {
  id?: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  keyword?: string;
  file_public_url?: string;
  file_path?: string;
  is_active?: boolean;
};

export function ProductsSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [currency, setCurrency] = useState('INR');
  const [keyword, setKeyword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = (await import('@/lib/supabase/client')).createClient();
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setProducts(data ?? []);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load products');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleUploadFile(): Promise<{ publicUrl: string; path?: string } | null> {
    if (!file) return null;
    if (file.size > MEDIA_MAX_BYTES) throw new Error('File is too large');
    setUploading(true);
    try {
      const { publicUrl, path } = await uploadAccountMedia('chat-media', file);
      return { publicUrl, path };
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      let uploaded: { publicUrl: string; path?: string } | null = null;
      if (file) uploaded = await handleUploadFile();

      const payload = {
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price) || 0,
        currency: currency.trim() || 'INR',
        keyword: keyword.trim() || null,
        file_public_url: uploaded?.publicUrl ?? null,
        file_path: uploaded?.path ?? null,
        is_active: true,
      } as Record<string, unknown>;

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save product');

      toast.success('Product saved');
      setProducts((p) => [data.product, ...p]);
      setName('');
      setDescription('');
      setPrice('0');
      setKeyword('');
      setFile(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Products</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleCreate}>
          <div>
            <Label htmlFor="product-name">Name</Label>
            <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="product-description">Description</Label>
            <Input id="product-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="product-price">Price</Label>
              <Input id="product-price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="product-currency">Currency</Label>
              <Input id="product-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="product-keyword">Keyword (optional)</Label>
            <Input id="product-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword that triggers this product" />
          </div>

          <div>
            <Label htmlFor="product-file">File</Label>
            <input id="product-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Uploaded file will be sent over WhatsApp after payment confirmation.</p>
          </div>

          <Button type="submit" disabled={saving || uploading}>{saving ? 'Saving…' : 'Save product'}</Button>
        </form>

        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-medium">Existing products</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : (
            products.map((p) => (
              <div key={p.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                    <div className="text-xs text-muted-foreground">{p.price} {p.currency} {p.keyword ? `· keyword: ${p.keyword}` : ''}</div>
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
