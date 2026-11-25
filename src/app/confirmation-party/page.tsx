"use client";

import { useState } from "react";

/** Page publique : les employés confirment leur présence au party de Noël. */
export default function ConfirmationPartyPage() {
  const [name, setName] = useState("");
  const [attending, setAttending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ attending: boolean; updated: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Indiquez votre nom.");
    if (attending === null) return setError("Choisissez Oui ou Non.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/confirmation-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, attending }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Enregistrement impossible.");
      setDone({ attending, updated: !!json.updated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const choice = (value: boolean) =>
    `flex-1 py-4 rounded-xl text-lg font-extrabold border-2 transition ${
      attending === value
        ? value
          ? "bg-[#fdca37] border-[#fdca37] text-black"
          : "bg-white border-white text-black"
        : "border-neutral-600 text-neutral-200 hover:border-neutral-400"
    }`;

  return (
    <main className="min-h-screen bg-[#0d0c0c] text-white px-4 py-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/confirmation-party-visuel.webp"
          alt="Party de Noël des employés — Party de cabane à sucre, jeudi 17 décembre 18 h, La Bûche, Vieux-Québec, As & Chevaliers"
          className="w-full rounded-2xl shadow-2xl"
        />

        {done ? (
          <div className="rounded-2xl border-2 border-[#fdca37] p-6 text-center space-y-2">
            <div className="text-4xl">{done.attending ? "🎉" : "👋"}</div>
            <h1 className="text-2xl font-extrabold">{done.attending ? "On vous attend !" : "Merci de nous avoir avisés"}</h1>
            <p className="text-neutral-300">
              {done.attending
                ? "Jeudi 17 décembre, 18 h, à La Bûche (Vieux-Québec)."
                : "Votre absence est notée. Vous pouvez revenir changer votre réponse au besoin."}
            </p>
            {done.updated && <p className="text-sm text-neutral-400">Votre réponse précédente a été mise à jour.</p>}
            <button className="mt-2 text-sm underline text-neutral-400" onClick={() => { setDone(null); setAttending(null); }}>
              Modifier ma réponse
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h1 className="text-2xl font-extrabold">Serez-vous des nôtres ?</h1>
              <p className="text-neutral-400 text-sm">Jeudi 17 décembre, 18 h — La Bûche, Vieux-Québec</p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#fdca37] mb-1.5">Votre nom</label>
              <input
                className="w-full rounded-xl bg-neutral-900 border-2 border-neutral-700 focus:border-[#fdca37] outline-none px-4 py-3 text-lg"
                placeholder="Prénom et nom"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#fdca37] mb-1.5">Votre présence</label>
              <div className="flex gap-3">
                <button type="button" className={choice(true)} onClick={() => setAttending(true)}>
                  Oui, j&apos;y serai
                </button>
                <button type="button" className={choice(false)} onClick={() => setAttending(false)}>
                  Non
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              className="w-full py-4 rounded-xl bg-[#fdca37] text-black text-lg font-extrabold disabled:opacity-50"
              disabled={busy}
            >
              {busy ? "Envoi…" : "Confirmer"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
