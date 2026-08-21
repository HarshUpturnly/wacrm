import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.account_id) return null;
  return data.account_id as string;
}

function sanitizeRule(rule: Record<string, unknown>) {
  const keyword = typeof rule.keyword === 'string' ? rule.keyword.trim() : '';
  if (!keyword) return null;

  const matchType = rule.match_type === 'exact' || rule.match_type === 'word' ? rule.match_type : 'contains';
  const triggerType = rule.trigger_type === 'dm' || rule.trigger_type === 'comment' ? rule.trigger_type : 'both';

  return {
    keyword,
    match_type: matchType,
    trigger_type: triggerType,
    reply_text: typeof rule.reply_text === 'string' ? rule.reply_text.trim() : '',
    product_id: typeof rule.product_id === 'string' && rule.product_id ? rule.product_id : null,
    whatsapp_link: typeof rule.whatsapp_link === 'string' && rule.whatsapp_link ? rule.whatsapp_link.trim() : null,
    is_active: rule.is_active !== false,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ config: null, rules: [] }, { status: 200 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // Support listing payment gateways when requested
    if (action === 'list_gateways') {
      const { data: gateways, error } = await supabase
        .from('payment_gateways')
        .select('id, provider, label, is_active, created_at, updated_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[instagram/config GET gateways] failed:', error);
        return NextResponse.json({ error: 'Failed to load gateways' }, { status: 500 });
      }
      return NextResponse.json({ gateways: gateways ?? [] });
    }

    const { data: config } = await supabase
      .from('instagram_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    const { data: rules } = await supabase
      .from('instagram_keyword_rules')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      config: config
        ? {
            ...config,
            access_token: config.access_token ? '••••••••••' : '',
          }
        : null,
      rules: (rules ?? []).map((rule) => ({
        ...rule,
        reply_text: rule.reply_text ?? '',
        product_id: rule.product_id ?? null,
        whatsapp_link: rule.whatsapp_link ?? null,
      })),
    });
  } catch (error) {
    console.error('[instagram/config GET] failed:', error);
    return NextResponse.json({ error: 'Failed to load Instagram settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 });
    }

    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action : '';

    // Save a payment gateway (encrypted) — POST with { action: 'save_payment_gateway', provider, label, config }
    if (action === 'save_payment_gateway') {
      const provider = typeof body.provider === 'string' ? body.provider : '';
      const label = typeof body.label === 'string' ? body.label : provider;
      const cfg = typeof body.config === 'string' ? body.config : '';
      if (!provider || !cfg) return NextResponse.json({ error: 'provider and config are required' }, { status: 400 });

      try {
        const encrypted = encrypt(cfg);
        const { data: inserted, error: insertError } = await supabase
          .from('payment_gateways')
          .insert({ account_id: accountId, provider, label, config: encrypted, is_active: true })
          .select('id, provider, label, is_active, created_at')
          .single();
        if (insertError || !inserted) {
          console.error('[instagram/config POST gateway] insert failed:', insertError);
          return NextResponse.json({ error: 'Failed to save gateway' }, { status: 500 });
        }
        return NextResponse.json({ gateway: inserted });
      } catch (err) {
        console.error('[instagram/config POST gateway] failed:', err);
        return NextResponse.json({ error: 'Failed to save gateway' }, { status: 500 });
      }
    }

    const {
      business_account_id,
      access_token,
      webhook_verify_token,
      keywords,
    } = body ?? {};

    const nextBusinessAccountId = typeof business_account_id === 'string' ? business_account_id.trim() : '';
    const nextVerifyToken = typeof webhook_verify_token === 'string' ? webhook_verify_token.trim() : '';
    const nextAccessToken = typeof access_token === 'string' ? access_token.trim() : '';

    const { data: existingConfig, error: existingConfigError } = await supabase
      .from('instagram_configs')
      .select('id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (existingConfigError) {
      console.error('[instagram/config POST] failed to load existing config:', existingConfigError);
      return NextResponse.json({ error: 'Unable to load Instagram config.' }, { status: 500 });
    }

    const configPayload: Record<string, string | boolean | null> = {
      account_id: accountId,
      business_account_id: nextBusinessAccountId || null,
      webhook_verify_token: nextVerifyToken || null,
      is_active: true,
    };

    if (nextAccessToken) {
      configPayload.access_token = encrypt(nextAccessToken);
    } else if (existingConfig?.access_token) {
      configPayload.access_token = existingConfig.access_token;
    }

    let configId = existingConfig?.id;
    if (configId) {
      const { error: updateError } = await supabase
        .from('instagram_configs')
        .update(configPayload)
        .eq('id', configId);

      if (updateError) {
        console.error('[instagram/config POST] failed to update config:', updateError);
        return NextResponse.json({ error: 'Failed to save Instagram configuration.' }, { status: 500 });
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('instagram_configs')
        .insert(configPayload)
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error('[instagram/config POST] failed to insert config:', insertError);
        return NextResponse.json({ error: 'Failed to save Instagram configuration.' }, { status: 500 });
      }

      configId = inserted.id;
    }

    const ruleEntries = Array.isArray(keywords)
      ? keywords
          .map((rule) => sanitizeRule(rule as Record<string, unknown>))
          .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
      : [];

    await supabase.from('instagram_keyword_rules').delete().eq('account_id', accountId);

    if (ruleEntries.length) {
      const rows = ruleEntries.map((rule) => ({
        account_id: accountId,
        keyword: rule.keyword,
        match_type: rule.match_type,
        trigger_type: rule.trigger_type,
        reply_text: rule.reply_text || null,
        product_id: rule.product_id || null,
        whatsapp_link: rule.whatsapp_link || null,
        is_active: rule.is_active,
      }));

      const { error: rulesError } = await supabase.from('instagram_keyword_rules').insert(rows);
      if (rulesError) {
        console.error('[instagram/config POST] failed to save rules:', rulesError);
        return NextResponse.json({ error: 'Failed to save Instagram keyword rules.' }, { status: 500 });
      }
    }

    const { data: savedConfig } = await supabase
      .from('instagram_configs')
      .select('business_account_id, webhook_verify_token, is_active')
      .eq('id', configId)
      .single();

    return NextResponse.json({
      success: true,
      config: savedConfig,
      rules: ruleEntries,
    });
  } catch (error) {
    console.error('[instagram/config POST] failed:', error);
    return NextResponse.json({ error: 'Failed to save Instagram settings' }, { status: 500 });
  }
}
