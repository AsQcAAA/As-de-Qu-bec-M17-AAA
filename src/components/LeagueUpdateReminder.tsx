"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import LeagueScheduleUpdateContent from "@/components/LeagueScheduleUpdateContent";

/**
 * Pense-bête du lundi : téléverser le calendrier de la ligue (PDF) pour mettre
 * à jour les fiches du Pre-Scout. Même forme que le pense-bête des feuilles de
 * match manquantes — posé à droite de l'accueil, repliable, jamais bloquant.
 * Il disparaît dès que l'import du jour est fait, ou si on le met de côté.
 */
export default function LeagueUpdateReminder() {
  const supabase = createClient();
  const [show, setShow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const now = new Date();
    if (now.getDay() !== 1) return;
    const today = format(now, "yyyy-MM-dd");
    try {
      if (localStorage.getItem(`league-update-dismissed-${today}`) === "1") return;
    } catch {}
    // Déjà importé aujourd'hui ? Alors rien à rappeler.
    supabase
      .from("league_games")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const last = data?.[0]?.updated_at?.slice(0, 10);
        if (last !== today) setShow(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(`league-update-dismissed-${format(new Date(), "yyyy-MM-dd")}`, "1");
    } catch {}
    setShow(false);
  }

  if (!show && !open) return null;

  return (
    <>
      {show &&
        (collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="fixed right-4 top-24 z-40 rounded-full border border-gold-400/50 bg-ink-900/95 px-4 py-2 text-sm font-black text-gold-300 shadow-lg backdrop-blur hover:border-gold-400"
          >
            📅 Mise à jour de la ligue
          </button>
        ) : (
          <aside className="fixed right-4 top-24 z-40 w-72 rounded-2xl border border-gold-400/40 bg-ink-900/95 shadow-2xl backdrop-blur">
            <header className="flex items-center justify-between gap-2 border-b border-gold-400/25 bg-gold-500/10 px-3 py-2">
              <span className="text-xs font-black uppercase tracking-widest text-gold-400">📅 Lundi — ligue</span>
              <button
                onClick={() => setCollapsed(true)}
                title="Réduire"
                className="text-slate-400 hover:text-white text-sm leading-none px-1"
              >
                ▾
              </button>
            </header>
            <div className="p-3 space-y-2">
              <p className="text-xs text-slate-300">
                Téléverse le calendrier de la ligue (PDF) pour mettre à jour les fiches des équipes adverses.
              </p>
              <button className="btn w-full text-sm" onClick={() => setOpen(true)}>
                Téléverser le calendrier
              </button>
              <button onClick={dismiss} className="text-[10px] text-slate-500 hover:text-slate-300">
                Mettre de côté aujourd&apos;hui
              </button>
            </div>
          </aside>
        ))}
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <LeagueScheduleUpdateContent
            onClose={() => setOpen(false)}
            onApplied={() => {
              setShow(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
