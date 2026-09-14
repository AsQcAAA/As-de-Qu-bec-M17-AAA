export default function CanvaPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Canva</h1>
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">
          L'intégration API avec Canva n'est pas encore branchée. Pour l'instant, garde un lien direct vers ton
          projet Canva (ex: présentations d'équipe, cartes joueurs, visuels de match).
        </p>
        <p className="text-sm text-slate-500">
          Quand tu seras prêt à automatiser (créer/exporter des designs directement depuis l'app), il faudra
          autoriser le connecteur Canva dans tes réglages de connecteurs, puis on branchera de vraies actions ici
          (générer un visuel de rapport de match, exporter une carte joueur, etc.).
        </p>
        <a
          href="https://www.canva.com/"
          target="_blank"
          rel="noreferrer"
          className="btn inline-flex w-fit"
        >
          Ouvrir Canva →
        </a>
      </div>
    </div>
  );
}
