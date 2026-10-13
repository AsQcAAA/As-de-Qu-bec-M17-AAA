"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import EmailComposer from "@/components/EmailComposer";
import RecipientPicker from "@/components/RecipientPicker";
import RecruitmentEmailComposer from "@/components/RecruitmentEmailComposer";
import { useCoachDirectory } from "@/lib/useCoach";
import { usePlayerContacts } from "@/lib/usePlayerContacts";

type Mode = "write" | "calendar" | "recruit";

const OPTIONS: { mode: Mode; icon: string; title: string; text: string }[] = [
  { mode: "write", icon: "✉️", title: "Écrire un courriel", text: "Un message personnalisé aux familles des joueurs choisis." },
  { mode: "calendar", icon: "📅", title: "Envoyer le calendrier mensuel", text: "Le calendrier du mois, joint au courriel, aux familles choisies." },
  { mode: "recruit", icon: "📄", title: "Envoyer une fiche de recrutement", text: "Les fiches en PDF de joueurs de ton choix, à un recruteur." },
];

export default function CourrielPage() {
  const { isHeadCoach, loading: coachLoading } = useCoachDirectory();
  const { players, contacts, loading } = usePlayerContacts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode | null>(null);

  if (coachLoading || loading) return <p className="text-slate-500">Chargement...</p>;
  if (!isHeadCoach) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Envoyer un courriel</h1>
        <p className="text-sm text-slate-400">Seul l&apos;entraîneur-chef peut envoyer des courriels depuis l&apos;application.</p>
      </div>
    );
  }

  if (mode === null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Envoyer un courriel</h1>
          <p className="text-slate-400 text-sm">Que veux-tu envoyer ?</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              onClick={() => setMode(o.mode)}
              className="text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-gold-400/50 transition-colors p-6 space-y-2"
            >
              <div className="text-3xl">{o.icon}</div>
              <div className="text-lg font-black text-white">{o.title}</div>
              <div className="text-sm text-slate-400">{o.text}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const option = OPTIONS.find((o) => o.mode === mode)!;
  const month = new Date();

  return (
    <div className="space-y-6">
      <div>
        <button className="text-sm text-gold-400 hover:underline mb-1" onClick={() => setMode(null)}>
          ← Changer d&apos;option
        </button>
        <h1 className="text-2xl font-bold">
          {option.icon} {option.title}
        </h1>
        {mode !== "recruit" && (
          <p className="text-slate-400 text-sm">
            Un courriel individuel est envoyé à la famille de chaque joueur choisi (remplaçants compris) — une famille ne
            voit jamais les adresses des autres.
          </p>
        )}
      </div>

      {mode === "recruit" ? (
        <RecruitmentEmailComposer players={players} />
      ) : (
        <>
          <section className="card space-y-3">
            <h2 className="font-semibold">1. Destinataires</h2>
            <RecipientPicker players={players} contacts={contacts} selected={selected} onChange={setSelected} />
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">2. Message</h2>
            {mode === "calendar" ? (
              <EmailComposer
                playerIds={[...selected]}
                defaultSubject={`Calendrier de ${format(month, "MMMM yyyy", { locale: fr })} — As de Québec M17 AAA`}
                defaultMessage={"Bonjour,\n\nVoici le calendrier du mois pour {joueur}.\n\n"}
                calendarDefault
                calendarMonth={month}
              />
            ) : (
              <EmailComposer playerIds={[...selected]} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
