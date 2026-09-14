# As de Québec M17 AAA — App d'entraîneur

Application web pour gérer l'équipe : semaine actuelle avec vue du jour (alignement, horaire,
meetings individuels, pratique), résultats, calendrier, rapport quotidien cumulé, réunions
individuelles/collectives (avec rappels), cumulatif des combinaisons de trios/paires les plus
efficaces, et export d'une image du jour à caster sur un téléviseur.

## 1. Installer Node.js (si pas déjà fait)

Télécharge la version LTS sur https://nodejs.org (ou `brew install node` sur Mac).

## 2. Créer le projet Supabase (base de données + authentification)

1. Va sur https://supabase.com, crée un compte et un nouveau projet.
2. Dans **Project Settings > API**, note :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (garde-le secret, jamais dans le frontend)
3. Dans **SQL Editor**, colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) et exécute-le.
   Ça crée toutes les tables (entraîneurs, joueurs, horaire, alignements, matchs, réunions, rapports
   quotidiens, gabarit de pratique) avec des politiques RLS qui exigent d'être connecté.
3bis. (Optionnel) Colle ensuite le contenu de [`supabase/seed_calendar.sql`](supabase/seed_calendar.sql)
   et exécute-le — ça pré-remplit l'horaire et les matchs de la saison 2026-2027 à partir du Google
   Sheets de planification. **Vérifie d'abord le récapitulatif envoyé en chat** (matchs à l'écriture
   ambiguë comme « M17 AAA : 15h30 Saguenay » n'ont pas été ajoutés automatiquement aux Résultats —
   ajoute-les toi-même si besoin). Les noms d'adversaires viennent des abréviations du Sheets (SSF,
   COR, TR, SAG, etc.) — renomme-les dans l'onglet Résultats si tu veux les noms complets.
