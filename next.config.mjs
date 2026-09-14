/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist (lecture du rapport TPE, src/lib/tpeReportParser.ts) charge son
  // propre worker par un require dynamique que le bundler ne doit pas essayer
  // de résoudre statiquement — on le garde en dépendance externe, chargée
  // telle quelle depuis node_modules à l'exécution.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
