"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CoachProfile, CoachRole } from "@/lib/types";

const emptyForm = { email: "", full_name: "", role: "assistant" as CoachRole };

export default function CoachsPage() {
  const supabase = createClient();
  const [me, setMe] = useState<CoachProfile | null>(null);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profiles } = await supabase.from("coach_profiles").select("*").order("created_at");
    setCoaches(profiles ?? []);
    setMe((profiles ?? []).find((p) => p.id === user?.id) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSending(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: data.error || "Échec de l'invitation." });
      return;
    }
    setMessage({ kind: "ok", text: `Invitation envoyée à ${form.email}.` });
    setForm(emptyForm);
    load();
  }

  const isHeadCoach = me?.role === "head_coach";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <p className="text-slate-500 text-sm">
          Gère qui a accès à l'application. Chaque personne invitée reçoit un courriel pour créer son mot de passe.
        </p>
      </div>

      {isHeadCoach && (
        <form onSubmit={handleInvite} className="card grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Courriel</label>
            <input
              type="email"
              required
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Nom complet</label>
            <input
              required
              className="input"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Rôle</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as CoachRole })}
            >
              <option value="assistant">Entraîneur adjoint</option>
              <option value="head_coach">Entraîneur-chef</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="btn" disabled={sending}>
              {sending ? "Envoi..." : "Envoyer l'invitation"}
            </button>
            {message && (
              <p className={`text-sm mt-2 ${message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
                {message.text}
              </p>
            )}
          </div>
        </form>
      )}

      {!isHeadCoach && !loading && (
        <p className="text-sm text-slate-500">
          Seul un entraîneur-chef peut inviter de nouveaux utilisateurs. Demande à ton entraîneur-chef si tu as
          besoin d'ajouter quelqu'un.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">Nom</th>
              <th className="py-2 pr-4">Rôle</th>
              <th className="py-2 pr-4">Depuis</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{c.full_name}</td>
                <td className="py-2 pr-4">
                  <span className="badge bg-gold-100 text-ink-800">
                    {c.role === "head_coach" ? "Entraîneur-chef" : "Entraîneur adjoint"}
                  </span>
                </td>
                <td className="py-2 pr-4">{c.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
