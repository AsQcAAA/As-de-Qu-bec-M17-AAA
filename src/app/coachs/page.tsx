"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import type { CoachProfile, CoachRole } from "@/lib/types";

const emptyForm = { email: "", full_name: "", role: "assistant" as CoachRole };

// Un mot de passe temporaire facile à dicter au téléphone ou par texto —
// lisible, sans caractères ambigus (0/O, 1/l), assez long pour rester sûr.
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function CoachsPage() {
  const supabase = createClient();
  const [me, setMe] = useState<CoachProfile | null>(null);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<CoachProfile | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSetOk, setPasswordSetOk] = useState(false);

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

  async function handleResend(coachId: string) {
    setResendingId(coachId);
    setMessage(null);
    const res = await fetch("/api/invite/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId }),
    });
    setResendingId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: data.error || "Échec de l'envoi." });
      return;
    }
    setMessage({
      kind: "ok",
      text:
        data.mode === "invite"
          ? "Invitation renvoyée."
          : "Cette personne avait déjà un mot de passe — un lien de réinitialisation lui a été envoyé à la place.",
    });
  }

  function openPasswordModal(coach: CoachProfile) {
    setPasswordTarget(coach);
    setTempPassword(generateTempPassword());
    setPasswordSetOk(false);
  }

  async function handleSetPassword() {
    if (!passwordTarget) return;
    setSettingPassword(true);
    const res = await fetch("/api/invite/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId: passwordTarget.id, password: tempPassword }),
    });
    setSettingPassword(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: data.error || "Échec de l'enregistrement." });
      return;
    }
    setPasswordSetOk(true);
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
              {isHeadCoach && <th className="py-2 pr-4"></th>}
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
                {isHeadCoach && (
                  <td className="py-2 pr-4">
                    {c.id !== me?.id && (
                      <span className="flex items-center gap-3">
                        <button
                          onClick={() => handleResend(c.id)}
                          disabled={resendingId === c.id}
                          className="text-xs text-ink-800 hover:underline"
                        >
                          {resendingId === c.id ? "Envoi..." : "Renvoyer l'invitation"}
                        </button>
                        <button onClick={() => openPasswordModal(c)} className="text-xs text-ink-800 hover:underline">
                          Définir un mot de passe
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Contournement du courriel d'invitation : utile quand un fournisseur
          (compte pro Outlook/Google Workspace) scanne automatiquement les
          liens reçus, ce qui grille le lien à usage unique avant que la
          personne ne clique. Le mot de passe se transmet à la main, jamais
          par courriel — pour la même raison. */}
      {passwordTarget && (
        <Modal
          onClose={() => {
            setPasswordTarget(null);
            setPasswordSetOk(false);
          }}
        >
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Définir un mot de passe — {passwordTarget.full_name}</h2>
              <p className="text-sm text-slate-400">
                À utiliser si le courriel d&apos;invitation ne fonctionne pas (souvent un lien grillé par un scan de
                sécurité automatique). Transmets ce mot de passe toi-même — texto, appel, en personne — jamais par
                courriel.
              </p>
            </div>

            {passwordSetOk ? (
              <p className="text-sm text-green-400">
                ✓ Mot de passe enregistré. Donne-le à {passwordTarget.full_name} pour qu&apos;il/elle se connecte.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="label">Mot de passe temporaire</label>
                <div className="flex gap-2">
                  <input
                    className="input font-mono"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                  />
                  <button type="button" className="btn-secondary shrink-0" onClick={() => setTempPassword(generateTempPassword())}>
                    ↻ Régénérer
                  </button>
                </div>
                <p className="text-xs text-slate-500">Au moins 8 caractères. Généré au hasard, modifiable si tu préfères.</p>
              </div>
            )}

            <div className="flex gap-2">
              {!passwordSetOk && (
                <button type="button" className="btn" disabled={settingPassword} onClick={handleSetPassword}>
                  {settingPassword ? "Enregistrement..." : "Définir ce mot de passe"}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPasswordTarget(null);
                  setPasswordSetOk(false);
                }}
              >
                {passwordSetOk ? "Fermer" : "Annuler"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
