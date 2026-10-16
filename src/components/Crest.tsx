// Logo officiel des As de Québec (le même que celui de la ligue, copié dans public/logos).
export default function Crest({ className = "h-9 w-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logos/as-de-quebec.png" alt="As de Québec" className={`${className} object-contain`} />
  );
}
