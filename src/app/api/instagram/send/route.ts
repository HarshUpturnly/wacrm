import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendInstagramDm } from '@/lib/instagram/sender';

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.account_id) return null;
  return data.account_id as string;
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
    const recipientId = typeof body?.recipient_id === 'string' ? body.recipient_id.trim() : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!recipientId || !text) {
      return NextResponse.json({ error: 'recipient_id and text are required.' }, { status: 400 });
    }

    const { data: config, error: configError } = await supabase
      .from('instagram_configs')
      .select('business_account_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError || !config?.business_account_id || !config.access_token) {
      return NextResponse.json({ error: 'Instagram is not configured for this account.' }, { status: 400 });
    }

    const accessToken = decrypt(config.access_token);
    const result = await sendInstagramDm({
      businessAccountId: config.business_account_id,
      accessToken,
      recipientId,
      text,
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error('[instagram/send] failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to send Instagram message';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
