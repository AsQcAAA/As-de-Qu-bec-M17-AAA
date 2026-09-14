"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { PHASE_LABEL, PHASE_STYLE, buildInjuryEpisodes, type InjuryEpisode } from "@/lib/injuries";
import PhysioConsultations from "@/components/PhysioConsultations";
import type { Absence, Injury, InjurySeverity, Player } from "@/lib/types";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const SEVERITY_LABEL: Record<InjurySeverity, string> = {
  legere: "Légère",
  moderee: "Modérée",
  grave: "Grave",
};

const SEVERITY_COLOR: Record<InjurySeverity, string> = {
  legere: "bg-amber-100 text-amber-800",
  moderee: "bg-orange-100 text-orange-800",
  grave: "bg-red-100 text-red-800",
};

/** Ce que le coach saisit lui-même sur un bandeau de blessure. */
export interface InjuryNote {
  /** Nature et endroit : « entorse cheville droite ». */
  injury_type: string;
  /** Date de retour au jeu prévue, tant que le joueur est absent. */
  expected_return: string;
}

const EMPTY_NOTE: InjuryNote = { injury_type: "", expected_return: "" };

const emptyForm = {
  player_id: "",
  injury_date: todayStr(),
  description: "",
  severity: "legere" as InjurySeverity,
  notes: "",
};

