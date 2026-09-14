"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toPng } from "html-to-image";
import { createClient } from "@/lib/supabase/client";
import { EVENT_TYPE_LABEL, showsLocation } from "@/lib/eventTypes";
import JerseyDisplay from "@/components/JerseyDisplay";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { matchupLabel } from "@/lib/gameResults";
import type { Game, Lineup, LineupUnit, Player, ScheduleEvent } from "@/lib/types";

const COLORS = ["Gris", "Jaune"] as const;

const POSITION_GROUPS: { label: string; unitLabel: string; category: "F" | "D" | "G" }[] = [
  { label: "Attaquants", unitLabel: "Attaquants (effectif)", category: "F" },
  { label: "Défenseurs", unitLabel: "Défenseurs (effectif)", category: "D" },
  { label: "Gardiens", unitLabel: "Gardiens (effectif)", category: "G" },
];

// Même gabarit que le générateur d'alignement : les trios/duos colorés sont
// des lineup_units séparées (unit_label "Trio Gris 1", "Duo Jaune 2", etc.)
// dont on hérite la couleur pour teinter le chandail du joueur sur la TV.
const GROUPING: Record<"F" | "D", { unitType: "forward_line" | "defense_pair"; prefix: string }> = {
  F: { unitType: "forward_line", prefix: "Trio" },
  D: { unitType: "defense_pair", prefix: "Duo" },
};

/**
 * Tableau du jour affiché en grand : horaire, convocations, alignement.
 *
 * Deux usages, un seul rendu — la page interne (avec l'export PNG) et la page
 * de diffusion, ouverte dans un onglet nu pour être castée sur la télé du
 * vestiaire. En mode diffusion, tout est agrandi et rafraîchi tout seul :
 * personne ne va cliquer sur un écran accroché au mur.
 */
