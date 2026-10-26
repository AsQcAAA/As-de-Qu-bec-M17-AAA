"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";

interface Contact {
  id: string;
  full_name: string;
  email: string;
}
interface Meeting {
  id: string;
  meeting_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  topic: string | null;
  notes: string | null;
  invite_sent_at: string | null;
  cancelled_at: string | null;
}
interface Note {
  id: string;
  note: string;
  created_at: string;
}

const hm = (t: string | null) => (t ? t.slice(0, 5).replace(":", "h") : "");

/** Une rencontre : sujet et contenu, enregistrés quand on quitte le champ (le texte reste affiché, avec l'état de l'enregistrement). */
function MeetingCard({ m, onSave }: { m: Meeting; onSave: (id: string, patch: { topic?: string | null; notes?: string | null }) => Promise<string | null> }) {
  const [topic, setTopic] = useState(m.topic ?? "");
  const [notes, setNotes] = useState(m.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

  async function commit(patch: { topic?: string | null; notes?: string | null }) {
    setStatus("saving");
    const err = await onSave(m.id, patch);
    setStatus(err ? `Erreur : ${err}` : "saved");
    if (!err) setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
  }

  return (
    <div className={`card space-y-2 ${m.cancelled_at ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold capitalize">
          {format(parseISO(m.meeting_date), "EEEE d MMMM yyyy", { locale: fr })}
          <span className="font-normal normal-case text-slate-500">
            {" "}
            · {hm(m.start_time)}
            {m.end_time ? ` à ${hm(m.end_time)}` : ""}
            {m.location ? ` · ${m.location}` : ""}
          </span>
          {m.cancelled_at && <span className="ml-2 text-xs font-bold normal-case text-red-600">Annulée</span>}
        </div>
        {status === "saving" && <span className="text-xs font-bold text-slate-400">Enregistrement…</span>}
        {status === "saved" && <span className="text-xs font-bold text-green-600">Enregistré</span>}
        {status !== "idle" && status !== "saving" && status !== "saved" && <span className="text-xs font-bold text-red-600">{status}</span>}
      </div>
      <div>
        <label className="label">Sujet</label>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => commit({ topic: topic.trim() || null })} />
      </div>
      <div>
        <label className="label">Contenu de la rencontre</label>
        <textarea
          className="input"
          rows={5}
          placeholder="Ce qui a été discuté, décisions, points à suivre…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => commit({ notes: notes.trim() || null })}
        />
        <button type="button" className="btn-secondary mt-2 text-xs" onClick={() => commit({ topic: topic.trim() || null, notes: notes.trim() || null })}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/** Fiche d'un entraîneur : ses rencontres (avec le contenu de chacune) et ses notes de suivi. */
export default function CoachFichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const [coach, setCoach] = useState<Contact | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");

  async function load() {
    const [{ data: c }, { data: ms }, { data: ns }] = await Promise.all([
      supabase.from("coach_contacts").select("*").eq("id", id).maybeSingle(),
      supabase.from("coach_meetings").select("*").eq("coach_id", id).order("meeting_date", { ascending: false }).order("start_time", { ascending: false }),
      supabase.from("coach_notes").select("*").eq("coach_id", id).order("created_at", { ascending: false }),
    ]);
    setCoach((c as Contact | null) ?? null);
    setMeetings((ms ?? []) as Meeting[]);
    setNotes((ns ?? []) as Note[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Enregistre le sujet ou le contenu d'une rencontre ; renvoie un message d'erreur, ou null si tout va bien. */
  async function saveMeeting(mid: string, patch: { topic?: string | null; notes?: string | null }): Promise<string | null> {
    const { error } = await supabase.from("coach_meetings").update(patch).eq("id", mid);
    if (error) return error.message;
    // Le texte enregistré devient la valeur de référence en mémoire (sinon la fiche réaffichait l'ancien texte).
    setMeetings((prev) => prev.map((x) => (x.id === mid ? { ...x, ...patch } : x)));
    return null;
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await supabase.from("coach_notes").insert({ coach_id: id, note: noteText.trim() });
    setNoteText("");
    await load();
  }

  if (loading) return <p className="text-slate-300">Chargement...</p>;
  if (!coach)
    return (
      <div className="space-y-3">
        <p className="text-slate-300">Entraîneur introuvable.</p>
        <Link href="/direction-generale/suivi-coach" className="btn-dark">
          ← Suivi de coach
        </Link>
      </div>
    );

  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = meetings.filter((m) => m.meeting_date >= today && !m.cancelled_at).reverse();
  const past = meetings.filter((m) => m.meeting_date < today || m.cancelled_at);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{coach.full_name}</h1>
          <p className="text-slate-400 text-sm">{coach.email}</p>
          <p className="text-slate-400 text-sm">
            {meetings.filter((m) => !m.cancelled_at && m.meeting_date < today).length} rencontre(s) passée(s) · {upcoming.length} à venir · {notes.length} note(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/direction-generale/suivi-coach?book=${coach.id}`} className="btn">
            + Booker une rencontre
          </Link>
          <Link href="/direction-generale/suivi-coach" className="btn-dark">
            ← Suivi de coach
          </Link>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white">Notes de suivi</h2>
        <form onSubmit={addNote} className="card flex gap-2">
          <input className="input" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Observation, point à suivre…" />
          <button type="submit" className="btn shrink-0">
            Ajouter
          </button>
        </form>
        {notes.length > 0 && (
          <div className="card space-y-1.5">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1 last:border-0 text-sm">
                <div>
                  <span className="text-xs text-slate-400">{format(parseISO(n.created_at), "d MMM yyyy", { locale: fr })} · </span>
                  {n.note}
                </div>
                <button className="shrink-0 text-xs text-red-600 hover:underline" onClick={async () => { await supabase.from("coach_notes").delete().eq("id", n.id); await load(); }}>
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white">Rencontres à venir ({upcoming.length})</h2>
        {upcoming.length === 0 ? <p className="text-sm text-slate-400">Aucune rencontre prévue.</p> : upcoming.map((m) => <MeetingCard key={m.id} m={m} onSave={saveMeeting} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white">Rencontres passées ({past.length})</h2>
        {past.length === 0 ? <p className="text-sm text-slate-400">Aucune rencontre passée.</p> : past.map((m) => <MeetingCard key={m.id} m={m} onSave={saveMeeting} />)}
      </section>
    </div>
  );
}
