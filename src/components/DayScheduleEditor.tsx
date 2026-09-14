"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EVENT_TYPE_LABEL, EVENT_TYPE_ORDER, showsLocation } from "@/lib/eventTypes";
import type { EventType, ScheduleEvent } from "@/lib/types";

const emptyForm = { start_time: "", event_type: "practice" as EventType, title: "", location: "" };

/**
 * Horaire d'une journée : meetings, pratique, team building, etc.
 * Utilisé dans la fiche du jour et depuis l'alignement — les jours de match, la
 * fiche du jour affiche le formulaire de résultat à la place de l'horaire, donc
 * c'est le seul endroit où le modifier.
 */
export default function DayScheduleEditor({
  date,
  isGameDay = false,
  onChanged,
}: {
  date: string;
  /** Un rappel n'a de sens que pour une pratique : rien à répéter sur un match. */
  isGameDay?: boolean;
  onChanged?: () => void;
}) {
  const supabase = createClient();
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from("schedule_events").select("*").eq("event_date", date).order("start_time");
    setEvents(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const isReminder = form.event_type === "reminder";
  // Les options du menu suivent le même ordre partout dans l'app ; seul le
  // rappel se retire les jours de match, où il n'a rien à annoncer.
  const typeOptions = EVENT_TYPE_ORDER.filter((t) => t !== "reminder" || !isGameDay);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    // Un rappel SANS texte ne veut rien dire : contrairement aux autres cases,
    // qui retombent sur leur libellé (« Pratique »), il n'a pas de contenu par défaut.
    const title = form.title.trim() || (isReminder ? "" : EVENT_TYPE_LABEL[form.event_type]);
    if (!title) return;
    await supabase.from("schedule_events").insert({
      event_date: date,
      start_time: isReminder ? null : form.start_time || null,
      event_type: form.event_type,
      title,
      location: form.location || null,
    });
    setForm(emptyForm);
    await load();
    onChanged?.();
  }

  async function removeEvent(id: string) {
    await supabase.from("schedule_events").delete().eq("id", id);
    await load();
    onChanged?.();
  }

  if (loading) return <p className="text-sm text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 text-sm">
        {events.length === 0 && <li className="text-slate-500">Aucun évènement.</li>}
        {events.map((e) => (
          <li key={e.id} className="flex items-center justify-between border-b last:border-0 pb-1.5">
            {e.event_type === "reminder" ? (
              // Le rappel n'a pas d'heure : c'est son texte qui compte, mis en
              // évidence pour se distinguer du reste de l'horaire.
              <span className="font-semibold text-red-700">📌 {e.title}</span>
            ) : (
              <span>
                {e.start_time && <span className="font-medium">{e.start_time.slice(0, 5)} — </span>}
                {EVENT_TYPE_LABEL[e.event_type]}
                {e.title && e.title !== EVENT_TYPE_LABEL[e.event_type] ? ` : ${e.title}` : ""}
                {e.location && showsLocation(e.event_type) ? ` (${e.location})` : ""}
              </span>
            )}
            <button onClick={() => removeEvent(e.id)} className="text-xs text-red-600 hover:underline shrink-0">
              Retirer
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={addEvent} className="grid grid-cols-2 gap-2 pt-2 border-t">
        {!isReminder && (
          <input
            type="time"
            className="input"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
          />
        )}
        <select
          className={isReminder ? "input col-span-2" : "input"}
          value={form.event_type}
          onChange={(e) => {
            const t = e.target.value as EventType;
            setForm({
              ...form,
              event_type: t,
              // Le rappel part d'un champ vide — pas de libellé générique à
              // effacer — les autres types gardent leur nom par défaut.
              title: t === "reminder" ? "" : EVENT_TYPE_LABEL[t],
              location: showsLocation(t) ? form.location : "",
            });
          }}
        >
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          className="input col-span-2"
          placeholder={isReminder ? "Texte du rappel — affiché tel quel sur la vue TV" : "Détail (optionnel)"}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        {showsLocation(form.event_type) && (
          <input
            className="input col-span-2"
            placeholder="Endroit (optionnel)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        )}
        <button type="submit" className="btn col-span-2" disabled={isReminder && !form.title.trim()}>
          {isReminder ? "Ajouter le rappel" : "Ajouter à l'horaire"}
        </button>
      </form>
    </div>
  );
}
