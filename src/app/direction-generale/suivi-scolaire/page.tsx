"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";

type Team = { code: string; name: string; coach_name: string | null; coach_emails: string[]; forward_enabled: boolean; sort: number; last_bilan_sent_at: string | null };
type Rost = { id: string; team_code: string; jersey: number | null; full_name: string; position: string | null };
type Period = { id: string; roster_id: string; period_date: string; start_time: string | null; status: "convoquee" | "annulee" };
type Result = { roster_id: string; term: number; average: number | null; grades: { s: string; v: number }[] };

const SUBJECTS: Record<string, string> = {
  EDU: "Éduc. phys.", SCI: "Sciences", MAT: "Maths", HIS: "Histoire", GEO: "Géo", FRA: "Français", ANG: "Anglais",
  MUS: "Musique", CCQ: "Culture et citoyenneté", ARP: "Arts plastiques", CHI: "Chimie", PHY: "Physique",
  MON: "Monde contemporain", FIN: "Éduc. financière", SEC: "Option", PLA: "Arts plastiques", ENR: "Enrichissement",
};

const today = () => format(new Date(), "yyyy-MM-dd");

/**
 * Direction générale › Suivi scolaire : les périodes étoilées des 5 équipes
 * (convocations de l'école consignées automatiquement depuis le 1er
 * septembre) et les résultats de la 1re étape. « Envoyer le bilan » envoie à
 * l'entraîneur de l'équipe le nombre de périodes étoilées de chacun de ses joueurs.
 */
