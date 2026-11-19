/**
 * File: src/lib/usePageTitle.ts
 *
 * Sets the browser tab title for a page, e.g. "My sessions - Thought".
 */
import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - Thought`;
  }, [title]);
}
