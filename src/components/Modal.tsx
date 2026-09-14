"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex min-h-full items-start justify-center p-2 sm:p-6">
        <div className="relative bg-ink-800 rounded-2xl w-full max-w-4xl my-4 sm:my-8 p-4 sm:p-6 shadow-2xl">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
