"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type { DgNote } from "@/lib/types";

const emptyForm = { title: "", content: "" };

// Page protégée par RLS (migration_014.sql) : seuls les entraîneurs au rôle
// "head_coach" peuvent lire/écrire la table dg_notes. Un entraîneur adjoint
// qui arriverait quand même sur cette URL ne verrait rien (requête vide) —
// la protection ne dépend pas de l'affichage du lien dans le menu.
export default function DirectionGeneralePage() {
  const supabase = createClient();
  const [notes, setNotes] = useState<DgNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("dg_notes").select("*").order("updated_at", { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(n: DgNote) {
    setEditingId(n.id);
    setForm({ title: n.title ?? "", content: n.content });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) return;
    setSaving(true);
    if (editingId) {
      await supabase
        .from("dg_notes")
        .update({ title: form.title || null, content: form.content, updated_at: new Date().toISOString() })
        .eq("id", editingId);
    } else {
      await supabase.from("dg_notes").insert({ title: form.title || null, content: form.content });
    }
    setSaving(false);
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    load();
  }

  async function removeNote(id: string) {
    await supabase.from("dg_notes").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Direction générale</h1>
          <p className="text-slate-400 text-sm">
            Notes privées — visibles seulement par toi (entraîneur-chef), jamais par les entraîneurs
            adjoints invités sur le reste de la plateforme.
          </p>
        </div>
        <button className="btn" onClick={() => (showForm ? setShowForm(false) : startNew())}>
          {showForm ? "Annuler" : "+ Nouvelle note"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-3">
          <div>
            <label className="label">Titre (optionnel)</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Note</label>
            <textarea
              required
              rows={6}
              className="input"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Enregistrer"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune note pour l'instant.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {n.title && <div className="font-semibold">{n.title}</div>}
                  <div className="text-xs text-slate-400">
                    Mis à jour le {format(parseISO(n.updated_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(n)} className="text-xs text-gold-700 hover:underline">
                    Modifier
                  </button>
                  <button onClick={() => removeNote(n.id)} className="text-xs text-red-600 hover:underline">
                    Supprimer
                  </button>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