/** Durée réelle de l'absence, en jours pleins entre la blessure et le retour. */
function absenceDays(startDate: string, healedDate: string) {
  const ms = new Date(`${healedDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** « 24 jours (3 semaines) » — les semaines n'apparaissent qu'à partir de 14 jours. */
function durationLabel(days: number) {
  if (days < 14) return `${days} jour${days > 1 ? "s" : ""}`;
  const weeks = Math.round(days / 7);
  return `${days} jours (${weeks} semaines)`;
}

/** Une ligne de blessure : le bandeau change de couleur selon la phase. */
function EpisodeRow({
  episode,
  note,
  onNote,
}: {
  episode: InjuryEpisode & { player: Player };
  note: InjuryNote;
  onNote: (patch: Partial<InjuryNote>) => void;
}) {
  const e = episode;
  return (
    <div className={`rounded-lg border-2 px-4 py-2.5 flex items-center gap-3 flex-wrap ${PHASE_STYLE[e.phase]}`}>
      <span className="font-black text-sm">
        #{e.player.jersey_number ?? "–"} {e.player.full_name}
      </span>
      <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide">
        {PHASE_LABEL[e.phase]}
      </span>
      <span className="text-sm">
        Depuis le {e.startDate}
        {e.healedDate ? ` · retour au jeu le ${e.healedDate}` : ""}
      </span>

      {/* Nature et endroit de la blessure : seule information non déductible. */}
      <input
        defaultValue={note.injury_type}
        onBlur={(ev) => ev.target.value !== note.injury_type && onNote({ injury_type: ev.target.value })}
        placeholder="Blessure et endroit…"
        className="flex-1 min-w-[11rem] rounded-md border border-black/20 bg-white/70 px-2 py-1 text-sm placeholder:text-ink-900/40 focus:outline-none focus:ring-2 focus:ring-ink-900/30"
      />

      {/* Tant que le joueur est absent : la date de retour prévue, à saisir.
          Une fois revenu, la prévision n'a plus d'intérêt — on affiche la
          durée réelle de l'absence, qui elle se calcule toute seule. */}
      {e.healedDate ? (
        <span className="shrink-0 rounded-md bg-black/10 px-2 py-1 text-sm font-bold">
          Absence de {durationLabel(absenceDays(e.startDate, e.healedDate))}
        </span>
      ) : (
        <label className="shrink-0 flex items-center gap-1.5 text-sm font-bold">
          Retour prévu
          <input
            type="date"
            defaultValue={note.expected_return}
            onBlur={(ev) => ev.target.value !== note.expected_return && onNote({ expected_return: ev.target.value })}
            className="rounded-md border border-black/20 bg-white/70 px-2 py-1 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ink-900/30"
          />
        </label>
      )}

      <span className="text-sm font-bold shrink-0">
        {e.missedDates.length} activité{e.missedDates.length > 1 ? "s" : ""} ratée
        {e.missedDates.length > 1 ? "s" : ""}
        {e.noContactDates.length > 0 && (
          <span className="ml-2 rounded-full bg-black/15 px-2 py-0.5 text-xs">
            🚫 {e.noContactDates.length} sans contact
          </span>
        )}
      </span>
    </div>
  );
}

export default function MedicalPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  // Sources de la chronologie automatique des blessures.
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [lineupDatesByPlayer, setLineupDatesByPlayer] = useState<Map<string, string[]>>(new Map());
  const [practiceDates, setPracticeDates] = useState<string[]>([]);
  /** « playerId|startDate » → notes saisies à la main sur le bandeau. */
  const [notesByEpisode, setNotesByEpisode] = useState<Map<string, InjuryNote>>(new Map());
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: pls }, { data: inj }, { data: abs }, { data: lus }, { data: units }, { data: evts }, { data: notes }] =
      await Promise.all([
        supabase.from("players").select("*").eq("is_call_up", false).order("jersey_number"),
        supabase.from("injuries").select("*").order("injury_date", { ascending: false }),
        supabase.from("absences").select("*").order("absence_date"),
        supabase.from("lineups").select("id, lineup_date"),
        supabase.from("lineup_units").select("lineup_id, unit_label, player_ids"),
        supabase.from("schedule_events").select("event_date").eq("event_type", "practice"),
        supabase.from("injury_notes").select("*"),
      ]);
    setPlayers(pls ?? []);
    setInjuries(inj ?? []);
    setAbsences(abs ?? []);

    const dateOf = new Map((lus ?? []).map((l) => [l.id, l.lineup_date]));
    const byPlayer = new Map<string, string[]>();
    for (const u of units ?? []) {
      if (!u.unit_label.endsWith("(effectif)")) continue;
      const d = dateOf.get(u.lineup_id);
      if (!d) continue;
      for (const id of u.player_ids) {
        if (!id) continue;
        byPlayer.set(id, [...(byPlayer.get(id) ?? []), d]);
      }
    }
    setLineupDatesByPlayer(byPlayer);
    setPracticeDates([...new Set((evts ?? []).map((e) => e.event_date))].sort());
    setNotesByEpisode(
      new Map(
        (notes ?? []).map((n) => [
          `${n.player_id}|${n.start_date}`,
          { injury_type: n.injury_type ?? "", expected_return: n.expected_return ?? "" },
        ])
      )
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * Chronologie des blessures, tous joueurs confondus, de la plus récente à la
   * plus ancienne. Chaque épisode est déduit — rien à saisir.
   */
  const episodes = useMemo(() => {
    const nameOf = new Map(players.map((p) => [p.id, p]));
    const byPlayer = new Map<string, { injury: string[]; absent: string[]; noContact: string[] }>();
    for (const a of absences) {
      const cur = byPlayer.get(a.player_id) ?? { injury: [], absent: [], noContact: [] };
      // Le sans-contact n'est pas une absence : le joueur était sur la glace.
      if (a.reason === "sans_contact") cur.noContact.push(a.absence_date);
      else cur.absent.push(a.absence_date);
      if (a.reason === "blesse") cur.injury.push(a.absence_date);
      byPlayer.set(a.player_id, cur);
    }

    const all: (InjuryEpisode & { player: Player })[] = [];
    for (const [playerId, d] of byPlayer) {
      const player = nameOf.get(playerId);
      if (!player) continue;
      const eps = buildInjuryEpisodes(playerId, {
        injuryDates: d.injury,
        lineupDates: lineupDatesByPlayer.get(playerId) ?? [],
        practiceDates,
        absentDates: d.absent,
        noContactDates: d.noContact,
        today: format(new Date(), "yyyy-MM-dd"),
      });
      for (const e of eps) all.push({ ...e, player });
    }
    return all.sort((a, b) => (b.startDate > a.startDate ? 1 : b.startDate < a.startDate ? -1 : 0));
  }, [absences, players, lineupDatesByPlayer, practiceDates]);

  // « Actives » regroupe les blessures en cours ET les retours progressifs :
  // un joueur en réhabilitation n'est pas encore disponible.
  const activeEpisodes = useMemo(() => episodes.filter((e) => e.phase !== "guerie"), [episodes]);
  // L'historique ne garde que les blessures terminées : celles en cours sont
  // déjà en tête de page, les répéter ici brouillerait la lecture.
  const healedEpisodes = useMemo(() => episodes.filter((e) => e.phase === "guerie"), [episodes]);

  /**
   * Nature de la blessure et retour prévu : les deux seules informations qui ne
   * peuvent pas être déduites des absences et des alignements.
   */
  async function saveNote(playerId: string, startDate: string, patch: Partial<InjuryNote>) {
    const key = `${playerId}|${startDate}`;
    const next = { ...(notesByEpisode.get(key) ?? EMPTY_NOTE), ...patch };
    setNotesByEpisode((prev) => new Map(prev).set(key, next));
    await supabase.from("injury_notes").upsert(
      {
        player_id: playerId,
        start_date: startDate,
        injury_type: next.injury_type || null,
        expected_return: next.expected_return || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,start_date" }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.player_id || !form.description.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("injuries")
      .insert({
        player_id: form.player_id,
        injury_date: form.injury_date,
        description: form.description.trim(),
        severity: form.severity,
        notes: form.notes || null,
      })
      .select()
      .single();

    if (data) {
      fetch("/api/injury-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ injuryId: data.id }),
      }).catch(() => {});
    }

    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function resolve(id: string) {
    await supabase.from("injuries").update({ status: "resolue", resolved_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function reactivate(id: string) {
    await supabase.from("injuries").update({ status: "active", resolved_at: null }).eq("id", id);
    load();
  }

  const nameById = new Map(players.map((p) => [p.id, p]));
  const active = injuries.filter((i) => i.status === "active");
  const resolved = injuries.filter((i) => i.status === "resolue");

  function InjuryRow({ injury }: { injury: Injury }) {
    const player = injury.player_id ? nameById.get(injury.player_id) : null;
    return (
      <div className="card flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">
              {player ? `${player.full_name}${player.jersey_number ? ` (#${player.jersey_number})` : ""}` : "Joueur inconnu"}
            </span>
            {injury.severity && (
              <span className={`badge ${SEVERITY_COLOR[injury.severity]}`}>{SEVERITY_LABEL[injury.severity]}</span>
            )}
          </div>
          <p className="text-sm text-slate-700">{injury.description}</p>
          {injury.notes && <p className="text-sm text-slate-500 mt-1">{injury.notes}</p>}
          <p className="text-xs text-slate-400 mt-1">
            {injury.injury_date}
            {injury.status === "resolue" && injury.resolved_at ? ` · Résolue le ${injury.resolved_at.slice(0, 10)}` : ""}
          </p>
        </div>
        {injury.status === "active" ? (
          <button onClick={() => resolve(injury.id)} className="btn-secondary shrink-0">
            Marquer résolue
          </button>
        ) : (
          <button onClick={() => reactivate(injury.id)} className="text-xs text-ink-800 hover:text-gold-700 shrink-0">
            Réactiver
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Médical</h1>
          <p className="text-slate-500 text-sm">
            Suivi des blessures. Ajouter une blessure envoie une alerte dans l'app et par courriel.
          </p>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "+ Ajouter une blessure"}
        </button>
      </div>

      {/* Blessures en cours — d'abord, c'est ce qu'on vient consulter.
          Compilé depuis les absences pour blessure et les alignements. */}
      <section className="space-y-2">
        <h2 className="font-semibold text-white drop-shadow">
          Blessures actives ({activeEpisodes.length})
        </h2>
        {activeEpisodes.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun joueur blessé actuellement.</p>
        ) : (
          <div className="space-y-2">
            {activeEpisodes.map((e) => (
              <EpisodeRow
                key={`${e.playerId}-${e.startDate}`}
                episode={e}
                note={notesByEpisode.get(`${e.playerId}|${e.startDate}`) ?? EMPTY_NOTE}
                onNote={(patch) => saveNote(e.playerId, e.startDate, patch)}
              />
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <form onSubmit={handleSubmit} className="card grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Joueur</label>
            <select
              required
              className="input"
              value={form.player_id}
              onChange={(e) => setForm({ ...form, player_id: e.target.value })}
            >
              <option value="">— Choisir —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.jersey_number ? `#${p.jersey_number} ` : ""}
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              required
              className="input"
              value={form.injury_date}
              onChange={(e) => setForm({ ...form, injury_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Gravité</label>
            <select
              className="input"
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value as InjurySeverity })}
            >
              {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <input
              required
              className="input"
              placeholder="Ex: Entorse à la cheville droite"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer la blessure"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : (
        <>
          <div>
            {/* Fiches saisies à la main : elles portent le diagnostic et la
                gravité, et déclenchent l'alerte courriel. Distinctes de la
                chronologie, qui est déduite des absences. */}
            <h2 className="font-semibold mb-3">Fiches médicales ouvertes ({active.length})</h2>
            {active.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune fiche ouverte.</p>
            ) : (
              <div className="space-y-3">
                {active.map((i) => (
                  <InjuryRow key={i.id} injury={i} />
                ))}
              </div>
            )}
          </div>

          {resolved.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">Historique résolu ({resolved.length})</h2>
              <div className="space-y-3">
                {resolved.map((i) => (
                  <InjuryRow key={i.id} injury={i} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Consultations de la clinique — informatif, hors chronologie. */}
      <section className="space-y-2">
        <h2 className="font-semibold text-white drop-shadow">🩺 Consultations en physiothérapie</h2>
        <div className="card">
          <PhysioConsultations />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-white drop-shadow">Historique de blessures</h2>
        {healedEpisodes.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune blessure guérie à ce jour.</p>
        ) : (
          <div className="space-y-2">
            {healedEpisodes.map((e) => (
              <EpisodeRow
                key={`${e.playerId}-${e.startDate}`}
                episode={e}
                note={notesByEpisode.get(`${e.playerId}|${e.startDate}`) ?? EMPTY_NOTE}
                onNote={(patch) => saveNote(e.playerId, e.startDate, patch)}
              />
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">
          Compilé automatiquement : la blessure commence à la première activité ratée, passe en réhabilitation
          quand le joueur revient à l&apos;entraînement, et se termine dès qu&apos;il figure dans un alignement.
        </p>
      </section>
    </div>
  );
}
