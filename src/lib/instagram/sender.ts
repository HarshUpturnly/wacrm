export interface InstagramSendTextArgs {
  businessAccountId: string
  accessToken: string
  recipientId: string
  text: string
}

interface InstagramApiErrorShape {
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

async function readInstagramError(response: Response): Promise<never> {
  let message = `Instagram API error: ${response.status}`
  try {
    const data = (await response.json()) as InstagramApiErrorShape
    if (data.error?.message) message = data.error.message
  } catch {
    // ignore non-JSON payloads and fall back to the HTTP status
  }
  throw new Error(message)
}

export async function sendInstagramDm(
  args: InstagramSendTextArgs,
): Promise<{ messageId: string }> {
  const { businessAccountId, accessToken, recipientId, text } = args
  if (!businessAccountId) throw new Error('Instagram business account ID is required.')
  if (!recipientId) throw new Error('Instagram recipient user ID is required.')
  if (!text.trim()) throw new Error('Instagram outbound message cannot be empty.')

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${businessAccountId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_type: 'RESPONSE',
        recipient: { id: recipientId },
        message: { text },
      }),
    },
  )

  if (!response.ok) {
    await readInstagramError(response)
  }

  const data = (await response.json()) as { message_id?: string; id?: string }
  return { messageId: data.message_id ?? data.id ?? '' }
}
