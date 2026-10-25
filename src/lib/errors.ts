/** Turn Supabase / API / network errors into short, human messages. */
interface MaybePgError {
  message?: string;
  code?: string;
  status?: number;
}

const BUSINESS_CODES = new Set(['P0001', 'P0002', '22023', '28000', '42501']);

export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const e = error as MaybePgError;
  if (e.code && BUSINESS_CODES.has(e.code) && e.message) return e.message;
  if (e.code === '23503' || e.code === '23001') return 'This record is still referenced by past orders. Archive it instead.';
  if (e.code === '23505') return 'That value is already in use.';
  if (e.code === '23514') return 'Some values are outside the allowed range.';
  if (e.code === '42501' || e.status === 403) return 'You do not have permission to do that.';
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  if (error instanceof Error && error.message && error.name === 'ApiError') return error.message;
  if (e.message && /JWT|token/i.test(e.message)) return 'Your session has expired. Please sign in again.';
  if (e.message && /Failed to fetch|NetworkError/i.test(e.message)) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  return fallback;
}
