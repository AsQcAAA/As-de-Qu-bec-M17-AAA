"use client";

import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { buildCalendarEmailHtml } from "@/lib/calendarExport";
import {
  EMAIL_SIGNATURE_BASE64,
  EMAIL_SIGNATURE_HEIGHT,
  EMAIL_SIGNATURE_WIDTH,
} from "@/lib/emailSignature";

interface SendResult {
  ok: boolean;
  sent: string[];
  skipped: { name: string; reason: string }[];
  failed: { name: string; error: string }[];
  error?: string;
}

/**
 * Rédaction et envoi : objet et message modifiables, signature de Jean ajoutée
 * automatiquement, réponses redirigées vers son courriel professionnel. Un
 * second clic de confirmation évite d'envoyer 25 courriels par erreur.
 */
export default function EmailComposer({
  playerIds,
  defaultSubject = "",
  defaultMessage = "",
  calendarDefault = false,
  calendarMonth,
  onlyEmails,
  onSent,
}: {
  playerIds: string[];
  defaultSubject?: string;
  defaultMessage?: string;
  /** Le calendrier du mois est une option : décoché, le courriel ne contient que le message. */
  calendarDefault?: boolean;
  calendarMonth?: Date;
  /** Limite l'envoi à ces adresses de la famille (un seul joueur) au lieu de toutes. */
  onlyEmails?: string[];
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [copyToMe, setCopyToMe] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  // ---- Adresses réelles des destinataires (chacune peut être retirée) ----
  const [recipientInfo, setRecipientInfo] = useState<{ id: string; name: string; emails: string[] }[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const idsKey = playerIds.join(",");
  useEffect(() => {
    if (playerIds.length === 0) {
      setRecipientInfo([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("players").select("id, full_name").in("id", playerIds),
      supabase.from("player_contacts").select("player_id, emails").in("player_id", playerIds),
    ]).then(([{ data: pls }, { data: cts }]) => {
      if (cancelled) return;
      const emailsById = new Map((cts ?? []).map((c) => [c.player_id as string, (c.emails ?? []) as string[]]));
      const info = (pls ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string, emails: emailsById.get(p.id) ?? [] }));
      setRecipientInfo(info);
      // Arrivée par un clic sur une adresse précise : les autres adresses du joueur démarrent retirées.
      if (onlyEmails && info.length === 1) {
        setExcluded(new Set(info[0].emails.filter((e) => !onlyEmails.includes(e)).map((e) => `${info[0].id}|${e}`)));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  const keyOf = (id: string, email: string) => `${id}|${email}`;
  const activeEmails = (r: { id: string; emails: string[] }) => r.emails.filter((e) => !excluded.has(keyOf(r.id, e)));
  function toggleEmail(id: string, email: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      const k = keyOf(id, email);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  const addressCount = recipientInfo.reduce((n, r) => n + activeEmails(r).length, 0);
  const sendLabel =
    addressCount === 0
      ? "Envoyer"
      : addressCount <= 2
        ? `Envoyer à ${recipientInfo.flatMap(activeEmails).join(", ")}`
        : `Envoyer à ${addressCount} adresses`;

  // ---- Calendrier du mois (option) ----
  const [includeCalendar, setIncludeCalendar] = useState(calendarDefault);
  const [monthKey, setMonthKey] = useState(format(calendarMonth ?? new Date(), "yyyy-MM"));
  const [calendarHtml, setCalendarHtml] = useState<string | null>(null);
  const monthOptions = useMemo(() => {
    const base = startOfMonth(new Date());
    const list = [-1, 0, 1, 2, 3].map((d) => addMonths(base, d));
    const chosen = calendarMonth ? startOfMonth(calendarMonth) : null;
    if (chosen && !list.some((m) => format(m, "yyyy-MM") === format(chosen, "yyyy-MM"))) list.unshift(chosen);
    return list;
  }, [calendarMonth]);

  useEffect(() => {
    if (!includeCalendar) return;
    let cancelled = false;
    setCalendarHtml(null);
    const month = new Date(`${monthKey}-01T12:00:00`);
    const from = format(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const to = format(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const supabase = createClient();
    Promise.all([
      supabase.from("schedule_events").select("*").gte("event_date", from).lte("event_date", to),
      supabase.from("games").select("*").gte("game_date", from).lte("game_date", to),
      supabase.from("calendar_day_notes").select("*").gte("day", from).lte("day", to),
    ]).then(([{ data: events }, { data: games }, { data: notes }]) => {
      if (cancelled) return;
      setCalendarHtml(
        buildCalendarEmailHtml({
          month,
          events: events ?? [],
          games: games ?? [],
          dayNotes: Object.fromEntries((notes ?? []).map((x) => [x.day, x.notes ?? ""])),
          highlights: Object.fromEntries((notes ?? []).map((x) => [x.day, x.highlight ?? false])),
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [includeCalendar, monthKey]);

  const extraHtml = includeCalendar ? (calendarHtml ?? undefined) : undefined;
  const n = playerIds.length;
  const calendarReady = !includeCalendar || calendarHtml !== null;
  const canSend = addressCount > 0 && subject.trim() !== "" && message.trim() !== "" && calendarReady;

  async function send(testOnly = false) {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerIds,
          subject,
          message,
          extraHtml,
          copyToMe,
          testOnly,
          recipientEmails: Object.fromEntries(recipientInfo.map((r) => [r.id, activeEmails(r)])),
        }),
      });
      const data = (await res.json()) as SendResult;
      setResult(res.ok ? data : { ok: false, sent: [], skipped: [], failed: [], error: data.error ?? "Échec de l'envoi." });
      if (res.ok && data.sent.length > 0) onSent?.();
    } catch {
      setResult({ ok: false, sent: [], skipped: [], failed: [], error: "Le serveur n'a pas répondu." });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-100 px-3 py-2">
        <div className="text-xs font-bold text-slate-600 mb-1">
          À : {addressCount} adresse{addressCount > 1 ? "s" : ""}
        </div>
        {recipientInfo.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun destinataire.</p>
        ) : (
          <ul className="space-y-0.5">
            {recipientInfo.map((r) => (
              <li key={r.id} className="text-sm flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{r.name}</span>
                <span className="text-slate-500">—</span>
                {r.emails.length === 0 && <span className="font-semibold text-red-600">aucun courriel enregistré</span>}
                {r.emails.map((e) => {
                  const off = excluded.has(keyOf(r.id, e));
                  return (
                    <span
                      key={e}
                      className={`inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs font-semibold ${
                        off ? "bg-slate-200 text-slate-400 line-through" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {e}
                      <button
                        type="button"
                        onClick={() => toggleEmail(r.id, e)}
                        title={off ? "Remettre cette adresse" : "Retirer cette adresse"}
                        className="h-4 w-4 rounded-full bg-black/10 hover:bg-black/25 leading-none no-underline"
                      >
                        {off ? "+" : "×"}
                      </button>
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="label">Objet</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet du courriel" />
      </div>
      <div>
        <label className="label">Message</label>
        <textarea
          className="input"
          rows={9}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={"Bonjour,\n\n…"}
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Astuce : écris <code className="bg-slate-100 px-1 rounded">{"{joueur}"}</code> pour insérer automatiquement le
          prénom du joueur dans chaque courriel (ex. « Bonjour, voici le suivi de {"{joueur}"} »).
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={includeCalendar} onChange={(e) => setIncludeCalendar(e.target.checked)} />
            📅 Joindre le calendrier du mois
          </label>
          {includeCalendar && (
            <select className="input w-auto text-sm" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {monthOptions.map((m) => (
                <option key={format(m, "yyyy-MM")} value={format(m, "yyyy-MM")}>
                  {format(m, "MMMM yyyy", { locale: fr })}
                </option>
              ))}
            </select>
          )}
          {!includeCalendar && <span className="text-xs text-slate-500">Optionnel — sans, le courriel ne contient que ton message.</span>}
        </div>
        {includeCalendar && (
          <div>
            <div className="label">Aperçu du calendrier ajouté (avant ta signature)</div>
            <div className="rounded-lg border border-slate-200 bg-white p-2 overflow-x-auto">
              {calendarHtml ? <div dangerouslySetInnerHTML={{ __html: calendarHtml }} /> : <p className="text-sm text-slate-500">Chargement…</p>}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="label">Signature (ajoutée automatiquement)</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${EMAIL_SIGNATURE_BASE64}`}
          width={EMAIL_SIGNATURE_WIDTH}
          height={EMAIL_SIGNATURE_HEIGHT}
          alt="Signature de Jean Grignon-Francke"
          className="max-w-full h-auto rounded border border-slate-200"
        />
        <p className="text-[11px] text-slate-500 mt-1">Les réponses reviennent à ton courriel professionnel.</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={copyToMe} onChange={(e) => setCopyToMe(e.target.checked)} />
        M&apos;envoyer une copie (un seul courriel récapitulatif)
      </label>

      {result && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            result.error || result.failed.length > 0 ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"
          }`}
        >
          {result.error && <p className="font-semibold">{result.error}</p>}
          {result.sent.length > 0 && <p className="font-semibold">✓ Envoyé : {result.sent.join(" ; ")}</p>}
          {result.skipped.length > 0 && (
            <p>Ignorés : {result.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.</p>
          )}
          {result.failed.length > 0 && <p>Échecs : {result.failed.map((f) => `${f.name} — ${f.error}`).join(" ; ")}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!confirming ? (
          <button type="button" className="btn" disabled={!canSend || sending} onClick={() => setConfirming(true)}>
            ✉️ {sendLabel}
          </button>
        ) : (
          <>
            <button type="button" className="btn" disabled={sending} onClick={() => send()}>
              {sending ? "Envoi en cours…" : `Confirmer l'envoi (${addressCount} adresse${addressCount > 1 ? "s" : ""})`}
            </button>
            <button type="button" className="btn-secondary" disabled={sending} onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={sending || subject.trim() === "" || message.trim() === "" || !calendarReady}
          onClick={() => send(true)}
          title="Reçois ce courriel toi-même, sans rien envoyer aux familles"
        >
          🧪 M&apos;envoyer un essai
        </button>
        {!canSend && <span className="text-xs text-slate-500">Il faut au moins une adresse, un objet et un message.</span>}
      </div>
    </div>
  );
}