4. Dans **Authentication > Providers**, assure-toi que « Email » est activé (c'est le cas par défaut).
5. Dans **Authentication > Email Templates**, l'app utilise le modèle « Invite user » — tu peux le
   personnaliser plus tard si tu veux.

### Créer le tout premier compte (entraîneur-chef)

L'app n'a pas d'inscription publique (les données concernent des mineurs). Le tout premier compte
doit être créé manuellement :

1. Dans Supabase, va dans **Authentication > Users > Add user** → crée ton compte avec ton courriel
   et un mot de passe temporaire.
2. Dans **SQL Editor**, exécute (remplace l'UUID par celui du user créé, visible dans la liste des
   utilisateurs) :
   ```sql
   insert into coach_profiles (id, full_name, role)
   values ('COLLE-L-UUID-ICI', 'Ton nom', 'head_coach');
   ```
3. Connecte-toi avec ce compte sur l'app. Une fois connecté, va dans l'onglet **Utilisateurs** pour
   inviter les autres entraîneurs par courriel — ils recevront un lien Supabase pour choisir leur
   propre mot de passe.

## 3. Configurer les variables d'environnement

```bash
cp .env.local.example .env.local
```

Remplis `.env.local` avec :
- Les 3 valeurs Supabase de l'étape 2.
- `CRON_SECRET` : une chaîne aléatoire longue (ex: générée avec `openssl rand -hex 32`) — protège
  l'appel automatique hebdomadaire des rappels.
- Pour les rappels par courriel (facultatif au départ) : crée un compte sur https://resend.com,
  génère une clé API → `RESEND_API_KEY`, et configure `COACH_EMAIL` (déjà pré-rempli avec ton
  courriel) et `REMINDER_FROM_EMAIL`.

## 4. Installer et lancer en local

```bash
cd as-quebec-m17
npm install
npm run dev
```

Ouvre http://localhost:3000 — tu devrais voir l'écran de connexion (courriel + mot de passe), puis
la semaine actuelle.

## 5. Déployer en ligne (Vercel)

1. Pousse ce dossier dans un dépôt GitHub.
2. Va sur https://vercel.com, connecte le dépôt, et déploie.
3. Dans **Project Settings > Environment Variables** sur Vercel, ajoute toutes les variables de
   `.env.local` (mêmes noms).
4. Dans Supabase, **Authentication > URL Configuration**, ajoute l'URL de ton site Vercel aux
   « Redirect URLs » (ex: `https://ton-app.vercel.app/definir-mot-de-passe`) sinon les liens
   d'invitation par courriel ne fonctionneront pas en production.
5. Le fichier [`vercel.json`](vercel.json) configure déjà une tâche automatique (Vercel Cron) qui
   appelle `/api/reminders` chaque lundi à 9h (heure de l'Est) pour vérifier les joueurs sans
   rencontre individuelle depuis 3 semaines et t'envoyer un courriel. Vercel ajoute automatiquement
   l'en-tête `Authorization: Bearer $CRON_SECRET` à cet appel — assure-toi que `CRON_SECRET` est
   bien défini dans les variables d'environnement Vercel.

## Fonctionnalités

- **Accueil** : la semaine actuelle en bandeau, la journée du jour affichée en plus gros et en
  surbrillance. Cliquer sur une journée ouvre sa page détail.
- **Page détail du jour** (`/jour/[date]`) :
  - **Horaire du jour** (jours normaux) : heure précise + menu déroulant du type d'activité
    (Pratique, Team Meeting, Meeting individuel, Team Building, PP Meeting, Training, Autre).
  - **Match du jour** (remplace l'horaire quand un match est créé pour cette date) : formulaire
    post-match pour entrer le résultat, le score et des notes — sauvegardé directement dans
    l'onglet Résultats.
  - **Alignement** : résumé de l'alignement du jour + lien vers le constructeur rapide.
  - **Meeting individuel** : grille des numéros de chandail, taper un numéro logue/retire une
    rencontre individuelle pour cette journée.
  - **Pratique du jour** : gabarit à 7 cases (exercice, durée, détails) pour détailler la séance.
  - **Vue TV** (`/jour/[date]/tv`) : affichage plein écran noir/or à ouvrir sur un navigateur de
    téléviseur, avec un bouton pour exporter la page en image PNG.
- **Alignement rapide** (`/jour/[date]/alignement`) : reproduit la structure des feuilles
  d'alignement du club (deux groupes de couleur « Gris »/« Jaune », lignes de joueurs). Glisse un
  chandail (ou tape-le puis tape la case cible — fonctionne aussi au toucher) pour l'assigner.
  Bouton « Répliquer le dernier alignement » pour copier la dernière composition utilisée.
- **Résultats** : historique des matchs avec fiche W-L, lien externe vers le site de la ligue/stats,
  et un bouton direct vers les statistiques officielles LHEQ
  (https://masculin.lheq.ca/fr/schedule-stats-standings).
- **Calendrier** : vue mensuelle de l'horaire (pratiques, matchs, réunions, autres).
- **Rapport quotidien cumulé** : formulaire à remplir chaque jour (dont « des absents aujourd'hui ? »,
  qui alimente le compteur d'absences de chaque joueur), historique complet conservé.
- **Joueurs** : fiche par joueur — photo, taille, poids, position ; historique des rencontres
  individuelles ; jours d'absence ; statistiques traditionnelles (lien de recherche LHEQ) ;
  statistiques avancées TPE (xG/60, TOI/60, % mises en jeu ou % controlled exits selon la position,
  tirs au but — **saisie manuelle**, aucune des deux plateformes n'offre d'API publique pour du
  temps réel sans identifiants, donc j'ai fait un lien direct + des champs à copier-coller
  périodiquement plutôt que de risquer un scraping fragile) ; game log des 5 derniers matchs
  (buts/passes/points/TOI/tirs, saisis après chaque match) ; top 3 des meilleures affinités,
  calculé automatiquement à partir des unités de jeu et de leurs buts pour (onglet Combos) ; et une
  section Tests physiques (nom du test, valeur, unité, date) pour saisir les résultats au fur et à
  mesure de la saison.
- **Tests physiques** : classement de toute l'équipe pour un test choisi, basé sur le résultat le
  plus récent de chaque joueur (respecte le sens plus-haut/plus-bas = mieux défini à la saisie).
- **Alignements** (vue détaillée) : gestion de l'effectif + construction complète des
  trios/paires/unités spéciales par date, avec tous les types d'unité (utile en dehors du flux
  rapide du jour).
- **Combos** : saisie des buts pour/contre par unité après chaque match → tableau cumulatif de
  saison des combinaisons les plus efficaces (basé sur le +/-).
- **Réunions** : logue les rencontres individuelles et collectives, cumulatif par joueur, alerte
  après 21 jours sans rencontre individuelle (bannière dans l'app + courriel hebdomadaire).
- **Médical** : suivi des blessures (joueur, date, gravité, description). Ajouter une blessure
  déclenche une bannière d'alerte sur l'Accueil et un courriel automatique au coach.
- **Remplaçants** : effectif des joueurs rappelés ponctuellement, marqués d'un badge « R » dans les
  vues d'alignement. Le nombre de matchs joués par chaque remplaçant est compté automatiquement à
  partir des alignements de match.
- **Statistiques avancées** : lien vers TPE (portal.tpeteam.com), sous-onglet Rapports (à venir) et
  sous-onglet Pre-Scout — les 20 équipes M17 AAA de la LHEQ (logos + noms), chacune avec une fiche
  éditable (record, 5 derniers matchs — saisie manuelle en attendant le début de saison, aucune API
  publique LHEQ), notes de scout, lien vers son Cahier d'équipe LHEQ et vers TPE.
- **Modulation de l'effort** : carte sur l'Accueil qui recommande le type de pratique, le niveau de
  contact et le focus gym du jour, calculée à partir du calendrier (veille/lendemain de match,
  back-to-back, charge de la semaine) — pensée pour des athlètes de 15-16 ans.
- **Utilisateurs** : l'entraîneur-chef invite les autres entraîneurs par courriel (compte
  individuel Supabase Auth, pas de mot de passe partagé).
- **Canva** : lien externe simple pour l'instant. Le connecteur Canva n'était pas autorisé au
  moment de la création — une fois autorisé (réglages de connecteurs claude.ai), on pourra brancher
  de vraies actions directement dans cet onglet.

## Notes de sécurité

- L'app est protégée par Supabase Auth : chaque entraîneur a son propre compte, créé uniquement par
  invitation de l'entraîneur-chef. Il n'y a aucune inscription publique.
- Toutes les tables de données d'équipe utilisent des politiques RLS qui exigent
  `auth.role() = 'authenticated'` — un utilisateur non connecté ne peut rien lire ni écrire.
- Les joueurs sont mineurs : ne partage jamais les identifiants Supabase (`service_role key`) et
  n'ajoute pas d'inscription publique à l'app.
