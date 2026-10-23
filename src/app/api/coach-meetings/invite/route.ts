import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendCoachMeetingInvite } from "@/lib/coachInvite";

/**
 * Envoie (ou met à jour, ou annule) l'invitation d'une rencontre individuelle avec un entraîneur :
 * courriel de Jean + fichier d'invitation de calendrier (.ics) que Outlook, Gmail et Apple Calendrier
 * ajoutent à l'agenda. Réservé à l'entraîneur-chef.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const { data: profile } = await supabase.from("coach_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "head_coach") return NextResponse.json({ error: "Réservé à l'entraîneur-chef." }, { status: 403 });
  const coachEmail = process.env.COACH_EMAIL;
  if (!process.env.RESEND_API_KEY || !coachEmail) return NextResponse.json({ error: "RESEND_API_KEY ou COACH_EMAIL manquant côté serveur." }, { status: 500 });

  const { meetingId, action } = (await req.json()) as { meetingId?: string; action?: "invite" | "cancel" };
  if (!meetingId) return NextResponse.json({ error: "Rencontre manquante." }, { status: 400 });
  const cancel = action === "cancel";

  const result = await sendCoachMeetingInvite(meetingId, cancel);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, to: result.to });
}
