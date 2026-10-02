"use client";

import { useState } from "react";
import EmailComposer from "@/components/EmailComposer";
import RecipientPicker from "@/components/RecipientPicker";
import { useCoachDirectory } from "@/lib/useCoach";
import { usePlayerContacts } from "@/lib/usePlayerContacts";

export default function CourrielPage() {
  const { isHeadCoach, loading: coachLoading } = useCoachDirectory();
  const { players, contacts, loading } = usePlayerContacts();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (coachLoading || loading) return <p className="text-slate-500">Chargement...</p>;
  if (!isHeadCoach) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Envoyer un courriel</h1>
        <p className="text-sm text-slate-400">Seul l&apos;entraîneur-chef peut envoyer des courriels depuis l&apos;application.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Envoyer un courriel</h1>
        <p className="text-slate-400 text-sm">
          Un courriel individuel est envoyé à la famille de chaque joueur choisi (remplaçants compris) — une famille ne
          voit jamais les adresses des autres.
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">1. Destinataires</h2>
        <RecipientPicker players={players} contacts={contacts} selected={selected} onChange={setSelected} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">2. Message</h2>
        <EmailComposer playerIds={[...selected]} />
      </section>
    </div>
  );
}
