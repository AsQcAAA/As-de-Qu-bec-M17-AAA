"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeRecords } from "@/lib/leagueRecords";
import type { ScoutNote } from "@/lib/types";

interface TeamRecord {
  slug: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  results: ("V" | "D" | "N")[];
}

interface Extracted {
  games: number;
  played: number;
  records: TeamRecord[];
  allGames: { date: string; home: string; away: string; homeScore: number | null; awayScore: number | null }[];
}

/**
 * Mise à jour hebdomadaire des fiches du Pre-Scout : on téléverse le calendrier
 * M17 AAA de la LHEQ (PDF) et les victoires / défaites / 5 derniers matchs de
 * chaque équipe sont recalculés d'après les pointages. Les notes de pre-scout
 * et les défaites en prolongation déjà saisies ne sont jamais touchées (le PDF
 * ne distingue pas une défaite en prolongation d'une défaite en temps régulier).
 */
export default function LeagueScheduleUpdateContent({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const supabase = createClient();
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Extracted | null>(null);
  const [done, setDone] = useState(false);

  async function onFile(file: File) {
    setReading(true);
    setError(null);
    setData(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/league-schedule/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lecture impossible.");
      // Le PDF peut ne couvrir que les derniers jours : on le fusionne avec les matchs déjà
      // enregistrés pour que les fiches (5 derniers) reflètent toute la saison.
      const ex = json as Extracted;
      const { data: stored } = await supabase.from("league_games").select("game_date, home, away, home_score, away_score");
      const merged = new Map<string, Extracted["allGames"][number]>();
      for (const g of stored ?? []) {
        merged.set(`${g.game_date}|${g.home}|${g.away}`, {
          date: g.game_date,
          home: g.home,
          away: g.away,
          homeScore: g.home_score,
          awayScore: g.away_score,
        });
      }
      // Un match du PDF sans pointage ne remplace jamais un résultat déjà enregistré.
      const incoming = ex.allGames.filter((g) => {
        const prev = merged.get(`${g.date}|${g.home}|${g.away}`);
        return !(prev && prev.homeScore != null && g.homeScore == null);
      });
      for (const g of incoming) merged.set(`${g.date}|${g.home}|${g.away}`, g);
      setData({ ...ex, allGames: incoming, records: computeRecords([...merged.values()]) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setReading(false);
    }
  }

  const last5 = (r: TeamRecord) => r.results.slice(-5).join("-");

  async function apply() {
    if (!data) return;
    setApplying(true);
    setError(null);
    const { data: existing } = await supabase.from("scout_notes").select("*");
    const bySlug = new Map((existing as ScoutNote[] | null)?.map((n) => [n.team_slug, n]) ?? []);
    const rows = data.records.map((r) => {
      const prev = bySlug.get(r.slug);
      return {
        team_slug: r.slug,
        // Le classement officiel (captures du lundi) fait foi pour V / D / Déf. prol. :
        // le calendrier ne distingue pas les fusillades. On ne s'en sert que
        // pour une équipe qui n'aurait encore aucune fiche.
        wins: prev?.wins ?? r.wins,
        losses: prev?.losses ?? r.losses,
        otl_losses: prev?.otl_losses ?? null,
        last5: last5(r) || null,
        notes: prev?.notes ?? null,
        updated_at: new Date().toISOString(),
      };
    });
    const { error: err } = await supabase.from("scout_notes").upsert(rows, { onConflict: "team_slug" });
    // Détail match par match (pour « Derniers matchs » dans la fiche d'équipe).
    // Si la table n'existe pas encore (migration 038), on l'indique sans bloquer.
    const { error: gamesErr } = await supabase.from("league_games").upsert(
      data.allGames.map((g) => ({
        game_date: g.date,
        home: g.home,
        away: g.away,
        home_score: g.homeScore,
        away_score: g.awayScore,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "game_date,home,away" }
    );
    setApplying(false);
    if (gamesErr) {
      setError(`Fiches mises à jour, mais le détail des matchs n'a pas été enregistré (migration 038 à exécuter) : ${gamesErr.message}`);
      setDone(true);
      onApplied?.();
      return;
    }
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    onApplied?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Mise à jour hebdomadaire — calendrier de la ligue</h2>
          <p className="text-sm text-slate-400">
            Téléverse le calendrier M17 AAA de la LHEQ (PDF avec les pointages). Les fiches des équipes adverses sont
            recalculées automatiquement.
          </p>
        </div>
        <button className="btn-secondary shrink-0" onClick={onClose}>
          ✕ Fermer
        </button>
      </div>

      <div className="card space-y-3">
        <input
          type="file"
          accept="application/pdf"
          className="block text-sm"
          disabled={reading || applying}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {reading && <p className="text-sm text-slate-500">Lecture du calendrier…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {data && !done && (
        <div className="card space-y-3">
          <p className="text-sm text-slate-600">
            {data.games} matchs lus, dont <strong>{data.played}</strong> déjà joués. Aperçu des fiches calculées :
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1.5 pr-3">Équipe</th>
                  <th className="py-1.5 pr-3 w-10">V</th>
                  <th className="py-1.5 pr-3 w-10">D</th>
                  <th className="py-1.5 pr-3 w-10">N</th>
                  <th className="py-1.5">5 derniers</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.slug} className="border-b last:border-0">
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="py-1.5 pr-3">{r.wins}</td>
                    <td className="py-1.5 pr-3">{r.losses}</td>
                    <td className="py-1.5 pr-3">{r.ties}</td>
                    <td className="py-1.5 font-mono">{last5(r).split("-").reverse().join("-") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Seuls les « 5 derniers matchs » et le détail des matchs sont mis à jour. Les victoires, défaites et défaites
            en prolongation viennent du classement officiel (captures du lundi) et ne sont pas écrasées. Un « N » est un
            match décidé en fusillade.
          </p>
          <button className="btn" onClick={apply} disabled={applying}>
            {applying ? "Enregistrement…" : "Mettre à jour les derniers matchs"}
          </button>
        </div>
      )}

      {done && (
        <div className="card space-y-2">
          <p className="text-green-700 font-semibold">✓ Fiches mises à jour pour {data?.records.length} équipes.</p>
          <button className="btn-dark" onClick={onClose}>
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
