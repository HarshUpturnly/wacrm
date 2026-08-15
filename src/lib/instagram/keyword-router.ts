import { createClient } from '@/lib/supabase/server';
import { runAutomationsForTrigger } from '@/lib/automations/engine';

export type InstagramKind = 'dm' | 'comment';

export interface InstagramInboundEvent {
  source: InstagramKind;
  accountId?: string | null;
  senderId: string;
  messageId?: string;
  text: string;
}

export type InstagramKeywordMatchMode = 'contains' | 'exact' | 'word';

export interface InstagramKeywordRule {
  id?: string;
  account_id: string;
  keyword: string;
  match_type: InstagramKeywordMatchMode;
  trigger_type: InstagramKind | 'both';
  is_active: boolean;
}

export function normalizeInstagramText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function matchesInstagramKeyword(
  text: string,
  keywords: string[],
  matchType: InstagramKeywordMatchMode = 'contains',
  caseSensitive = false,
): boolean {
  const haystack = caseSensitive ? text : normalizeInstagramText(text);
  for (const raw of keywords) {
    if (!raw || !raw.trim()) continue;
    const needle = caseSensitive ? raw.trim() : normalizeInstagramText(raw);
    if (matchType === 'exact') {
      if (haystack === needle) return true;
      continue;
    }
    if (matchType === 'word') {
      const words = haystack.split(/\s+/g).filter(Boolean);
      if (words.includes(needle)) return true;
      continue;
    }
    if (haystack.includes(needle)) return true;
  }
  return false;
}

export function parseInstagramKeywordConfig(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getInstagramAccountId(value?: string | null): string | null {
  return value?.trim() || null;
}

export async function getInstagramKeywordRules(accountId: string): Promise<InstagramKeywordRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('instagram_keyword_rules')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[instagram] failed to load keyword rules:', error);
    return [];
  }

  return (data ?? []) as InstagramKeywordRule[];
}

export async function dispatchInstagramInbound(event: InstagramInboundEvent): Promise<boolean> {
  const accountId = getInstagramAccountId(event.accountId ?? null);
  const text = event.text ?? '';

  if (!text.trim()) return false;

  if (!accountId) {
    console.warn('[instagram] no accountId configured for inbound event; skipping automation dispatch.', {
      senderId: event.senderId,
      source: event.source,
    });
    return false;
  }

  await runAutomationsForTrigger({
    accountId,
    triggerType: 'new_message_received',
    context: {
      message_text: text,
      conversation_id: event.messageId,
    },
  });

  const rules = await getInstagramKeywordRules(accountId);
  const match = rules.find((rule) => {
    if (!rule.is_active) return false;
    if (rule.trigger_type !== 'both' && rule.trigger_type !== event.source) return false;
    return matchesInstagramKeyword(text, [rule.keyword], rule.match_type);
  });

  if (!match) return false;

  await runAutomationsForTrigger({
    accountId,
    triggerType: 'keyword_match',
    context: {
      message_text: text,
      conversation_id: event.messageId,
      vars: {
        keyword: match.keyword,
        match_type: match.match_type,
      },
    },
  });

  return true;
}
