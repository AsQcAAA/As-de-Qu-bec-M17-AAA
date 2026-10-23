// Invitation de calendrier (fichier .ics) : « METHOD:REQUEST » crée ou met à jour la rencontre dans
// l'agenda du destinataire (même UID, séquence croissante), « METHOD:CANCEL » l'annule.

const TZ = "America/Toronto";

/** « 2026-10-27 », « 13:00 » → « 20261027T130000 » (heure locale de Québec, sans conversion). */
const localStamp = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
const plus30 = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + 30;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Fuseau de Québec avec ses règles d'heure d'été : l'agenda affiche 13h00 là où on a dit 13h00. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];
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
  /** Autres participants (ex. personne en copie conforme). */
  extraAttendees?: { email: string; name: string }[];
  cancel?: boolean;
}

export function buildIcs(i: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//As de Quebec M17 AAA//Suivi de coach//FR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.cancel ? "CANCEL" : "REQUEST"}`,
    ...VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART;TZID=${TZ}:${localStamp(i.date, i.start)}`,
    `DTEND;TZID=${TZ}:${localStamp(i.date, i.end ?? plus30(i.start))}`,
    `SUMMARY:${esc(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${esc(i.description)}`] : []),
    ...(i.location ? [`LOCATION:${esc(i.location)}`] : []),
    `ORGANIZER;CN=${esc(i.organizerName)}:mailto:${i.organizerEmail}`,
    `ATTENDEE;CN=${esc(i.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${i.attendeeEmail}`,
    ...(i.extraAttendees ?? []).map((a) => `ATTENDEE;CN=${esc(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${i.cancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
