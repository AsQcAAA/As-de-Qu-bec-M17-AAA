/**
 * Imprime la page dans une orientation donnée.
 *
 * La règle `@page` est globale à un document : le calendrier mensuel a besoin
 * du paysage, la feuille d'alignement du portrait. Plutôt que d'imposer une
 * orientation à tout le site, on insère la règle juste avant l'impression —
 * une règle ajoutée plus tard l'emporte sur celle de la feuille de styles —
 * puis on la retire.
 *
 * La règle est retirée sur l'évènement `afterprint`, pas immédiatement après
 * `window.print()` : selon le navigateur, l'aperçu se construit de façon
 * asynchrone et retirer la règle trop tôt la rendait sans effet — c'est ce qui
 * laissait réapparaître les en-têtes du navigateur.
 *
 * Une marge de « 0 » supprime en plus les en-têtes et pieds de page ajoutés par
 * Chrome (date, titre, URL, pagination). Attention : ça ne fonctionne que si le
 * réglage « Marges » de la boîte d'impression est sur « Aucune » — s'il est sur
 * « Par défaut », Chrome impose ses propres marges et réaffiche ses en-têtes.
 */
export function printWithOrientation(orientation: "portrait" | "landscape", margin = "10mm") {
  const style = document.createElement("style");
  style.textContent = `@page { size: ${orientation}; margin: ${margin}; }`;
  document.head.appendChild(style);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener("afterprint", cleanup);
    style.remove();
  };
  window.addEventListener("afterprint", cleanup);
  // Repli : certains navigateurs n'émettent jamais `afterprint`.
  window.setTimeout(cleanup, 60_000);

  window.print();
}
