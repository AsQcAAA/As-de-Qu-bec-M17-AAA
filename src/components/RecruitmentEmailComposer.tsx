"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadRecruitmentData } from "@/lib/recruitmentData";
import { buildRecruitmentPdf, bytesToBase64, loadPdfBackground } from "@/lib/recruitmentPdf";
import { EMAIL_SIGNATURE_BASE64 } from "@/lib/emailSignature";
import { lastName } from "@/lib/players";
import type { Player } from "@/lib/types";

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const GROUPS: { title: string; filter: (p: Player) => boolean }[] = [
  { title: "Attaquants", filter: (p) => !p.is_call_up && p.position === "F" },
  { title: "Défenseurs", filter: (p) => !p.is_call_up && p.position === "D" },
  { title: "Gardiens", filter: (p) => !p.is_call_up && p.position === "G" },
  { title: "Remplaçants", filter: (p) => p.is_call_up },
];

const fileName = (p: Player) =>
  `Fiche de recrutement - ${p.full_name.normalize("NFD").replace(/[̀-ͯ]/g, "")}.pdf`;

/**
 * Envoi de fiches de recrutement : l'adresse du destinataire est saisie à la
 * main (un recruteur — jamais une famille), puis on coche les joueurs dont la
 * fiche en PDF sera jointe au courriel.
 */
export default function RecruitmentEmailComposer({ players }: { players: Player[] }) {
  const supabase = createClient();
  const [toText, setToText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  // L'objet et le message se rédigent seuls d'après les joueurs choisis, tant
  // qu'on n'y touche pas ; dès qu'on les modifie à la main, on les laisse tranquilles.
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [messageEdit, setMessageEdit] = useState<string | null>(null);
  const [copyToMe, setCopyToMe] = useState(true);
  const [busy, setBusy] = useState<null | "send" | "test">(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const recipients = useMemo(
    () => [...new Set(toText.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))],
    [toText]
  );
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
  const chosen = players.filter((p) => selected.has(p.id));
  const q = search.trim().toLowerCase();

  const names = chosen.map((p) => p.full_name.trim());
  const nameList =
    names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  const autoSubject =
    names.length === 1
      ? `Fiche de recrutement — ${names[0]} — As de Québec M17 AAA`
      : "Fiches de recrutement — As de Québec M17 AAA";
  const autoMessage =
    "Bonjour,\n\n" +
    (names.length === 0
      ? "Vous trouverez ci-joint la fiche de recrutement."
      : names.length === 1
        ? `Vous trouverez ci-joint la fiche de recrutement de ${nameList}.`
        : `Vous trouverez ci-joint les ${names.length} fiches de recrutement de ${nameList}.`) +
    "\n\nN'hésitez pas à me contacter pour toute question.\n\nAu plaisir,";
  const subject = subjectEdit ?? autoSubject;
  const message = messageEdit ?? autoMessage;
  const setSubject = (v: string) => setSubjectEdit(v);
  const setMessage = (v: string) => setMessageEdit(v);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
    setConfirm(false);
  }

  async function send(test: boolean) {
    setBusy(test ? "test" : "send");
    setResult(null);
    try {
      const attachments: { filename: string; contentBase64: string }[] = [];
      const background = await loadPdfBackground();
      for (const p of chosen) {
        const data = await loadRecruitmentData(supabase, p.id);
        const pdf = await buildRecruitmentPdf(data, { background });
        attachments.push({ filename: fileName(p), contentBase64: bytesToBase64(pdf) });
      }
      const res = await fetch("/api/email/send-recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipients, subject, message, attachments, copyToMe, testOnly: test }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Envoi impossible.");
      setResult({
        ok: true,
        text: test
          ? `Essai envoyé à ton adresse, avec ${attachments.length} fiche(s) en PDF.`
          : `Courriel envoyé à ${recipients.join(", ")} avec ${attachments.length} fiche(s) en PDF.`,
      });
      setConfirm(false);
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Envoi impossible." });
    } finally {
      setBusy(null);
    }
  }

  const canSend = recipients.length > 0 && invalid.length === 0 && chosen.length > 0 && subject.trim() && message.trim();

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">1. Destinataire</h2>
        <p className="text-xs text-slate-500">
          L&apos;adresse du recruteur (ou de plusieurs, séparées par une virgule). Les fiches ne sont jamais envoyées aux
          joueurs ni à leur famille.
        </p>
        <input
          className="input"
          type="text"
          inputMode="email"
          placeholder="recruteur@equipe.com"
          value={toText}
          onChange={(e) => {
            setToText(e.target.value);
            setResult(null);
            setConfirm(false);
          }}
        />
        {invalid.length > 0 && <p className="text-sm text-red-600">Adresse invalide : {invalid.join(", ")}</p>}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">2. Joueurs inclus ({chosen.length})</h2>
          <input className="input max-w-xs" placeholder="Rechercher un joueur ou un numéro…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {GROUPS.map((g) => {
            const list = players
              .filter(g.filter)
              .filter((p) => !q || p.full_name.toLowerCase().includes(q) || String(p.jersey_number ?? "").includes(q));
            if (list.length === 0) return null;
            return (
              <div key={g.title} className="space-y-1">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">{g.title}</div>
                {list.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>
                      {p.jersey_number != null ? `#${p.jersey_number} ` : ""}
                      {lastName(p.full_name)}
                      <span className="text-slate-400"> — {p.full_name.split(" ")[0]}</span>
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">3. Message</h2>
        <div>
          <label className="label">Objet</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {chosen.length > 0 && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm space-y-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Pièces jointes (PDF)</div>
            {chosen.map((p) => (
              <div key={p.id}>📎 {fileName(p)}</div>
            ))}
          </div>
        )}
        <div className="rounded-lg border border-slate-200 p-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Ta signature (ajoutée automatiquement)</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/jpeg;base64,${EMAIL_SIGNATURE_BASE64}`} alt="Signature" className="max-w-full h-auto" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copyToMe} onChange={(e) => setCopyToMe(e.target.checked)} />
          M&apos;envoyer une copie
        </label>

        {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.text}</p>}

        {!confirm ? (
          <div className="flex gap-2 flex-wrap">
            <button className="btn" disabled={!canSend || busy !== null} onClick={() => setConfirm(true)}>
              ✉️ Envoyer à {recipients.length === 1 ? recipients[0] : `${recipients.length} adresses`}
            </button>
            <button className="btn-secondary" disabled={chosen.length === 0 || !subject.trim() || !message.trim() || busy !== null} onClick={() => send(true)}>
              {busy === "test" ? "Envoi de l'essai…" : "🧪 M'envoyer un essai"}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm">
              Envoyer {chosen.length} fiche(s) en PDF à <strong>{recipients.join(", ")}</strong> ? Cette action est définitive.
            </p>
            <div className="flex gap-2">
              <button className="btn" disabled={busy !== null} onClick={() => send(false)}>
                {busy === "send" ? "Envoi…" : "Oui, envoyer"}
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
