import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";
import { buildIcs } from "@/lib/ics";

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

  const service = createServiceClient();
  const { data: m } = await service.from("coach_meetings").select("*").eq("id", meetingId).single();
  if (!m) return NextResponse.json({ error: "Rencontre introuvable." }, { status: 404 });
  const { data: coach } = await service.from("coach_contacts").select("id, full_name, email").eq("id", m.coach_id).single();
  const to = coach?.email as string | undefined;
  if (!coach || !to) return NextResponse.json({ error: "Courriel de l'entraîneur introuvable." }, { status: 404 });

  const sequence = (m.invite_sequence as number) + (m.invite_sent_at ? 1 : 0);
  const start = (m.start_time as string).slice(0, 5);
  const end = m.end_time ? (m.end_time as string).slice(0, 5) : null;
  const dateLabel = format(parseISO(m.meeting_date as string), "EEEE d MMMM yyyy", { locale: fr });
  const first = (coach.full_name as string).trim().split(/\s+/)[0];
  const when = `${dateLabel}, ${start.replace(":", "h")}${end ? ` à ${end.replace(":", "h")}` : ""}`;

  const message = cancel
    ? `Salut ${first},\n\nLa rencontre prévue le ${when} est annulée. Je te recontacte pour trouver une autre date.`
    : `Salut ${first},\n\nJe t'invite à une rencontre individuelle :\n\n${when}${m.location ? `\nLieu : ${m.location}` : ""}${m.topic ? `\nSujet : ${m.topic}` : ""}\n\nL'invitation est jointe : accepte-la pour l'ajouter à ton agenda.`;
  const ics = buildIcs({
    uid: m.invite_uid as string,
    sequence,
    date: m.meeting_date as string,
    start,
    end,
    summary: `Rencontre individuelle — ${coach.full_name}`,
    description: (m.topic as string | null) ?? undefined,
    location: m.location as string | null,
    organizerEmail: coachEmail,
    organizerName: "Jean Grignon-Francke",
    attendeeEmail: to,
    attendeeName: coach.full_name as string,
    cancel,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `Jean Grignon-Francke <${coachEmail}>`,
    to: [to],
    replyTo: coachEmail,
    subject: `${cancel ? "Annulée : " : ""}Rencontre individuelle — ${when}`,
    html: buildEmailHtml(message),
    text: buildEmailText(message),
    attachments: [
      { filename: "signature.jpg", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID },
      { filename: "invitation.ics", content: Buffer.from(ics).toString("base64"), contentType: `text/calendar; charset=utf-8; method=${cancel ? "CANCEL" : "REQUEST"}` },
    ],
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });

  await service
    .from("coach_meetings")
    .update(cancel ? { cancelled_at: new Date().toISOString(), invite_sequence: sequence } : { invite_sent_at: new Date().toISOString(), invite_sequence: sequence, cancelled_at: null })
    .eq("id", meetingId);
  return NextResponse.json({ ok: true, to });
}
