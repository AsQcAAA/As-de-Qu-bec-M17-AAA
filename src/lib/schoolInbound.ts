import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";
import { extractFrenchDate } from "@/lib/schoolAbsenceEmail";
import {
  extractCancelledName,
  extractConvokedWithSec,
  extractTimes,
  isStarCancellationEmail,
  matchRoster,
  type RosterEntry,
} from "@/lib/schoolTracking";

type Service = ReturnType<typeof createServiceClient>;

/**
 * Courriel de l'école (convocation ou annulation de période étoilée) :
 * 1. consigné dans le suivi scolaire des 5 équipes ;
 * 2. transféré automatiquement à l'entraîneur de chaque équipe concernée
 *    (seulement les joueurs de son équipe, et seulement la première fois —
 *    une copie du même courriel ne repart pas).
 * Ne lève jamais d'erreur : le suivi ne doit pas bloquer l'enregistrement
 * des absences M17 fait juste avant.
 */
export async function processSchoolStarEmail(opts: {
  subject: string;
  body: string;
  from: string | null;
  receivedAt: string | null;
  emailId: string;
}): Promise<{ recorded: string[]; cancelled: string[]; forwardedTo: string[]; unknown: string[] }> {
  const out = { recorded: [] as string[], cancelled: [] as string[], forwardedTo: [] as string[], unknown: [] as string[] };
  try {
    const service = createServiceClient();
    const cancellation = isStarCancellationEmail(opts.subject);
    const date = extractFrenchDate(opts.subject) ?? extractFrenchDate(opts.body);
    if (!date) return out;
    if (!/étoilée|etoilee/i.test(opts.body) && !cancellation) return out;
    const { start, end } = extractTimes(opts.body);

    const { data: roster } = await service.from("school_roster").select("id, team_code, full_name, sec");
    const people = cancellation
      ? [extractCancelledName(opts.body)].filter((n): n is string => !!n).map((name) => ({ name, sec: null }))
      : extractConvokedWithSec(opts.body);

    const fresh: RosterEntry[] = [];
    for (const person of people) {
      const r = matchRoster(person.name, person.sec, (roster ?? []) as RosterEntry[]);
      if (!r) {
        out.unknown.push(person.name);
        continue;
      }
      if (cancellation) {
        const changed = await cancelPeriod(service, r.id, date, start);
        if (changed) {
          out.cancelled.push(r.full_name);
          fresh.push(r);
        }
      } else {
        const { data: existing } = await service
          .from("school_star_periods")
          .select("id")
          .eq("roster_id", r.id)
          .eq("period_date", date)
          .eq("start_time", start ?? "")
          .maybeSingle();
        const { data: existingNull } = start
          ? { data: null }
          : await service.from("school_star_periods").select("id").eq("roster_id", r.id).eq("period_date", date).is("start_time", null).maybeSingle();
        if (existing || existingNull) continue;
        const { error } = await service.from("school_star_periods").insert({
          roster_id: r.id,
          period_date: date,
          start_time: start,
          end_time: end,
          status: "convoquee",
          source: "courriel",
          source_ref: opts.emailId,
        });
        if (!error) {
          out.recorded.push(r.full_name);
          fresh.push(r);
        }
      }
    }
    if (fresh.length > 0) out.forwardedTo = await forwardToCoaches(service, fresh, opts, cancellation, date);
  } catch (e) {
    console.error("[suivi-scolaire] Traitement du courriel échoué.", e);
  }
  return out;
}

async function cancelPeriod(service: Service, rosterId: string, date: string, start: string | null): Promise<boolean> {
  let q = service.from("school_star_periods").select("id, status").eq("roster_id", rosterId).eq("period_date", date);
  if (start) q = q.eq("start_time", start);
  const { data } = await q;
  const target = (data ?? []).find((p) => p.status === "convoquee");
  if (!target) return false;
  await service.from("school_star_periods").update({ status: "annulee" }).eq("id", target.id);
  return true;
}

async function forwardToCoaches(
  service: Service,
  players: RosterEntry[],
  opts: { subject: string; body: string; from: string | null; receivedAt: string | null; emailId: string },
  cancellation: boolean,
  date: string
): Promise<string[]> {
  const coachEmail = process.env.COACH_EMAIL;
  if (!process.env.RESEND_API_KEY || !coachEmail) return [];
  const { data: teams } = await service.from("school_teams").select("code, name, coach_emails, forward_enabled");
  // Un courriel par destinataire, avec seulement les joueurs de ses équipes.
  const byRecipient = new Map<string, { teams: Set<string>; names: string[] }>();
  for (const p of players) {
    const team = (teams ?? []).find((t) => t.code === p.team_code);
    if (!team?.forward_enabled) continue;
    for (const email of (team.coach_emails ?? []) as string[]) {
      const key = email.toLowerCase();
      const entry = byRecipient.get(key) ?? { teams: new Set<string>(), names: [] };
      entry.teams.add(team.name);
      entry.names.push(p.full_name);
      byRecipient.set(key, entry);
    }
  }
  if (byRecipient.size === 0) return [];

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent: string[] = [];
  for (const [to, info] of byRecipient) {
    const what = cancellation ? "Annulation de période étoilée" : "Période étoilée";
    const intro = `Bonjour,

${what} (${[...info.teams].join(", ")}) : ${info.names.join(", ")}.

Transfert automatique du courriel reçu de l'école :

---------- Message transféré ----------
${opts.from ? `De : ${opts.from}\n` : ""}Objet : ${opts.subject}

${opts.body.trim()}`;
    const { error } = await resend.emails.send({
      from: `Jean Grignon-Francke <${coachEmail}>`,
      to,
      replyTo: coachEmail,
      subject: `Tr : ${opts.subject}`,
      html: buildEmailHtml(intro),
      text: buildEmailText(intro),
      attachments: [{ filename: "signature.png", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID }],
    });
    if (error) {
      console.error("[suivi-scolaire] Transfert échoué.", to, error);
      continue;
    }
    sent.push(to);
  }
  if (sent.length > 0) {
    const ids = players.map((p) => p.id);
    await service
      .from("school_star_periods")
      .update({ forwarded_at: new Date().toISOString() })
      .in("roster_id", ids)
      .eq("period_date", date);
  }
  return sent;
}