export default function SuiviScolairePage() {
  const supabase = createClient();
  const [teams, setTeams] = useState<Team[]>([]);
  const [roster, setRoster] = useState<Rost[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [team, setTeam] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const [{ data: t }, { data: r }, { data: p }, { data: res }] = await Promise.all([
      supabase.from("school_teams").select("*").order("sort"),
      supabase.from("school_roster").select("id, team_code, jersey, full_name, position"),
      supabase.from("school_star_periods").select("id, roster_id, period_date, start_time, status").order("period_date"),
      supabase.from("school_term_results").select("roster_id, term, average, grades"),
    ]);
    setTeams((t ?? []) as Team[]);
    setRoster((r ?? []) as Rost[]);
    setPeriods((p ?? []) as Period[]);
    setResults((res ?? []) as Result[]);
    setTeam((prev) => prev || ((t ?? [])[0] as Team | undefined)?.code || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = teams.find((t) => t.code === team);

  const t0 = today();
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of periods) {
      if (p.status !== "convoquee" || p.period_date > t0) continue;
      const r = roster.find((x) => x.id === p.roster_id);
      if (r) m.set(r.team_code, (m.get(r.team_code) ?? 0) + 1);
    }
    return m;
  }, [periods, roster, t0]);

  const rows = useMemo(
    () =>
      roster
        .filter((r) => r.team_code === team)
        .map((r) => {
          const mine = periods.filter((p) => p.roster_id === r.id);
          const active = mine.filter((p) => p.status === "convoquee");
          const res = results.find((x) => x.roster_id === r.id && x.term === 1) ?? null;
          return {
            r,
            mine,
            past: active.filter((p) => p.period_date <= t0).length,
            upcoming: active.filter((p) => p.period_date > t0).length,
            cancelled: mine.filter((p) => p.status === "annulee").length,
            res,
          };
        })
        .sort((a, b) => b.past - a.past || b.upcoming - a.upcoming || a.r.full_name.localeCompare(b.r.full_name)),
    [roster, periods, results, team, t0]
  );

  async function saveCoach(patch: Partial<Team>) {
    if (!current) return;
    const { error } = await supabase.from("school_teams").update(patch).eq("code", current.code);
    if (error) return setMsg({ ok: false, text: error.message });
    setTeams((prev) => prev.map((t) => (t.code === current.code ? { ...t, ...patch } : t)));
  }

  async function sendBilan() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/suivi-scolaire/bilan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Envoi impossible.");
      setMsg({ ok: true, text: `Bilan envoyé à ${json.sentTo.join(", ")}.` });
      setTeams((prev) => prev.map((t) => (t.code === team ? { ...t, last_bilan_sent_at: new Date().toISOString() } : t)));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Envoi impossible." });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const gradeClass = (v: number) => (v < 60 ? "bg-red-100 text-red-700" : v < 70 ? "bg-amber-100 text-amber-800" : "");
  const recipients = current ? (current.coach_emails.length > 0 ? current.coach_emails : current.code === "M17AAA" ? ["vous (entraîneur-chef)"] : []) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/direction-generale" className="text-xs text-slate-400 hover:underline">
            ← Direction générale
          </Link>
          <h1 className="text-2xl font-bold">Suivi scolaire</h1>
          <p className="text-slate-400 text-sm">
            Périodes étoilées des 5 équipes depuis le 1er septembre (mises à jour automatiquement à chaque courriel de l&apos;école) et résultats de la 1re étape.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {teams.map((t) => (
              <button
                key={t.code}
                onClick={() => {
                  setTeam(t.code);
                  setOpen(null);
                  setConfirm(false);
                  setMsg(null);
                }}
                className={`rounded-xl border px-3 py-2 text-left transition ${t.code === team ? "border-gold-400 bg-gold-400/15" : "border-slate-600 hover:border-slate-400"}`}
              >
                <div className="text-sm font-bold text-slate-100">{t.name}</div>
                <div className="text-xs text-slate-400">{totals.get(t.code) ?? 0} périodes étoilées</div>
              </button>
            ))}
          </div>

          {current && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {current.name} — {current.coach_name}
                  </h2>
                  <p className="text-xs text-gray-600">
                    {current.last_bilan_sent_at
                      ? `Dernier bilan envoyé le ${format(parseISO(current.last_bilan_sent_at), "d MMMM 'à' HH:mm", { locale: fr })}`
                      : "Aucun bilan envoyé pour l'instant."}
                  </p>
                </div>
                {!confirm ? (
                  <button className="btn" disabled={recipients.length === 0 || busy} onClick={() => setConfirm(true)}>
                    ✉️ Envoyer le bilan
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-700">Envoyer à {recipients.join(", ")} ?</span>
                    <button className="btn" disabled={busy} onClick={sendBilan}>
                      {busy ? "Envoi…" : "Oui, envoyer"}
                    </button>
                    <button className="btn-secondary" disabled={busy} onClick={() => setConfirm(false)}>
                      Annuler
                    </button>
                  </div>
                )}
              </div>
              {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
              {current.code !== "M17AAA" && (
                <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                  <div>
                    <label className="label">Courriel(s) de l&apos;entraîneur</label>
                    <input
                      key={current.code}
                      className="input"
                      defaultValue={current.coach_emails.join(", ")}
                      placeholder="prenom.nom@asdequebecaaa.com"
                      onBlur={(e) => {
                        const list = e.target.value.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes("@"));
                        if (list.join(",") !== current.coach_emails.join(",")) saveCoach({ coach_emails: list });
                      }}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                    <input type="checkbox" checked={current.forward_enabled} onChange={(e) => saveCoach({ forward_enabled: e.target.checked })} />
                    Transfert automatique des convocations
                  </label>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Joueur</th>
                      <th className="py-2 px-2 text-center">Étoilées</th>
                      <th className="py-2 px-2 text-center">À venir</th>
                      <th className="py-2 px-2 text-center">Moy. 1re étape</th>
                      <th className="py-2 pl-2">Matières sous 70 %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ r, mine, past, upcoming, cancelled, res }) => {
                      const weak = (res?.grades ?? []).filter((g) => g.v < 70);
                      return (
                        <Fragment key={r.id}>
                          <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            <td className="py-2 pr-2 text-gray-500">{r.jersey ?? ""}</td>
                            <td className="py-2 pr-2 font-semibold text-gray-900">{r.full_name}</td>
                            <td className={`py-2 px-2 text-center font-bold ${past >= 6 ? "text-red-600" : past >= 3 ? "text-amber-700" : "text-gray-900"}`}>{past}</td>
                            <td className="py-2 px-2 text-center text-gray-700">{upcoming || "—"}</td>
                            <td className={`py-2 px-2 text-center font-semibold ${res?.average != null && res.average < 70 ? "text-amber-700" : "text-gray-900"}`}>{res?.average ?? "—"}</td>
                            <td className="py-2 pl-2">
                              <div className="flex flex-wrap gap-1">
                                {weak.map((g, i) => (
                                  <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${gradeClass(g.v)}`} title={SUBJECTS[g.s] ?? g.s}>
                                    {g.s} {g.v}
                                  </span>
                                ))}
                                {res && weak.length === 0 && <span className="text-xs text-green-700">Aucune</span>}
                              </div>
                            </td>
                          </tr>
                          {open === r.id && (
                            <tr className="bg-gray-50">
                              <td />
                              <td colSpan={5} className="py-2 pr-2 text-xs text-gray-700 space-y-2">
                                <div>
                                  <span className="font-semibold">Périodes étoilées : </span>
                                  {mine.length === 0
                                    ? "aucune"
                                    : mine.map((p, i) => (
                                        <span key={p.id} className={p.status === "annulee" ? "line-through text-gray-400" : p.period_date > t0 ? "text-blue-700" : ""}>
                                          {i > 0 ? ", " : ""}
                                          {format(parseISO(p.period_date), "d MMM", { locale: fr })}
                                          {p.start_time ? ` ${p.start_time.replace(":", "h")}` : ""}
                                        </span>
                                      ))}
                                  {cancelled > 0 && <span className="text-gray-400"> ({cancelled} annulée{cancelled > 1 ? "s" : ""} par l&apos;école)</span>}
                                </div>
                                {res && (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="font-semibold">1re étape :</span>
                                    {res.grades.map((g, i) => (
                                      <span key={i} className={`rounded px-1.5 py-0.5 ${gradeClass(g.v) || "bg-white border"}`}>
                                        {SUBJECTS[g.s] ?? g.s} {g.v}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                « Étoilées » = convocations à ce jour (annulations exclues). Rouge : 6 et plus, orange : 3 et plus. Notes : rouge sous 60 %, orange de 60 à 69 %. Touchez un joueur pour le détail.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
