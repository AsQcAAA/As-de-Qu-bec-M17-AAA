"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { lastName } from "@/lib/players";
import type { Player, TeamBuildingTeam } from "@/lib/types";

const ACCENTS = [
  { ring: "ring-amber-400", bar: "bg-amber-400", text: "text-amber-700", chip: "bg-amber-100 text-amber-900", name: "Équipe 1" },
  { ring: "ring-sky-400", bar: "bg-sky-400", text: "text-sky-700", chip: "bg-sky-100 text-sky-900", name: "Équipe 2" },
  { ring: "ring-rose-400", bar: "bg-rose-400", text: "text-rose-700", chip: "bg-rose-100 text-rose-900", name: "Équipe 3" },
];

export const emptyTeams = (): TeamBuildingTeam[] => [0, 1, 2].map(() => ({ captain_id: null, member_ids: [], score: 0 }));

/**
 * Trois équipes de Team Building : un capitaine (visage en grand), les joueurs
 * glissés vers leur capitaine, et le pointage de chaque équipe en bas, ajustable
 * en direct. Tout s'enregistre à chaque geste.
 *
 * Glisser-déposer à la souris ; sur tablette ou téléphone, toucher un numéro
 * puis toucher l'équipe où le poser.
 */
export default function TeamBuildingTeams({
  players,
  teams,
  onChange,
  title,
  subtitle,
  fileKey,
}: {
  players: Player[];
  teams: TeamBuildingTeam[];
  onChange: (next: TeamBuildingTeam[]) => void;
  /** Titre de l'image exportée (ex. « Team Building — mercredi 14 octobre »). */
  title: string;
  subtitle?: string;
  /** Sert au nom du fichier exporté (la date de la séance). */
  fileKey: string;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function exportImage() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 2, backgroundColor: "#0d0c0c" });
      const link = document.createElement("a");
      link.download = `team-building-${fileKey}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }

  const byId = new Map(players.map((p) => [p.id, p]));
  const placed = new Set(teams.flatMap((t) => [t.captain_id, ...t.member_ids].filter(Boolean) as string[]));
  const pool = players.filter((p) => !placed.has(p.id));
  const [picked, setPicked] = useState<string | null>(null);
  const [overTeam, setOverTeam] = useState<number | "pool" | null>(null);
  const topScore = Math.max(...teams.map((t) => t.score));

  const strip = (list: TeamBuildingTeam[], id: string) =>
    list.map((t) => ({ ...t, captain_id: t.captain_id === id ? null : t.captain_id, member_ids: t.member_ids.filter((m) => m !== id) }));

  function assign(playerId: string, teamIndex: number | "pool") {
    let next = strip(teams, playerId);
    if (teamIndex !== "pool") {
      next = next.map((t, i) => (i === teamIndex ? { ...t, member_ids: [...t.member_ids, playerId] } : t));
    }
    onChange(next);
    setPicked(null);
    setOverTeam(null);
  }

  function setCaptain(teamIndex: number, playerId: string) {
    let next = strip(teams, playerId);
    next = next.map((t, i) => (i === teamIndex ? { ...t, captain_id: playerId || null } : t));
    onChange(next);
  }

  function adjustScore(teamIndex: number, delta: number) {
    onChange(teams.map((t, i) => (i === teamIndex ? { ...t, score: Math.max(0, t.score + delta) } : t)));
  }

  function chip(p: Player, extra = "") {
    return (
      <button
        key={p.id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", p.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => setPicked((cur) => (cur === p.id ? null : p.id))}
        title={p.full_name}
        className={`h-10 min-w-[2.5rem] px-2 rounded-full font-bold text-sm border-2 transition-colors cursor-grab active:cursor-grabbing ${
          picked === p.id ? "border-gold-500 bg-gold-500 text-ink-900" : "border-slate-300 bg-white text-ink-800 hover:border-gold-400"
        } ${extra}`}
      >
        {p.jersey_number ?? "?"}
      </button>
    );
  }

  const dropProps = (target: number | "pool") => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverTeam(target);
    },
    onDragLeave: () => setOverTeam((cur) => (cur === target ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) assign(id, target);
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        {teams.map((team, i) => {
          const accent = ACCENTS[i];
          const captain = team.captain_id ? byId.get(team.captain_id) : undefined;
          return (
            <div
              key={i}
              {...dropProps(i)}
              onClick={() => picked && assign(picked, i)}
              className={`rounded-2xl border-2 p-3 space-y-3 transition-colors ${
                overTeam === i ? "border-gold-500 bg-gold-50" : picked ? "border-dashed border-gold-400 cursor-pointer" : "border-slate-200"
              }`}
            >
              {/* Visage du capitaine, en grand. */}
              <div className="flex flex-col items-center gap-2">
                <div className={`relative h-36 w-36 rounded-full overflow-hidden ring-4 ${accent.ring} bg-ink-900 flex items-center justify-center`}>
                  {captain?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={captain.photo_url} alt={captain.full_name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-5xl font-black text-gold-400">{captain?.jersey_number ?? "?"}</span>
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-xs font-black uppercase tracking-widest ${accent.text}`}>{accent.name}</div>
                  {captain ? (
                    <div className="font-black text-lg leading-tight">
                      {captain.jersey_number != null && <span className="text-slate-400">#{captain.jersey_number} </span>}
                      {captain.full_name}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">Capitaine à choisir</div>
                  )}
                </div>
                <select
                  className="input text-xs w-full"
                  value={team.captain_id ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCaptain(i, e.target.value)}
                >
                  <option value="">— Capitaine —</option>
                  {players
                    .slice()
                    .sort((a, b) => lastName(a.full_name).localeCompare(lastName(b.full_name)))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {lastName(p.full_name)}
                        {p.jersey_number != null ? ` #${p.jersey_number}` : ""}
                      </option>
                    ))}
                </select>
              </div>

              {/* Joueurs de l'équipe. */}
              <div className="flex flex-wrap gap-1.5 min-h-[2.75rem] justify-center">
                {team.member_ids.length === 0 ? (
                  <span className="text-xs text-slate-400 self-center">Glisse des numéros ici</span>
                ) : (
                  team.member_ids.map((id) => byId.get(id)).filter((p): p is Player => !!p).map((p) => chip(p))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pointage : en bas des trois équipes, ajustable en direct. */}
      <div className="grid md:grid-cols-3 gap-3">
        {teams.map((team, i) => {
          const accent = ACCENTS[i];
          const leader = team.score > 0 && team.score === topScore;
          return (
            <div key={i} className={`rounded-2xl border-2 p-3 text-center ${leader ? "border-gold-500 bg-gold-50" : "border-slate-200"}`}>
              <div className={`text-xs font-black uppercase tracking-widest ${accent.text}`}>
                {accent.name} {leader && "👑"}
              </div>
              <div className="text-6xl font-black tabular-nums leading-none my-2">{team.score}</div>
              <div className="flex items-center justify-center gap-2">
                <button type="button" className="h-12 w-12 rounded-xl bg-slate-100 text-2xl font-black hover:bg-slate-200" onClick={() => adjustScore(i, -1)}>
                  −
                </button>
                <button type="button" className="h-12 w-16 rounded-xl bg-gold-500 text-2xl font-black text-ink-900 hover:bg-gold-400" onClick={() => adjustScore(i, 1)}>
                  +1
                </button>
                <button type="button" className="h-12 w-14 rounded-xl bg-gold-100 text-lg font-black text-ink-900 hover:bg-gold-200" onClick={() => adjustScore(i, 5)}>
                  +5
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Joueurs pas encore placés. */}
      <div
        {...dropProps("pool")}
        onClick={() => picked && placed.has(picked) && assign(picked, "pool")}
        className={`rounded-2xl border-2 border-dashed p-3 ${overTeam === "pool" ? "border-gold-500 bg-gold-50" : "border-slate-300"}`}
      >
        <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
          Pas encore dans une équipe ({pool.length}) — glisse un numéro vers un capitaine, ou touche un numéro puis l&apos;équipe
        </div>
        <div className="flex flex-wrap gap-1.5">{pool.length === 0 ? <span className="text-sm text-slate-400">Tout le monde est placé.</span> : pool.map((p) => chip(p))}</div>
      </div>

      <div className="flex gap-3 text-xs items-center flex-wrap">
        <button type="button" className="btn-secondary text-sm" disabled={exporting} onClick={exportImage}>
          {exporting ? "Génération…" : "⬇ Exporter en image (PNG)"}
        </button>
        <button
          type="button"
          className="text-slate-500 hover:underline"
          onClick={() => {
            if (window.confirm("Remettre les pointages à zéro ?")) onChange(teams.map((t) => ({ ...t, score: 0 })));
          }}
        >
          Pointages à zéro
        </button>
        <button
          type="button"
          className="text-red-600 hover:underline"
          onClick={() => {
            if (window.confirm("Défaire les trois équipes (capitaines, joueurs et pointages) ?")) onChange(emptyTeams());
          }}
        >
          Défaire les équipes
        </button>
      </div>

      {/* Panneau d'export, rendu hors écran : une image propre à envoyer aux joueurs
          (visages des capitaines, équipes et pointage), sans les boutons. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <div ref={exportRef} className="w-[1080px] bg-ink-900 p-10 space-y-8">
          <div className="text-center space-y-1">
            <div className="text-sm font-black uppercase tracking-[0.3em] text-gold-400">As de Québec M17 AAA — Team Building</div>
            <h2 className="text-4xl font-black text-white capitalize">{title}</h2>
            {subtitle && <div className="text-xl font-semibold text-slate-300">{subtitle}</div>}
          </div>
          <div className="grid grid-cols-3 gap-6">
            {teams.map((team, i) => {
              const accent = ACCENTS[i];
              const captain = team.captain_id ? byId.get(team.captain_id) : undefined;
              const members = team.member_ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
              const leader = team.score > 0 && team.score === topScore;
              return (
                <div
                  key={i}
                  className={`rounded-3xl p-6 flex flex-col items-center gap-4 border-4 ${
                    leader ? "border-gold-400 bg-gold-500/10" : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className={`h-52 w-52 rounded-full overflow-hidden ring-8 ${accent.ring} bg-ink-800 flex items-center justify-center`}>
                    {captain?.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={captain.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-7xl font-black text-gold-400">{captain?.jersey_number ?? "?"}</span>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black uppercase tracking-widest text-gold-400">
                      {accent.name} {leader && "👑"}
                    </div>
                    <div className="text-2xl font-black text-white leading-tight">{captain ? captain.full_name : "—"}</div>
                  </div>
                  <div className="text-center text-sm font-semibold text-slate-300 min-h-[3.5rem]">
                    {members.map((p) => `#${p.jersey_number ?? "?"} ${lastName(p.full_name)}`).join("  ·  ")}
                  </div>
                  <div className="text-8xl font-black text-white tabular-nums leading-none">{team.score}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
