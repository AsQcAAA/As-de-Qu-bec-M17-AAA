"use client";

import { useMemo, useState } from "react";
import { computeFiche, ficheHtml, sessionName, type TestResultLike } from "@/lib/testsFiche";
import type { Player } from "@/lib/types";

/**
 * Envoi aux joueurs (à leur famille) de la fiche de leurs tests physiques :
 * résultats, classement dans l'équipe et évolution depuis la séance précédente.
 */
export default function TestsEmailModal({
  results,
  players,
  initialSession,
  onClose,
}: {
  results: TestResultLike[];
  players: Player[];
  initialSession: string;
  onClose: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string>("");
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [messageEdit, setMessageEdit] = useState<string | null>(null);
  const [copyToMe, setCopyToMe] = useState(true);
  const [busy, setBusy] = useState<null | "send" | "test">(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const dates = useMemo(() => [...new Set(results.map((r) => r.test_date))].sort(), [results]);
  const roster = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const label = sessionName(session, dates);
  const previousDate = [...dates].reverse().find((d) => d < session) ?? null;
  const previousLabel = previousDate ? sessionName(previousDate, dates) : null;

  // Joueurs de l'équipe ayant au moins un résultat à cette séance.
  const candidates = useMemo(
    () =>
      players
        .filter((p) => computeFiche(p.id, session, results, roster).rows.length > 0)
        .sort((a, b) => (a.jersey_number ?? 99) - (b.jersey_number ?? 99)),
    [players, session, results, roster]
  );
  const chosen = candidates.filter((p) => !excluded.has(p.id));
  const previewPlayer = candidates.find((p) => p.id === previewId) ?? candidates[0];
  const preview = previewPlayer ? ficheHtml(previewPlayer.full_name, computeFiche(previewPlayer.id, session, results, roster)) : "";

  const subject = subjectEdit ?? `Tes résultats aux tests physiques — ${label} — As de Québec M17 AAA`;
  const message =
    messageEdit ??
    `Salut {joueur},\n\nVoici tes résultats aux tests physiques (${label.toLowerCase()}) : ton classement dans l'équipe${
      previousLabel ? ` et ton évolution par rapport aux tests du ${previousLabel.toLowerCase()}` : ""
    }.`;

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirm(false);
    setResult(null);
  }

  async function send(test: boolean) {
    setBusy(test ? "test" : "send");
    setResult(null);
    try {
      const res = await fetch("/api/email/send-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerIds: test ? [(previewPlayer ?? chosen[0])?.id] : chosen.map((p) => p.id),
          sessionDate: session,
          subject,
          message,
          copyToMe,
          testOnly: test,
        }),
      });
      const json = await res.json();
      if (!res.ok && json.error) throw new Error(json.error);
      const lines: string[] = [];
      for (const s of json.sent ?? []) lines.push(`✓ ${s}`);
      for (const s of json.skipped ?? []) lines.push(`— ${s.name} : ${s.reason}`);
      for (const f of json.failed ?? []) lines.push(`✕ ${f.name} : ${f.error}`);
      setResult({ ok: !!json.ok, lines });
      setConfirm(false);
    } catch (e) {
      setResult({ ok: false, lines: [e instanceof Error ? e.message : "Envoi impossible."] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Envoyer les résultats aux joueurs</h2>
          <p className="text-sm text-slate-400">
            Chaque joueur reçoit (à sa famille) sa fiche : ses résultats, son classement dans l&apos;équipe et son évolution
            {previousLabel ? ` depuis ${previousLabel.toLowerCase()}` : ""}.
          </p>
        </div>
        <button className="btn-secondary shrink-0" onClick={onClose}>
          ✕ Fermer
        </button>
      </div>

      <section className="card space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="label mb-0">Séance</label>
          <select className="input w-auto" value={session} onChange={(e) => { setSession(e.target.value); setPreviewId(""); setConfirm(false); setResult(null); }}>
            {[...dates].reverse().map((d) => (
              <option key={d} value={d}>
                {sessionName(d, dates)}
              </option>
            ))}
          </select>
          <button className="text-xs underline" onClick={() => setExcluded(new Set())}>
            Tous
          </button>
          <button className="text-xs underline" onClick={() => setExcluded(new Set(candidates.map((p) => p.id)))}>
            Aucun
          </button>
          <span className="text-sm font-semibold">{chosen.length} joueur(s) sélectionné(s)</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-x-4 gap-y-1">
          {candidates.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!excluded.has(p.id)} onChange={() => toggle(p.id)} />
              <span>
                {p.jersey_number != null ? `#${p.jersey_number} ` : ""}
                {p.full_name}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <label className="label">Objet</label>
          <input className="input" value={subject} onChange={(e) => setSubjectEdit(e.target.value)} />
        </div>
        <div>
          <label className="label">Message (la fiche s&apos;insère dessous, puis ta signature)</label>
          <textarea className="input" rows={5} value={message} onChange={(e) => setMessageEdit(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">{"{joueur}"} est remplacé par le prénom de chaque joueur.</p>
        </div>
      </section>

      <section className="card space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold">Aperçu de la fiche</h3>
          <select className="input w-auto" value={previewPlayer?.id ?? ""} onChange={(e) => setPreviewId(e.target.value)}>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: preview }} />
      </section>

      <section className="card space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copyToMe} onChange={(e) => setCopyToMe(e.target.checked)} />
          M&apos;envoyer une copie récapitulative
        </label>
        {result && (
          <div className={`text-sm space-y-0.5 ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        {!confirm ? (
          <div className="flex gap-2 flex-wrap">
            <button className="btn" disabled={chosen.length === 0 || busy !== null} onClick={() => setConfirm(true)}>
              ✉️ Envoyer à {chosen.length} joueur(s)
            </button>
            <button className="btn-secondary" disabled={candidates.length === 0 || busy !== null} onClick={() => send(true)}>
              {busy === "test" ? "Envoi de l'essai…" : "🧪 M'envoyer un essai"}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm">
              Envoyer la fiche de tests à <strong>{chosen.length} joueur(s)</strong> (leurs familles) ? Cette action est définitive.
            </p>
            <div className="flex gap-2">
              <button className="btn" disabled={busy !== null} onClick={() => send(false)}>
                {busy === "send" ? "Envoi en cours…" : "Oui, envoyer"}
              </button>
              <button className="btn-secondary" disabled={busy !== null} onClick={() => setConfirm(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
