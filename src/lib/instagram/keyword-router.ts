import { createClient } from '@/lib/supabase/server';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { sendInstagramDm } from '@/lib/instagram/sender';
import { decrypt } from '@/lib/whatsapp/encryption';
import { verifyPhoneNumber } from '@/lib/whatsapp/meta-api';

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
  // Optional: explicit WhatsApp link to send back to the user
  whatsapp_link?: string | null;
  // Optional: product reference for product-linked keyword rules
  product_id?: string | null;
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

  // Attempt to build a WhatsApp prefilled link and reply to the Instagram sender
  try {
    const supabase = await createClient();

    // Prefer an explicit whatsapp_link on the rule
    let waLink: string | null = match.whatsapp_link || null;

    // If no explicit link, try to build one from the account's whatsapp config
    if (!waLink) {
      const { data: waCfg } = await supabase
        .from('whatsapp_config')
        .select('phone_number_id, access_token')
        .eq('account_id', accountId)
        .maybeSingle();

      if (waCfg?.phone_number_id && waCfg?.access_token) {
        try {
          const accessToken = decrypt(waCfg.access_token as string);
          const info = await verifyPhoneNumber({ phoneNumberId: waCfg.phone_number_id as string, accessToken });
          const raw = info.display_phone_number || '';
          const digits = raw.replace(/\D+/g, '');
          const prefill = encodeURIComponent(`Hi, I'm interested in ${match.keyword}`);
          if (digits) waLink = `https://wa.me/${digits}?text=${prefill}`;
        } catch (err) {
          console.warn('[instagram] failed to build wa link from whatsapp_config:', err);
        }
      }
    }

    // If the rule references a product, prefer to include that product keyword in prefill
    if (match.product_id && !waLink) {
      try {
        const { data: product } = await supabase.from('products').select('*').eq('id', match.product_id).maybeSingle();
        if (product) {
          // If product has its own keyword, include that in the prefill so the inbox webhook can route it
          const prefill = encodeURIComponent(`BUY ${product.keyword ?? product.name}`);

          const { data: waCfg2 } = await supabase
            .from('whatsapp_config')
            .select('phone_number_id, access_token')
            .eq('account_id', accountId)
            .maybeSingle();

          if (waCfg2?.phone_number_id && waCfg2?.access_token) {
            try {
              const accessToken = decrypt(waCfg2.access_token as string);
              const info = await verifyPhoneNumber({ phoneNumberId: waCfg2.phone_number_id as string, accessToken });
              const raw = info.display_phone_number || '';
              const digits = raw.replace(/\D+/g, '');
              if (digits) waLink = `https://wa.me/${digits}?text=${prefill}`;
            } catch (err) {
              console.warn('[instagram] failed to build wa link for product:', err);
            }
          }
        }
      } catch (err) {
        console.warn('[instagram] product lookup failed:', err);
      }
    }

    if (waLink) {
      // Reply to the Instagram sender with the WhatsApp link so they can click and start the flow
      try {
        const { data: igCfg } = await supabase.from('instagram_configs').select('business_account_id, access_token').eq('account_id', accountId).maybeSingle();
        if (igCfg?.business_account_id && igCfg?.access_token) {
          const igToken = decrypt(igCfg.access_token as string);
          await sendInstagramDm({ businessAccountId: igCfg.business_account_id as string, accessToken: igToken, recipientId: event.senderId, text: `Open WhatsApp to continue: ${waLink}` });
        }
      } catch (err) {
        console.warn('[instagram] failed to send DM with wa link:', err);
      }
    }
  } catch (err) {
    console.warn('[instagram] error while attempting to send wa link on keyword match:', err);
  }

  return true;
}
