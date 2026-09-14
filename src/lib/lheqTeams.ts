// Les 20 équipes M17 AAA de la LHEQ (saison 2026-27), extraites de
// https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams
// Le nom des As de Québec est inclus pour référence mais n'a pas de fiche
// de pre-scout (c'est notre propre équipe).
export interface LheqTeam {
  slug: string;
  name: string;
  logo: string;
  lheqUrl: string;
  // ID de fiche TPE (portal.tpeteam.com/premium/team/<id>) — absent si l'équipe
  // n'est pas suivie par TPE au niveau M17.
  tpeTeamId?: number;
}

/**
 * Couleur dominante par équipe, pour les bandes du sommaire de match.
 * Les valeurs proviennent des écussons ; corrige-les si une équipe ne
 * correspond pas — le repli est un bleu ardoise neutre.
 */
export const TEAM_COLOR: Record<string, string> = {
  "as-de-quebec": "#fdca37",
  albatros: "#1e3a5f",
  "blizzard-ssf": "#b91c1c",
  "canam-ba": "#1e40af",
  piche: "#4a9ad4",
  "citadelles-rn": "#1d4ed8",
  "conquerants-bl": "#0f172a",
  "corsaires-pointe-levy": "#1e3a8a",
  "dynamiques-ccl": "#dc2626",
  "espoirs-sag-lsj": "#1e40af",
  "estacades-mauricie": "#ea580c",
  "gaulois-ric": "#166534",
  "grenadiers-lsl": "#78350f",
  "harfangs-sherbrooke": "#7f1d1d",
  "lions-lsl": "#0f172a",
  "pionniers-lan": "#1e293b",
  "rousseau-royal-lav-mtl": "#581c87",
  "seigneurs-mi": "#0f172a",
  "select-du-nord": "#b91c1c",
  "senateurs-out": "#7f1d1d",
};
export const DEFAULT_TEAM_COLOR = "#334155";

export function teamColor(slug: string | undefined): string {
  return (slug && TEAM_COLOR[slug]) || DEFAULT_TEAM_COLOR;
}

