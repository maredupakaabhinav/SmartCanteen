import { useEffect } from 'react';

const BASE = 'Smart Canteen';

/** Sets a descriptive document title for each page (important for screen readers and tabs). */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : `${BASE} — Order ahead, skip the queue`;
  }, [title]);
}
