/**
 * File: src/components/UnsavedChangesGuard.tsx
 *
 * Asks "Leave without saving?" when there are unsaved changes and the user tries to leave:
 * - inside the app (links, back button): a dialog with "Stay" and "Leave without saving"
 * - closing or reloading the tab: the browser's own warning
 */
import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

export function UnsavedChangesGuard({ when, what }: { when: boolean; what: string }) {
  const blocker = useBlocker(when);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (blocker.state === 'blocked') dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [blocker.state]);

  useEffect(() => {
    if (!when) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [when]);

  return (
    <dialog ref={dialogRef} className="dialog" onCancel={() => blocker.reset?.()} aria-labelledby="unsaved-title">
      <h2 id="unsaved-title">Leave without saving?</h2>
      <p>Your changes to {what} haven’t been saved yet.</p>
      <div className="button-row">
        <button type="button" className="button button-primary" onClick={() => blocker.reset?.()} autoFocus>
          Stay and save
        </button>
        <button type="button" className="button button-quiet" onClick={() => blocker.proceed?.()}>
          Leave without saving
        </button>
      </div>
    </dialog>
  );
}
