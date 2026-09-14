"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import type { Game, GameDocument, GameDocumentType } from "@/lib/types";

const REQUIRED: { type: GameDocumentType; short: string; label: string }[] = [
  { type: "feuille_match", short: "FM", label: "Feuille de match" },
  { type: "stats_avancees", short: "SA", label: "Statistiques avancées (TPE)" },
];

// Ce qui est mis de côté est propre à ce navigateur : c'est un pense-bête, pas
// une donnée d'équipe. Rien ne part en base pour ça. Deux formes de clés :
// « <gameId> » pour un match entier, « <gameId>:<docType> » pour une seule
// pièce — certains matchs n'auront jamais leur feuille de plus/moins.
const DISMISSED_KEY = "post-game-uploads-dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Pense-bête des téléversements d'après-match.
 *
 * Reste posé à droite de l'accueil tant que les deux documents d'un match
 * joué ne sont pas rentrés. Il ne bloque rien : il se replie en une pastille,
 * et un match qui n'aura jamais ses deux pièces peut être mis de côté.
 */
export default function PostGameUploadsReminder({ today }: { today: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<{ game: Game; missing: GameDocumentType[] }[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  // Lu à l'initialisation plutôt que dans un effet : la liste ne change qu'à
  // la demande, et la lire dans un effet déclenchait un rendu en cascade.
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readDismissed()
  );

  useEffect(() => {
    async function load() {
      const [{ data: games }, { data: docs }] = await Promise.all([
        supabase.from("games").select("*").lte("game_date", today).order("game_date", { ascending: false }),
        supabase.from("game_documents").select("*"),
      ]);
      const byGame = new Map<string, Set<string>>();
      for (const d of (docs ?? []) as GameDocument[]) {
        byGame.set(d.game_id, (byGame.get(d.game_id) ?? new Set()).add(d.doc_type));
      }
      setRows(
        (games ?? [])
          .map((g) => ({
            game: g,
            missing: REQUIRED.filter((r) => !byGame.get(g.id)?.has(r.type)).map((r) => r.type),
          }))
          .filter((r) => r.missing.length > 0)
      );
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  function dismiss(key: string) {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // navigation privée : le pense-bête réapparaîtra, sans plus de dommage
    }
  }

  const visible = rows
    .map((r) => ({
      ...r,
      missing: r.missing.filter((t) => !dismissed.includes(`${r.game.id}:${t}`)),
    }))
    .filter((r) => r.missing.length > 0 && !dismissed.includes(r.game.id));
  if (visible.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed right-4 bottom-4 z-40 rounded-full border border-gold-400/50 bg-ink-900/95 px-4 py-2 text-sm font-black text-gold-300 shadow-lg backdrop-blur hover:border-gold-400"
      >
        📤 {visible.length} match{visible.length > 1 ? "s" : ""} à compléter
      </button>
    );
  }

  return (
    <aside className="fixed right-4 bottom-4 z-40 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border border-gold-400/40 bg-ink-900/95 shadow-2xl backdrop-blur">
      <header className="flex items-center justify-between gap-2 border-b border-gold-400/25 bg-gold-500/10 px-3 py-2">
        <span className="text-xs font-black uppercase tracking-widest text-gold-400">📤 Après-match</span>
        <button
          onClick={() => setCollapsed(true)}
          title="Réduire"
          className="text-slate-400 hover:text-white text-sm leading-none px-1"
        >
          ▾
        </button>
      </header>

      <ul className="p-2 space-y-2">
        {visible.map(({ game, missing }) => {
          const team = findTeamByOpponent(game.opponent);
          return (
            <li key={game.id} className="rounded-lg bg-white/[0.06] p-2 space-y-1.5">
              <Link href={`/resultats/${game.id}`} className="flex items-center gap-2 hover:underline">
                {team?.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logo} alt={team.name} className="h-5 w-5 shrink-0 object-contain" />
                )}
                <span className="text-xs font-bold text-white tabular-nums">{game.game_date}</span>
                <span className="text-xs text-slate-400 truncate">{team?.name ?? game.opponent}</span>
              </Link>
              <div className="flex flex-wrap gap-1">
                {REQUIRED.map((r) => {
                  const skipped = dismissed.includes(`${game.id}:${r.type}`);
                  const done = !missing.includes(r.type) && !skipped;
                  // La pastille mène droit au téléversement de CETTE pièce ;
                  // le ✕ sert à déclarer qu'elle n'existe pas pour ce match.
                  return (
                    <span
                      key={r.type}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black ${
                        skipped
                          ? "bg-white/5 text-slate-500 line-through"
                          : done
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      <Link
                        href={`/resultats/${game.id}#upload-${r.type}`}
                        title={`${r.label} — ouvrir le téléversement`}
                        className="hover:underline"
                      >
                        {skipped ? "—" : done ? "✓" : "○"} {r.short}
                      </Link>
                      {!done && !skipped && (
                        <button
                          type="button"
                          onClick={() => dismiss(`${game.id}:${r.type}`)}
                          title="Cette pièce n'existe pas pour ce match"
                          className="text-red-300/60 hover:text-red-200 leading-none"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              <button onClick={() => dismiss(game.id)} className="text-[10px] text-slate-500 hover:text-slate-300">
                Mettre tout le match de côté
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
