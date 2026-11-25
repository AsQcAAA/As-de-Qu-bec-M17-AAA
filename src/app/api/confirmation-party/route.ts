import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const EVENT_KEY = "noel-2026";

/**
 * Réponse publique au party de Noël des employés : un employé inscrit son nom
 * et sa confirmation (Oui / Non). Aucune liste n'est jamais renvoyée au
 * public ; si le même nom répond de nouveau, sa réponse est mise à jour.
 */
export async function POST(req: NextRequest) {
  let body: { name?: unknown; attending?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Indiquez votre nom." }, { status: 400 });
  if (typeof body.attending !== "boolean") return NextResponse.json({ error: "Choisissez Oui ou Non." }, { status: 400 });

  const db = createServiceClient();
  const { data: existing } = await db.from("party_rsvp").select("id").eq("event_key", EVENT_KEY).ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1);
  const { error } = existing && existing.length > 0
    ? await db.from("party_rsvp").update({ attending: body.attending, name }).eq("id", existing[0].id)
    : await db.from("party_rsvp").insert({ event_key: EVENT_KEY, name, attending: body.attending });
  if (error) return NextResponse.json({ error: "Enregistrement impossible. Réessayez." }, { status: 500 });
  return NextResponse.json({ ok: true, updated: !!existing?.length });
}
