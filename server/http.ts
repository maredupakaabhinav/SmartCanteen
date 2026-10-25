/** Small helpers for Web-standard Request/Response handlers. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    /** Safe to show to the user. */
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid request body.');
  }
}

export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new HttpError(401, 'Please sign in to continue.');
  return match[1]!;
}

type Handler = (request: Request) => Promise<Response>;

/** Wrap a handler with method checking and safe error responses. */
export function route(method: 'GET' | 'POST', handler: Handler): Handler {
  return async (request) => {
    if (request.method !== method) {
      return json({ error: 'Method not allowed.' }, 405);
    }
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.publicMessage }, error.status);
      }
      // Log the message only — never request bodies, keys or signatures.
      console.error('[api] unexpected error:', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  };
}
