import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature';
import { dispatchInstagramInbound } from '@/lib/instagram/keyword-router';

async function resolveInstagramAccountId(payload: Record<string, unknown>): Promise<string | null> {
  const candidateIds = new Set<string>();

  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && record.id.trim()) candidateIds.add(record.id.trim());
    if (typeof record.business_account_id === 'string' && record.business_account_id.trim()) {
      candidateIds.add(record.business_account_id.trim());
    }
    if (Array.isArray(record)) {
      for (const item of record) walk(item);
      return;
    }
    for (const valueItem of Object.values(record)) {
      walk(valueItem);
    }
  };

  walk(payload);

  const ids = Array.from(candidateIds).filter(Boolean);
  if (!ids.length) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('instagram_configs')
    .select('account_id')
    .in('business_account_id', ids)
    .limit(1);

  if (error) {
    console.error('[instagram/webhook] failed to resolve account id:', error);
    return null;
  }

  return data?.[0]?.account_id ?? null;
}

function readInstagramText(payload: Record<string, unknown>): string | null {
  const text =
    (payload?.message as Record<string, unknown> | undefined)?.text as string | undefined ??
    (payload?.message as Record<string, unknown> | undefined)?.caption as string | undefined ??
    (payload?.comment_text as string | undefined) ??
    (payload?.text as string | undefined) ??
    (payload?.value as Record<string, unknown> | undefined)?.text as string | undefined ??
    null;
  return text?.trim() ? text.trim() : null;
}

function readInstagramEventSource(payload: Record<string, unknown>): 'dm' | 'comment' {
  if (payload && typeof payload === 'object' && 'comment' in payload) return 'comment';
  return 'dm';
}

function extractInstagramMessage(payload: Record<string, unknown>) {
  const eventSource = readInstagramEventSource(payload);
  const senderId =
    ((payload?.sender as Record<string, unknown> | undefined)?.id as string | undefined) ??
    ((payload?.from as Record<string, unknown> | undefined)?.id as string | undefined) ??
    ((payload?.value as Record<string, unknown> | undefined)?.from as string | undefined) ??
    null;

  const messageId =
    ((payload?.message as Record<string, unknown> | undefined)?.mid as string | undefined) ??
    ((payload?.id as string | undefined)) ??
    null;

  const text = readInstagramText(payload);

  return {
    source: eventSource,
    senderId,
    messageId,
    text,
  };
}

async function processInstagramWebhook(body: Record<string, unknown>): Promise<void> {
  const accountId = await resolveInstagramAccountId(body);
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const itemList = Array.isArray((entry as Record<string, unknown>)?.messaging)
      ? ((entry as Record<string, unknown>).messaging as Array<Record<string, unknown>>)
      : [];

    for (const item of itemList) {
      const message = item?.message as Record<string, unknown> | undefined;
      const senderId =
        ((item?.sender as Record<string, unknown> | undefined)?.id as string | undefined) ??
        ((item?.from as Record<string, unknown> | undefined)?.id as string | undefined) ??
        null;

      const text = message?.text as string | undefined;
      if (!senderId || !text || !text.trim()) continue;

      await dispatchInstagramInbound({
        source: 'dm',
        senderId,
        messageId: (message?.mid as string | undefined) ?? (item?.id as string | undefined) ?? undefined,
        text,
        accountId,
      });
    }

    const changes = Array.isArray((entry as Record<string, unknown>)?.changes)
      ? ((entry as Record<string, unknown>).changes as Array<Record<string, unknown>>)
      : [];

    for (const change of changes) {
      const value = change?.value as Record<string, unknown> | undefined;
      if (!value) continue;
      const commentText =
        (value?.text as string | undefined) ??
        ((value?.message as Record<string, unknown> | undefined)?.text as string | undefined) ??
        null;
      const senderId =
        ((value?.from as Record<string, unknown> | undefined)?.id as string | undefined) ??
        ((value?.sender as Record<string, unknown> | undefined)?.id as string | undefined) ??
        null;
      if (!senderId || !commentText || !commentText.trim()) continue;

      await dispatchInstagramInbound({
        source: 'comment',
        senderId,
        messageId: (value?.id as string | undefined) ?? (change?.id as string | undefined) ?? undefined,
        text: commentText,
        accountId,
      });
    }
  }

  const rawItems = Array.isArray(body?.data) ? body.data : [];
  for (const item of rawItems) {
    const itemRecord = item as Record<string, unknown>;
    const parsed = extractInstagramMessage(itemRecord);
    if (!parsed.senderId || !parsed.text) continue;
    await dispatchInstagramInbound({
      source: parsed.source,
      senderId: parsed.senderId,
      messageId: parsed.messageId ?? undefined,
      text: parsed.text,
      accountId,
    });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = searchParams.get('hub.verify_token');

  if (mode !== 'subscribe' || !challenge || !verifyToken) {
    return NextResponse.json({ error: 'Missing verification parameters' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('instagram_configs')
    .select('id')
    .eq('webhook_verify_token', verifyToken)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Verification token mismatch' }, { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  await processInstagramWebhook(body);

  return NextResponse.json({ status: 'received' }, { status: 200 });
}
