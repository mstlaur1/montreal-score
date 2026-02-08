export const metadata = {
  title: "À propos — MontréalScore",
  description: "Comment fonctionne MontréalScore et d'où viennent les données.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">À propos de MontréalScore</h1>

      <section className="space-y-4 text-base leading-relaxed">
        <p>
          MontréalScore est un outil gratuit et open-source qui suit la
          performance du gouvernement municipal de Montréal, arrondissement par
          arrondissement, en utilisant les données ouvertes de la Ville.
        </p>

        <h2 className="text-xl font-bold mt-8 mb-3">Pourquoi?</h2>
        <p>
          La mairesse Soraya Martinez Ferrada a promis un délai maximum de 90
          jours pour les permis de construction. L&apos;administration précédente
          avait fixé une cible de 120 jours. Actuellement, le délai médian est
          de plus de 200 jours dans certains arrondissements. Aucun tableau de
          bord public ne permet de vérifier si ces cibles sont atteintes.
        </p>
        <p>
          MontréalScore comble cette lacune. Pas d&apos;opinions. Pas de parti pris.
          Seulement les chiffres.
        </p>

        <h2 className="text-xl font-bold mt-8 mb-3">Sources de données</h2>
        <p>
          Toutes les données proviennent du{" "}
          <a
            href="https://donnees.montreal.ca"
            className="text-accent underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            portail de données ouvertes de Montréal
          </a>
          . Les ensembles de données utilisés incluent:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>
            <strong>Permis de construction</strong> — mis à jour chaque semaine,
            données depuis 1990
          </li>
          <li>
            <strong>Requêtes 311</strong> — mis à jour quotidiennement, données
            depuis 2014
          </li>
          <li>
            <strong>Déneigement</strong> — données saisonnières
          </li>
          <li>
            <strong>Travaux routiers</strong> — mis à jour régulièrement
          </li>
          <li>
            <strong>Contrats municipaux</strong> — tous les contrats de plus de
            2 000$
          </li>
        </ul>

        <h2 className="text-xl font-bold mt-8 mb-3">Méthodologie de notation</h2>
        <p>
          Chaque arrondissement reçoit une note de A à F basée sur un score
          composite de 0 à 100. Pour les permis, le score considère:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>
            Le délai médian de traitement vs la cible de 90 jours (40%)
          </li>
          <li>
            Le pourcentage de permis traités dans les délais (40%)
          </li>
          <li>La tendance par rapport à l&apos;année précédente (20%)</li>
        </ul>
        <p className="mt-2">
          Les notes sont relatives (arrondissement vs arrondissement) et
          absolues (arrondissement vs ses propres cibles).
        </p>

        <h2 className="text-xl font-bold mt-8 mb-3">Open source</h2>
        <p>
          Le code source est disponible sur{" "}
          <a
            href="https://github.com/mstlaur1/montreal-score"
            className="text-accent underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          . Les contributions sont les bienvenues.
        </p>

        <h2 className="text-xl font-bold mt-8 mb-3">Contact</h2>
        <p>
          MontréalScore est un projet de{" "}
          <a href="https://brule.ai" className="text-accent underline">
            Brulé AI
          </a>
          .
        </p>
      </section>
    </div>
  );
}
