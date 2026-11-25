"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const EVENT_KEY = "noel-2026";

type Rsvp = { id: string; name: string; attending: boolean | null };

/**
 * Party de Noël des employés (As & Chevaliers — La Bûche, jeudi 17 décembre
 * 18 h) : liste des invités avec leur confirmation (Oui / Non).
 */
export default function PartyNoelPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [attending, setAttending] = useState<boolean | null>(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("party_rsvp")
      .select("id, name, attending")
      .eq("event_key", EVENT_KEY)
      .order("name");
    if (error) setError(error.message);
    setRows((data ?? []) as Rsvp[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("party_rsvp").insert({ event_key: EVENT_KEY, name: n, attending });
    setSaving(false);
    if (error) return setError(error.message);
    setName("");
    setAttending(true);
    load();
  }

  async function setAnswer(r: Rsvp, value: boolean | null) {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, attending: value } : x)));
    const { error } = await supabase.from("party_rsvp").update({ attending: value }).eq("id", r.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(r: Rsvp) {
    if (!confirm(`Retirer ${r.name} de la liste ?`)) return;
    const { error } = await supabase.from("party_rsvp").delete().eq("id", r.id);
    if (error) return setError(error.message);
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  }

  const yes = rows.filter((r) => r.attending === true).length;
  const no = rows.filter((r) => r.attending === false).length;
  const pending = rows.length - yes - no;

  const answerBtn = (active: boolean, tone: "yes" | "no") =>
    `px-3 py-1.5 rounded-lg text-sm font-bold border transition ${
      active
        ? tone === "yes"
          ? "bg-emerald-500 border-emerald-500 text-white"
          : "bg-red-500 border-red-500 text-white"
        : "border-slate-600 text-slate-300 hover:border-slate-400"
    }`;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/party-noel-2026.webp"
        alt="Party de Noël des employés — Party de cabane à sucre, jeudi 17 décembre 18 h, La Bûche, Vieux-Québec, As & Chevaliers"
        className="w-full max-w-md mx-auto rounded-2xl shadow-lg"
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-100">Party de Noël des employés</h1>
        <p className="text-slate-400 text-sm">Jeudi 17 décembre, 18 h — La Bûche, Vieux-Québec</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card">
          <div className="text-3xl font-bold text-emerald-400">{yes}</div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Oui</div>
        </div>
        <div className="card">
          <div className="text-3xl font-bold text-red-400">{no}</div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Non</div>
        </div>
        <div className="card">
          <div className="text-3xl font-bold text-slate-300">{pending}</div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Sans réponse</div>
        </div>
      </div>

      <form onSubmit={add} className="card space-y-3">
        <label className="label">Ajouter une personne</label>
        <input className="input" placeholder="Nom de la personne" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-400">Confirmation :</span>
          <button type="button" className={answerBtn(attending === true, "yes")} onClick={() => setAttending(true)}>
            Oui
          </button>
          <button type="button" className={answerBtn(attending === false, "no")} onClick={() => setAttending(false)}>
            Non
          </button>
          <button type="button" className={answerBtn(attending === null, "no").replace("bg-red-500 border-red-500", "bg-slate-500 border-slate-500")} onClick={() => setAttending(null)}>
            Sans réponse
          </button>
          <button className="btn ml-auto" disabled={saving || !name.trim()}>
            {saving ? "Ajout…" : "Ajouter"}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      <section className="card">
        <h2 className="font-semibold mb-3">Liste ({rows.length})</h2>
        {loading ? (
          <p className="text-slate-400 text-sm">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm">Personne encore. Ajoutez le premier nom ci-dessus.</p>
        ) : (
          <ul className="divide-y divide-slate-700">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 flex-wrap">
                <span className="font-medium text-slate-100 flex-1 min-w-[8rem]">{r.name}</span>
                <button className={answerBtn(r.attending === true, "yes")} onClick={() => setAnswer(r, r.attending === true ? null : true)}>
                  Oui
                </button>
                <button className={answerBtn(r.attending === false, "no")} onClick={() => setAnswer(r, r.attending === false ? null : false)}>
                  Non
                </button>
                <button className="text-slate-500 hover:text-red-400 text-sm px-2" onClick={() => remove(r)} aria-label={`Retirer ${r.name}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
