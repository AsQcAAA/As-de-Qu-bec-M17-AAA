import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const SEVERITY_LABEL: Record<string, string> = {
  legere: "Légère",
  moderee: "Modérée",
  grave: "Grave",
};

// Called by the client right after inserting a new injury row, so the
// coach gets an email on top of the in-app banner. Requires a signed-in
// session (same as every other write in the app) — this is not a public
// endpoint like /api/reminders.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { injuryId } = await req.json();
  if (!injuryId) {
    return NextResponse.json({ error: "injuryId requis." }, { status: 400 });
  }

  const { data: injury } = await supabase.from("injuries").select("*, players(full_name, jersey_number)").eq("id", injuryId).single();
  if (!injury) {
    return NextResponse.json({ error: "Blessure introuvable." }, { status: 404 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.COACH_EMAIL) {
    return NextResponse.json({ ok: true, emailSent: false, reason: "RESEND_API_KEY ou COACH_EMAIL manquant" });
  }

  const player = (injury as any).players;
  const playerLabel = player ? `${player.full_name}${player.jersey_number ? ` (#${player.jersey_number})` : ""}` : "Joueur inconnu";

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.REMINDER_FROM_EMAIL || "alertes@resend.dev",
    to: process.env.COACH_EMAIL,
    subject: `🩹 Nouvelle blessure — ${playerLabel}`,
    html: `
      <p>Une nouvelle blessure vient d'être ajoutée :</p>
      <ul>
        <li><strong>Joueur :</strong> ${playerLabel}</li>
        <li><strong>Date :</strong> ${injury.injury_date}</li>
        <li><strong>Gravité :</strong> ${injury.severity ? SEVERITY_LABEL[injury.severity] : "Non précisée"}</li>
        <li><strong>Description :</strong> ${injury.description}</li>
      </ul>
      <p>— App As de Québec M17 AAA</p>
    `,
  });

  return NextResponse.json({ ok: true, emailSent: true });
}
