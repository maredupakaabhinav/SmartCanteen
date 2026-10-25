import { supabase } from './supabase';

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Call the trusted server API (/api/*) with the user's access token. */
export async function apiRequest<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('You appear to be offline. Check your connection and try again.', 0);
  }
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'Something went wrong. Please try again.', response.status);
  }
  return payload as T;
}
