// Invitation de calendrier (fichier .ics) : « METHOD:REQUEST » crée ou met à jour la rencontre dans
// l'agenda du destinataire (même UID, séquence croissante), « METHOD:CANCEL » l'annule.

const TZ = "America/Toronto";

/** Heure locale de Québec → instant UTC (gère l'heure d'été). */
function zonedToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asLocal - guess));
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export interface IcsInput {
  uid: string;
  sequence: number;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string | null; // HH:mm
  summary: string;
  description?: string;
  location?: string | null;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName: string;
  cancel?: boolean;
}

export function buildIcs(i: IcsInput): string {
  const start = zonedToUtc(i.date, i.start);
  const end = i.end ? zonedToUtc(i.date, i.end) : new Date(start.getTime() + 30 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//As de Quebec M17 AAA//Suivi de coach//FR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.cancel ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${esc(i.description)}`] : []),
    ...(i.location ? [`LOCATION:${esc(i.location)}`] : []),
    `ORGANIZER;CN=${esc(i.organizerName)}:mailto:${i.organizerEmail}`,
    `ATTENDEE;CN=${esc(i.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${i.attendeeEmail}`,
    `STATUS:${i.cancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
