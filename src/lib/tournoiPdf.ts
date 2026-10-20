// Lecture du PDF du tournoi (même mise en page que le calendrier de l'organisation, avec
// les pointages et les équipes remplies). Réservé au serveur : pdfjs-dist n'a rien à
// faire dans le navigateur.
//
// Chaque match est repéré par son en-tête « #n-code ». Les pointages sont les nombres
// entiers qui se trouvent sous cet en-tête (cases du tableau : une ligne par équipe) ou
// sur la même ligne (première ronde : équipe, pointage, équipe, pointage).

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ParsedTournamentGame {
  no: number;
  /** Équipes lues dans le PDF (vide tant que la case affiche « Gagnant #n »). */
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
}

interface Item {
  str: string;
  x: number;
  y: number;
}

const isScore = (s: string) => /^\d{1,2}$/.test(s);
const isSlotText = (s: string) => !isScore(s) && !/^(CSSAD [AB]|HS-SSF|PTS)$/.test(s) && !/Nov\./.test(s) && !/^#\d+-\d+$/.test(s) && !/^(Demi-Finales|Finale)$/i.test(s);

export async function parseTournamentPdf(bytes: Uint8Array): Promise<ParsedTournamentGame[]> {
  const doc = await getDocument({ data: bytes }).promise;
  const out = new Map<number, ParsedTournamentGame>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      items.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] });
    }

    for (const h of items.filter((i) => /^#\d+-\d+$/.test(i.str))) {
      const no = Number(h.str.match(/^#(\d+)-/)![1]);
      let region: Item[];
      if (no <= 11 && h.x < 100) {
        // Première ronde : toute la rangée.
        region = items.filter((i) => Math.abs(i.y - h.y) <= 4 && i.x > h.x + 200).sort((a, b) => a.x - b.x);
      } else {
        // Case du tableau : sous l'en-tête, à la verticale de la date (≈ 195 pt à gauche de l'en-tête).
        const dx = h.x - 195;
        region = items
          .filter((i) => i.y < h.y - 12 && h.y - i.y < 75 && i.x >= dx - 10 && i.x < dx + 260)
          .sort((a, b) => b.y - a.y || a.x - b.x);
      }
      const texts = region.filter((i) => isSlotText(i.str)).map((i) => i.str);
      const nums = region.filter((i) => isScore(i.str)).map((i) => Number(i.str));
      const entry: ParsedTournamentGame = {
        no,
        teamA: texts[0] && !/^(Gagnant|Perdant) #/.test(texts[0]) ? texts[0] : null,
        teamB: texts[1] && !/^(Gagnant|Perdant) #/.test(texts[1]) ? texts[1] : null,
        scoreA: nums.length >= 2 ? nums[0] : null,
        scoreB: nums.length >= 2 ? nums[1] : null,
      };
      out.set(no, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.no - b.no);
}
