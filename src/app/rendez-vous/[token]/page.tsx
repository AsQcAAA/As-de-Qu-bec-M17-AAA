"use client";

import { use, useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface Slot { id: string; slot_date: string; start_time: string; duration_min: number; location: string | null }
interface Data { name: string; mine: Slot | null; available: Slot[] }

const hm = (t: string) => t.slice(0, 5).replace(":", "h");
const endOf = (s: Slot) => {
  const [h, m] = s.start_time.split(":").map(Number);
  const t = h * 60 + m + s.duration_min;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}h${String(t % 60).padStart(2, "0")}`;
};
const dayLabel = (d: string) => format(parseISO(d), "EEEE d MMMM", { locale: fr }).replace(/^./, (c) => c.toUpperCase());

export default function RendezVousPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rendez-vous/${token}`, { cache: "no-store" });
    if (!res.ok) return setInvalid(true);
    setData(await res.json());
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function book(id: string) {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/rendez-vous/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId: id }) });
    if (!res.ok) setMsg((await res.json()).error ?? "Erreur.");
    await load(); setBusy(false);
  }
  async function cancel() {
    setBusy(true); setMsg("");
    await fetch(`/api/rendez-vous/${token}`, { method: "DELETE" });
    await load(); setBusy(false);
  }

  const days = new Map<string, Slot[]>();
  for (const s of data?.available ?? []) days.set(s.slot_date, [...(days.get(s.slot_date) ?? []), s]);

  return (
    <div className="min-h-screen bg-ink-900 text-white px-4 py-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-[#fdca37]">As de Québec M17 AAA</h1>
        <p className="text-sm text-white/70 mb-6">Rencontre bulletin · 15 minutes</p>
        {invalid && <p className="rounded-lg bg-red-500/20 p-4">Ce lien n&apos;est pas valide. Veuillez contacter l&apos;entraîneur.</p>}
        {!invalid && !data && <p className="text-white/60">Chargement…</p>}
        {data && (
          <>
            <p className="mb-4">Rencontre bulletin de {data.name.split(" ")[0]}</p>
            {data.mine ? (
              <div className="rounded-xl bg-emerald-500/20 border border-emerald-400/40 p-4 mb-6">
                <p className="text-sm text-emerald-200">Rendez-vous confirmé</p>
                <p className="text-lg font-semibold">{dayLabel(data.mine.slot_date)}</p>
                <p className="text-lg">{hm(data.mine.start_time)} à {endOf(data.mine)}{data.mine.location ? ` · ${data.mine.location}` : ""}</p>
                <button onClick={cancel} disabled={busy} className="mt-3 text-sm underline text-white/80">Annuler ou changer ce rendez-vous</button>
              </div>
            ) : (
              <p className="mb-4 text-white/80">Choisissez la plage de 15 minutes qui vous convient.</p>
            )}
            {msg && <p className="rounded-lg bg-amber-500/20 p-3 mb-4 text-sm">{msg}</p>}
            {days.size === 0 && !data.mine && <p className="text-white/60">Aucun créneau disponible pour le moment.</p>}
            {data.mine && days.size > 0 && <p className="text-sm text-white/60 mb-2">Pour changer, choisissez un autre créneau :</p>}
            {[...days].map(([d, slots]) => (
              <div key={d} className="mb-5">
                <h2 className="font-semibold mb-2">{dayLabel(d)}</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button key={s.id} disabled={busy} onClick={() => book(s.id)} className="rounded-lg bg-white/10 hover:bg-[#fdca37] hover:text-black py-3 font-medium transition">
                      {hm(s.start_time)}
                    </button>
                  ))}
                </div>
                {slots[0].location && <p className="text-xs text-white/50 mt-1">{slots[0].location}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
