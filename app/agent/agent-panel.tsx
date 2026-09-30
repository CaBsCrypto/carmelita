"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

export default function AgentPanel({
  title,
  onClose,
  children,
  closeLabel = "Cerrar",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [mounted]);

  useEffect(() => {
    if (mounted) dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [mounted, title]);

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      className="agent-panel"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <header className="agent-panel-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" autoFocus aria-label={closeLabel} onClick={onClose}>{closeLabel}</button>
      </header>
      <div className="agent-panel-content">{children}</div>
    </dialog>,
    document.body,
  );
}
