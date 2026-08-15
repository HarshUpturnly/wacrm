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
    is_active: rule.is_active !== false,
  };
}

export async function GET() {
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
