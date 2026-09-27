/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist (lecture du rapport TPE, src/lib/tpeReportParser.ts) charge son
  // propre worker par un require dynamique que le bundler ne doit pas essayer
  // de résoudre statiquement — on le garde en dépendance externe, chargée
  // telle quelle depuis node_modules à l'exécution.
  serverExternalPackages: ["pdfjs-dist"],
  // La trace de fichiers de Vercel ne suit pas ce require dynamique : sans
  // cette ligne, pdf.worker.mjs (le vrai moteur de lecture en Node) n'est
  // jamais copié dans la fonction déployée, et la lecture du rapport TPE
  // échoue en ligne tout en fonctionnant en local (fichier présent partout
  // en développement, absent du paquet minimal déployé).
  outputFileTracingIncludes: {
    "/api/advanced-stats/extract": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
