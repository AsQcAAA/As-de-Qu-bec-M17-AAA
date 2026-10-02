import { EMAIL_SIGNATURE_CID, EMAIL_SIGNATURE_HEIGHT, EMAIL_SIGNATURE_WIDTH } from "@/lib/emailSignature";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Texte saisi → paragraphes HTML (les sauts de ligne sont conservés). */
export function textToHtml(text: string): string {
  return escapeHtml(text.trim())
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Courriel complet : message, bloc HTML optionnel (ex. le calendrier du mois),
 * puis la signature de Jean — toujours, sans exception.
 */
export function buildEmailHtml(messageText: string, extraHtml?: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">
${textToHtml(messageText)}
${extraHtml ? `<div style="margin:18px 0;">${extraHtml}</div>` : ""}
<div style="margin-top:22px;">
<img src="cid:${EMAIL_SIGNATURE_CID}" width="${EMAIL_SIGNATURE_WIDTH}" height="${EMAIL_SIGNATURE_HEIGHT}" alt="Jean Grignon-Francke — Directeur Général, Entraîneur-Chef M17 AAA — 418-262-5251" style="display:block;border:0;max-width:100%;height:auto;">
</div>
</div>`;
}

export function buildEmailText(messageText: string): string {
  return `${messageText.trim()}\n\n--\nJean Grignon-Francke\nDirecteur Général — Entraîneur-Chef M17 AAA\n418-262-5251\nCentre Sportif Marc-Simoneau, 3500 Rue Cambronne, Québec, QC G1E 7H2`;
}
