"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Types de champs où l'on « écrit » vraiment (pas les dates, cases à cocher, mots de passe…).
const TEXT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "number"]);

function textLength(el: Element): number | null {
  if (el instanceof HTMLTextAreaElement) return el.value.length;
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) ? el.value.length : null;
  if (el instanceof HTMLElement && el.isContentEditable) return (el.textContent ?? "").length;
  return null;
}

/**
 * Compte les clics et les caractères ajoutés par la personne connectée, et envoie les
 * totaux à la base (fonction bump_activity) toutes les 20 s et à la fermeture de la page.
 * Seuls des nombres partent : rien de ce qui est écrit n'est lu ni conservé.
 */
export default function ActivityTracker() {
  useEffect(() => {
    const supabase = createClient();
    let clicks = 0;
    let chars = 0;
    let token: string | null = null;
    const lens = new WeakMap<Element, number>();

    supabase.auth.getSession().then(({ data }) => (token = data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => (token = session?.access_token ?? null));

    const onClick = (e: MouseEvent) => {
      if (e.isTrusted && token) clicks += 1;
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null;
      const n = t ? textLength(t) : null;
      if (t && n !== null) lens.set(t, n);
    };
    const onInput = (e: Event) => {
      const t = e.target as Element | null;
      if (!e.isTrusted || !token || !t) return;
      const now = textLength(t);
      if (now === null) return;
      const prev = lens.get(t) ?? 0;
      if (now > prev) chars += now - prev; // seulement ce qui est ajouté
      lens.set(t, now);
    };

    /** Envoie les compteurs ; à la fermeture, un fetch « keepalive » survit au changement de page. */
    function flush(closing: boolean) {
      if (!token || (clicks === 0 && chars === 0)) return;
      const c = clicks;
      const h = chars;
      clicks = 0;
      chars = 0;
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/bump_activity`;
      fetch(url, {
        method: "POST",
        keepalive: closing,
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ p_clicks: c, p_chars: h }),
      })
        .then((r) => {
          if (!r.ok) {
            clicks += c;
            chars += h;
          }
        })
        .catch(() => {
          clicks += c;
          chars += h;
        });
    }

    const timer = setInterval(() => flush(false), 20000);
    const onHide = () => flush(true);
    const onVisibility = () => document.visibilityState === "hidden" && flush(true);

    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("input", onInput, true);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      flush(true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("input", onInput, true);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
