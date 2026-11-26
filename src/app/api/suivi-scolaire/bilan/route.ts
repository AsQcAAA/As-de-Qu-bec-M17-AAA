import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";
import { bilanHtml, bilanPlain, bilanText, type BilanRow } from "@/lib/schoolTracking";

/**
 * « Envoyer le bilan » (Direction générale › Suivi scolaire) : l'entraîneur de
 * l'équipe reçoit le nombre de périodes étoilées de chacun de ses joueurs,
 * à jour. Réservé à l'entraîneur-chef ; tout est recalculé ici à partir de la base.
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

  const { team: code } = (await req.json()) as { team?: string };
  const service = createServiceClient();
  const { data: team } = await service.from("school_teams").select("*").eq("code", code ?? "").maybeSingle();
  if (!team) return NextResponse.json({ error: "Équipe introuvable." }, { status: 404 });
  // M17 : l'entraîneur, c'est Jean lui-même.
  const recipients: string[] = (team.coach_emails as string[]).length > 0 ? team.coach_emails : team.code === "M17AAA" ? [coachEmail] : [];
  if (recipients.length === 0) return NextResponse.json({ error: `Aucun courriel d'entraîneur pour ${team.name}.` }, { status: 400 });

  const [{ data: roster }, { data: periods }, { data: results }] = await Promise.all([
    service.from("school_roster").select("id, jersey, full_name").eq("team_code", team.code),
    service.from("school_star_periods").select("roster_id, period_date, status").eq("status", "convoquee"),
    service.from("school_term_results").select("roster_id, average, grades").eq("term", 1),
  ]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const rows: BilanRow[] = (roster ?? [])
    .map((r) => {
      const mine = (periods ?? []).filter((p) => p.roster_id === r.id).map((p) => p.period_date as string).sort();
      const past = mine.filter((d) => d <= today);
      const upcoming = mine.filter((d) => d > today);
      const res = (results ?? []).find((x) => x.roster_id === r.id);
      const grades = (res?.grades ?? []) as { s: string; v: number }[];
      return {
        jersey: r.jersey,
        name: r.full_name,
        past: past.length,
        upcoming: upcoming.length,
        average: (res?.average as number | null) ?? null,
        weak: grades.filter((g) => g.v < 70).sort((a, b) => a.v - b.v),
      };
    })
    .sort((a, b) => b.past - a.past || b.upcoming - a.upcoming || a.name.localeCompare(b.name));

  const first = (team.coach_name ?? "").split(" ")[0] || "coach";
  const text = bilanText(team.name, first, rows);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `Jean Grignon-Francke <${coachEmail}>`,
    to: recipients,
    cc: team.code === "M17AAA" ? undefined : [coachEmail],
    replyTo: coachEmail,
    subject: `Bilan des périodes étoilées — ${team.name}`,
    html: buildEmailHtml(text, bilanHtml(rows)),
    text: buildEmailText(`${text}\n\n${bilanPlain(rows)}`),
    attachments: [{ filename: "signature.png", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID }],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await service.from("school_teams").update({ last_bilan_sent_at: new Date().toISOString() }).eq("code", team.code);
  return NextResponse.json({ ok: true, sentTo: recipients });
}