export default function TvDayBoard({ date, cast = false }: { date: string; cast?: boolean }) {
  const supabase = createClient();
  const captureRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [units, setUnits] = useState<LineupUnit[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  /** Joueurs signalés « sans contact » ce jour-là : id → mention. */
  const [statusById, setStatusById] = useState<Map<string, string>>(new Map());
  /** Joueurs convoqués en meeting individuel ce jour-là. */
  const [individualMeetings, setIndividualMeetings] = useState<Player[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: pls }, { data: evts }, { data: lineups }, { data: gm }, { data: mts }, { data: abs }] = await Promise.all([
        supabase.from("players").select("*").eq("active", true).order("jersey_number"),
        supabase.from("schedule_events").select("*").eq("event_date", date).order("start_time"),
        supabase.from("lineups").select("*").eq("lineup_date", date).limit(1),
        supabase.from("games").select("*").eq("game_date", date).maybeSingle(),
        supabase
          .from("meetings")
          .select("player_id")
          .eq("meeting_date", date)
          .eq("meeting_type", "individual"),
        supabase.from("absences").select("player_id, reason").eq("absence_date", date),
      ]);
      setPlayers(pls ?? []);
      // Les convocations vivent dans « meetings », pas dans l'horaire : sans ce
      // rapprochement, la TV annonçait l'heure sans dire qui était attendu.
      // Un « sans contact » patine : il garde sa place dans l'alignement, mais
      // les joueurs doivent voir qu'il ne prend pas les contacts.
      setStatusById(
        new Map(
          (abs ?? [])
            .filter((a) => a.reason === "sans_contact")
            .map((a) => [a.player_id, "Sans contact"])
        )
      );
      const convoked = new Set((mts ?? []).map((m) => m.player_id));
      setIndividualMeetings((pls ?? []).filter((p) => convoked.has(p.id)));
      setEvents(evts ?? []);
      setGame(gm ?? null);
      const l: Lineup | undefined = lineups?.[0];
      if (l) {
        const { data: u } = await supabase.from("lineup_units").select("*").eq("lineup_id", l.id).order("unit_order");
        setUnits(u ?? []);
      }
      setLoading(false);
    }
    load();
    if (!cast) return;
    // La télé reste allumée des heures : on relit l'horaire régulièrement pour
    // qu'un changement de dernière minute finisse par s'afficher tout seul.
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [date, cast]);

  async function exportImage() {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(captureRef.current, { pixelRatio: 2, backgroundColor: "#0d0c0c" });
      const link = document.createElement("a");
      link.download = `as-quebec-m17-${date}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p className="text-slate-500 p-8">Chargement...</p>;

  const byColor = (color: string) => units.filter((u) => u.color_group === color);
  const rosterUnit = (label: string) => units.find((u) => u.unit_label === label);
  const hasRoster = POSITION_GROUPS.some((g) => (rosterUnit(g.unitLabel)?.player_ids.length ?? 0) > 0);

  function playerGroupColor(playerId: string, category: "F" | "D" | "G"): "gris" | "jaune" | null {
    if (category === "G") return null;
    const { unitType, prefix } = GROUPING[category];
    const combo = units.find(
      (u) => u.unit_type === unitType && u.unit_label.startsWith(`${prefix} `) && u.player_ids.includes(playerId)
    );
    return (combo?.color_group as "gris" | "jaune" | undefined) ?? null;
  }

  return (
    // Photo d'équipe en fond, pour la diffusion seulement : l'export PNG et la
    // page interne restent sur fond noir, où le texte prime.
    <div
      className="bg-ink-900 min-h-screen bg-cover bg-center bg-no-repeat"
      style={
        cast
          ? {
              // Le voile sombre est peint AVEC la photo plutôt que dans une
              // couche à part : la mise à l'échelle du contenu ne doit pas
              // entraîner le fond avec elle.
              backgroundImage:
                "linear-gradient(rgba(13,12,12,0.88), rgba(13,12,12,0.93)), url(/backgrounds/diffusion.jpg)",
            }
          : undefined
      }
    >
      {!cast && (
        <div className="p-4 print:hidden flex flex-wrap gap-2">
          <button onClick={exportImage} className="btn" disabled={exporting}>
            {exporting ? "Génération..." : "⬇ Exporter l'image du jour"}
          </button>
          <a href={`/diffusion/${date}`} target="_blank" rel="noreferrer" className="btn-secondary">
            📺 Ouvrir la page à diffuser
          </a>
        </div>
      )}

      {/* Sur une télé de 50 pouces, l'écriture se lit à quatre mètres : on
          agrandit tout le tableau d'un coup plutôt que chaque classe une à une. */}
      <div
        ref={captureRef}
        className={
          cast
            ? "text-white px-8 py-6 w-full"
            : "bg-ink-900 text-white p-10 max-w-5xl mx-auto"
        }
        // Le zoom réduit d'autant la largeur utile : à 2,8, un écran 1920 offre
        // ~685 px de mise en page. C'est parfait pour l'horaire seul, mais trop
        // serré dès qu'un alignement s'affiche à côté — on redescend alors à
        // 2,3 pour que les deux moitiés tiennent côte à côte ; les chandails
        // passent alors en version réduite.
        style={cast ? { zoom: hasRoster ? 2.3 : 2.8 } : undefined}
      >
        {/* En diffusion avec alignement, l'écran se coupe en deux DÈS le haut :
            la date ouvre la colonne de gauche, l'alignement démarre à la même
            hauteur à droite plutôt que sous le trait de séparation. */}
        <div className={cast && hasRoster ? "flex items-start gap-6" : ""}>
        <div className={cast && hasRoster ? "w-1/2 min-w-0" : ""}>
        {/* Le nom de l'équipe passe SOUS la date : placé à droite, il sortait du
            cadre de l'image exportée sur les journées au titre long. */}
        <div className="border-b border-gold-500/40 pb-6 mb-6">
          <div className="flex items-baseline gap-4">
            <div className="text-center bg-gold-500 text-ink-900 rounded-lg px-4 py-2 leading-none">
              <div className="text-xs font-bold uppercase">{format(parseISO(date), "MMM", { locale: fr })}</div>
              <div className="text-3xl font-black">{format(parseISO(date), "d")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold capitalize">{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</div>
              {game && (
                <div className="text-gold-400 font-semibold">
                  Match — {matchupLabel(game, findTeamByOpponent(game.opponent)?.name)}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 text-gold-400 font-bold text-lg">As de Québec M17 AAA</div>
        </div>

        {/* Le rappel n'a pas d'heure : il sort de la liste chronologique pour
            son propre bloc, sous l'horaire. */}
        {!game && (events.length > 0 || individualMeetings.length > 0) && (
          <div className="mb-8 space-y-1.5">
            {events.filter((e) => e.event_type !== "reminder").map((e) => (
              <div key={e.id}>
                <div className="flex gap-4 text-lg">
                  <span className="font-mono text-gold-400 w-16">{e.start_time?.slice(0, 5) ?? "--:--"}</span>
                  {/* « Autre » ne dit rien aux joueurs : c'est le détail saisi
                      qui porte l'information. On l'affiche à la place, et on ne
                      retombe sur le libellé générique que s'il est vide. */}
                  <span>
                    {e.event_type === "other" && e.title?.trim()
                      ? e.title.trim()
                      : EVENT_TYPE_LABEL[e.event_type]}
                  </span>
                  {/* Les meetings changent de salle : c'est la seule information
                      de lieu qui apprend quelque chose aux joueurs. */}
                  {e.location && showsLocation(e.event_type) && (
                    <span className="text-slate-400">{e.location}</span>
                  )}
                </div>
                {e.event_type === "individual_meeting" && individualMeetings.length > 0 && (
                  <div className="ml-20 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gold-200/90">
                    {individualMeetings.map((p) => (
                      <span key={p.id}>
                        <span className="font-bold">#{p.jersey_number ?? "–"}</span> {p.full_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Convocations sans ligne d'horaire : elles doivent tout de même
                être annoncées, sinon le joueur ne sait pas qu'il est attendu. */}
            {individualMeetings.length > 0 &&
              !events.some((e) => e.event_type === "individual_meeting") && (
                <div>
                  <div className="flex gap-4 text-lg">
                    <span className="font-mono text-gold-400 w-16">--:--</span>
                    <span>{EVENT_TYPE_LABEL.individual_meeting}</span>
                  </div>
                  <div className="ml-20 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gold-200/90">
                    {individualMeetings.map((p) => (
                      <span key={p.id}>
                        <span className="font-bold">#{p.jersey_number ?? "–"}</span> {p.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Rappels de la journée : texte saisi tel quel, mis en évidence sous
            l'horaire — c'est la place que la télé a en réserve. */}
        {!game && events.some((e) => e.event_type === "reminder") && (
          <div className="mb-8 space-y-2">
            <div className="text-sm font-black uppercase tracking-widest text-red-400">📌 Rappels</div>
            {events
              .filter((e) => e.event_type === "reminder")
              .map((e) => (
                <div key={e.id} className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-lg font-bold text-red-100">
                  {e.title}
                </div>
              ))}
          </div>
        )}

        </div>

        {hasRoster && (
          <div className={cast && hasRoster ? "w-1/2 min-w-0" : "mb-8"}>
            <div className="text-xl font-bold mb-3 text-gold-400">Alignement</div>
            {/* Attaquants à gauche (3 de front, comme à la construction),
                défenseurs et gardiens à droite : sur une télé en paysage, tout
                empiler donnait une colonne haute et étroite qui débordait.
                À l'entraînement, les gardiens sautent : les deux y sont
                toujours, l'information n'apprend rien aux joueurs. */}
            <div className={cast ? "flex items-start gap-4" : "flex flex-wrap gap-8"}>
              {[["F"], cast ? ["D", "G"] : ["D"], cast ? [] : ["G"]].map((categories, columnIndex) => {
                const groups = POSITION_GROUPS.filter(
                  (g) => categories.includes(g.category) && !(cast && !game && g.category === "G")
                );
                if (groups.length === 0) return null;
                return (
                  <div key={columnIndex} className="space-y-3">
                    {groups.map((g) => {
                      const ids = (rosterUnit(g.unitLabel)?.player_ids ?? []).filter(Boolean);
                      if (ids.length === 0) return null;
                      const cols =
                        g.category === "F" ? "grid-cols-3" : g.category === "D" ? "grid-cols-2" : "grid-cols-2";
                      return (
                        <div key={g.label}>
                          <div
                            className={`font-bold uppercase tracking-wide text-slate-300 mb-1.5 ${
                              cast ? "text-[11px]" : "text-sm"
                            }`}
                          >
                            {g.label}
                          </div>
                          <div className={`grid ${cols} ${cast ? "gap-x-1.5 gap-y-2" : "gap-x-3 gap-y-4"} justify-items-center`}>
                            {ids.map((id) => (
                              <JerseyDisplay
                                key={id}
                                player={players.find((pl) => pl.id === id) ?? null}
                                ring={playerGroupColor(id, g.category) ?? undefined}
                                expectedPosition={g.category}
                                size={cast ? "sm" : "normal"}
                                statusLabel={statusById.get(id)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>

        <div className="grid grid-cols-2 gap-8">
          {COLORS.map((color) => {
            const colorUnits = byColor(color);
            if (colorUnits.length === 0) return null;
            return (
              <div key={color}>
                <div
                  className={`text-xl font-bold mb-3 px-3 py-1 rounded inline-block ${
                    color === "Gris" ? "bg-slate-400 text-ink-900" : "bg-gold-500 text-ink-900"
                  }`}
                >
                  {color}
                </div>
                <div className="space-y-3">
                  {colorUnits.map((u) => (
                    <div key={u.id} className="flex flex-wrap gap-2">
                      {u.player_ids.map((id) => {
                        const p = players.find((pl) => pl.id === id);
                        return (
                          <div
                            key={id}
                            className="relative bg-white/10 border border-gold-500/50 rounded-lg px-3 py-2 text-center min-w-[64px]"
                          >
                            {p?.is_call_up && (
                              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-gold-500 text-ink-900 text-[10px] font-bold flex items-center justify-center">
                                R
                              </span>
                            )}
                            <div className="text-2xl font-black">{p?.jersey_number ?? "?"}</div>
                            <div className="text-[10px] uppercase text-slate-300">{p?.full_name.split(" ").pop()}</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sur la télé du vestiaire, annoncer une absence d'alignement n'apprend
            rien aux joueurs — on garde l'écran pour ce qui les concerne. */}
        {!cast && !hasRoster && COLORS.every((c) => byColor(c).length === 0) && (
          <p className="text-slate-400">Aucun alignement pour cette journée.</p>
        )}
      </div>
    </div>
  );
}