export const LHEQ_M17_AAA_TEAMS: LheqTeam[] = [
  { slug: "albatros", name: "Albatros", logo: "https://logos.hisports.app/1782178532011.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187723", tpeTeamId: 9149 },
  { slug: "as-de-quebec", name: "As de Québec", logo: "https://logos.hisports.app/1782179426138.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187730", tpeTeamId: 9147 },
  { slug: "blizzard-ssf", name: "Blizzard du SSF", logo: "https://logos.hisports.app/1782180142505.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187735", tpeTeamId: 9148 },
  { slug: "canam-ba", name: "CanAm Beauce-Appalaches", logo: "https://logos.hisports.app/1782180749164.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187740", tpeTeamId: 5557 },
  { slug: "citadelles-rn", name: "Citadelles R-N", logo: "https://logos.hisports.app/1782322964987.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187869", tpeTeamId: 9158 },
  { slug: "conquerants-bl", name: "Conquérants B.-L.", logo: "https://logos.hisports.app/1782312080227.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187829", tpeTeamId: 9157 },
  { slug: "corsaires-pointe-levy", name: "Corsaires de Pointe-Lévy", logo: "https://logos.hisports.app/1782181372575.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187745", tpeTeamId: 2695 },
  { slug: "dynamiques-ccl", name: "Dynamiques du CCL", logo: "https://logos.hisports.app/1782262815922.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187796", tpeTeamId: 9146 },
  { slug: "espoirs-sag-lsj", name: "Espoirs du Saguenay", logo: "https://logos.hisports.app/1782181949797.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187750", tpeTeamId: 9156 },
  { slug: "estacades-mauricie", name: "Estacades de la Mauricie", logo: "https://d1yykh3c16sa22.cloudfront.net/teams/1ece7518-736a-6908-9c9b-06c9f5717ba8/logos/1ece7518-7347-62c8-969b-06c9f5717ba8.jpg", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/180219", tpeTeamId: 9155 },
  { slug: "gaulois-ric", name: "Gaulois de Richelieu", logo: "https://logos.hisports.app/1782309442725.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187818", tpeTeamId: 9154 },
  { slug: "grenadiers-lsl", name: "Grenadiers LSL", logo: "https://logos.hisports.app/1782263070242.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187797", tpeTeamId: 9153 },
  { slug: "harfangs-sherbrooke", name: "Harfangs de Sherbrooke", logo: "https://logos.hisports.app/1782308040548.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187807", tpeTeamId: 8983 },
  { slug: "lions-lsl", name: "Lions LSL", logo: "https://logos.hisports.app/1782309811800.jpg", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187819", tpeTeamId: 9150 },
  { slug: "piche", name: "Piché", logo: "/logos/piche.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187771", tpeTeamId: 9159 },
  { slug: "pionniers-lan", name: "Pionniers LAN", logo: "https://logos.hisports.app/1782320320047.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187848", tpeTeamId: 9160 },
  { slug: "rousseau-royal-lav-mtl", name: "Rousseau Royal LAV/MTL", logo: "https://logos.hisports.app/1782322662335.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187868", tpeTeamId: 8111 },
  { slug: "seigneurs-mi", name: "Seigneurs M-I", logo: "https://logos.hisports.app/1782315807734.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187837", tpeTeamId: 9152 },
  { slug: "select-du-nord", name: "Sélect du Nord", logo: "https://logos.hisports.app/1782316580784.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187842", tpeTeamId: 9151 },
  { slug: "senateurs-out", name: "Sénateurs OUT", logo: "https://logos.hisports.app/1782321425932.png", lheqUrl: "https://masculin.lheq.ca/fr/ligue-de-hockey-d-excellence-du-quebec-masculin/teams/187857" },
];

// Adversaires potentiels pour le pre-scout — on exclut notre propre équipe.
export const OPPONENT_TEAMS = LHEQ_M17_AAA_TEAMS.filter((t) => t.slug !== "as-de-quebec");

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Le champ "opponent" des matchs est souvent un code court (ex: "COR", "SSF")
// plutôt que le nom complet — alias connus en dépannage de l'algorithme.
const OPPONENT_ALIASES: Record<string, string> = {
  cor: "corsaires-pointe-levy",
  ssf: "blizzard-ssf",
  can: "canam-ba",
  canam: "canam-ba",
  beauce: "canam-ba",
  // L'équipe s'appelait Canimex (et Cascades avant) — les matchs déjà
  // enregistrés portent encore ces noms, qui doivent continuer de pointer
  // vers la fiche du Piché.
  cascades: "piche",
  canimex: "piche",
  piche: "piche",
  tr: "estacades-mauricie",
  troisrivieres: "estacades-mauricie",
  alb: "albatros",
  cit: "citadelles-rn",
  rn: "citadelles-rn",
  conq: "conquerants-bl",
  bl: "conquerants-bl",
  dyn: "dynamiques-ccl",
  ccl: "dynamiques-ccl",
  est: "estacades-mauricie",
  esp: "espoirs-sag-lsj",
  sag: "espoirs-sag-lsj",
  gau: "gaulois-ric",
  ric: "gaulois-ric",
  gre: "grenadiers-lsl",
  lsl: "grenadiers-lsl",
  har: "harfangs-sherbrooke",
  lio: "lions-lsl",
  pio: "pionniers-lan",
  lan: "pionniers-lan",
  rou: "rousseau-royal-lav-mtl",
  sei: "seigneurs-mi",
  mi: "seigneurs-mi",
  sel: "select-du-nord",
  nord: "select-du-nord",
  sen: "senateurs-out",
  out: "senateurs-out",
};

// Le champ "opponent" des matchs est saisi manuellement et souvent abrégé
// (ex: "COR", "SSF") — on matche par alias connu, mot exact, préfixe ou
// sous-chaîne plutôt que par égalité stricte du nom complet.
export function findTeamByOpponent(opponent: string): LheqTeam | undefined {
  const opponentNorm = stripAccents(opponent).replace(/[^a-z0-9]/g, "");
  if (!opponentNorm) return undefined;

  const aliasSlug = OPPONENT_ALIASES[opponentNorm];
  if (aliasSlug) {
    const aliased = OPPONENT_TEAMS.find((t) => t.slug === aliasSlug);
    if (aliased) return aliased;
  }

  return OPPONENT_TEAMS.find((t) => {
    const words = [...stripAccents(t.name).split(/[\s/.-]+/), ...t.slug.split("-")].filter(Boolean);
    return words.some((w) => {
      if (w === opponentNorm) return true;
      if (w.length >= 3 && opponentNorm.length >= 3) return w.startsWith(opponentNorm) || opponentNorm.startsWith(w);
      return false;
    });
  });
}
