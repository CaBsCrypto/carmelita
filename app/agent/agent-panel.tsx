"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

function panelTabStops(dialog: HTMLDialogElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]',
  )).filter(element => {
    if (element.tabIndex < 0 || element.matches(":disabled, [aria-disabled='true']")
      || element.closest("[hidden], [inert], [aria-hidden='true']") || element.getClientRects().length === 0) return false;
    const visibility = window.getComputedStyle(element).visibility;
    if (visibility === "hidden" || visibility === "collapse") return false;
    // A closed details exposes only its first summary, including nested descendants.
    for (let ancestor = element.parentElement; ancestor && ancestor !== dialog; ancestor = ancestor.parentElement) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
        const summary = ancestor.querySelector(":scope > summary");
        if (!summary?.contains(element)) return false;
      }
    }
    return true;
  }).sort((left, right) => {
    const leftOrder = left.tabIndex > 0 ? left.tabIndex : Number.MAX_SAFE_INTEGER;
    const rightOrder = right.tabIndex > 0 ? right.tabIndex : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function trapPanelTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
  const dialog = event.currentTarget;
  const stops = panelTabStops(dialog);
  const first = stops[0];
  const last = stops.at(-1);
  const active = dialog.ownerDocument.activeElement;
  if (!first || !last) {
    event.preventDefault();
    dialog.focus();
  } else if (event.shiftKey && (active === first || !dialog.contains(active) || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active) || active === dialog)) {
    event.preventDefault();
    first.focus();
  }
}

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
      tabIndex={-1}
      onKeyDown={trapPanelTab}
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
