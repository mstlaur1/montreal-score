/**
 * Campaign promise seed data — Ensemble Montréal 2025 platform.
 *
 * Phase 1: First 100 days promises only (10 commitments).
 * Phase 2 (TODO): Add remaining ~140 promises from platform.
 */

export interface PromiseSeed {
  id: string;
  category: string;
  subcategory: string;
  borough: string | null;
  text_fr: string;
  text_en: string;
  measurable: boolean;
  target_value: string | null;
  target_timeline: string | null;
  auto_trackable: boolean;
  data_source: string | null;
  first_100_days: boolean;
}

export const PROMISE_SEEDS: PromiseSeed[] = [
  // ─── First 100 Days (10 commitments) ───────────────────────────────

  {
    id: "housing-01",
    category: "housing",
    subcategory: "affordable-housing",
    borough: null,
    text_fr: "Remplacer le « Règlement pour une métropole mixte » par des incitatifs financiers et établir un vrai partenariat avec les acteurs immobiliers, OBNL et privés, pour construire rapidement des logements abordables et sociaux.",
    text_en: "Replace the mixed-metropolis bylaw with financial incentives and establish real partnerships with developers, non-profits, and private-sector actors to quickly build affordable and social housing.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "housing-02",
    category: "housing",
    subcategory: "land-inventory",
    borough: null,
    text_fr: "Évaluer l'ensemble des terrains et bâtiments municipaux et instaurer un registre public des immeubles vacants ou abandonnés afin d'accélérer la construction de logements.",
    text_en: "Inventory all municipal lands and buildings and create a public registry of vacant or abandoned properties to accelerate housing construction.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "governance-01",
    category: "governance",
    subcategory: "coordination",
    borough: null,
    text_fr: "Créer la Table des maires afin de mettre en place les bases d'une qualité de services partout sur le territoire et de travailler en étroite collaboration.",
    text_en: "Create a Mayors' Council to establish service quality standards across the territory and foster close collaboration between boroughs.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "homelessness-01",
    category: "homelessness",
    subcategory: "intervention",
    borough: null,
    text_fr: "Mettre en place un Groupe d'intervention tactique sur itinérance (GITI) et rédiger un protocole pour les campements.",
    text_en: "Create a Tactical Homelessness Intervention Group (GITI) and draft a protocol for encampments.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "homelessness-02",
    category: "homelessness",
    subcategory: "funding",
    borough: null,
    text_fr: "Augmenter le budget d'itinérance et créer un Fonds d'appariement de 10 millions $ avec le privé pour lutter contre la crise de l'itinérance.",
    text_en: "Increase the homelessness budget and create a $10 million matching fund with the private sector to fight the homelessness crisis.",
    measurable: true,
    target_value: "10 M$",
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "mobility-01",
    category: "mobility",
    subcategory: "cycling",
    borough: null,
    text_fr: "Produire un inventaire des chantiers et lancer un état des lieux du réseau cyclable afin d'évaluer les enjeux de sécurité des usagers (cyclistes, personnes piétonnes, automobilistes).",
    text_en: "Produce a construction-site inventory and launch a cycling-network review to assess safety issues for all road users (cyclists, pedestrians, drivers).",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "security-01",
    category: "security",
    subcategory: "neighbourhood-watch",
    borough: null,
    text_fr: "Déployer des comités de vigie et augmenter des équipes multidisciplinaires pour rapidement sécuriser nos quartiers.",
    text_en: "Deploy neighbourhood watch committees and expand multidisciplinary teams to quickly secure our neighbourhoods.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "governance-02",
    category: "governance",
    subcategory: "optimization",
    borough: null,
    text_fr: "Lancer le processus d'optimisation de l'appareil municipal et lancer un appel à projets en intelligence artificielle.",
    text_en: "Launch a municipal optimization process and issue a call for AI projects.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "culture-01",
    category: "culture",
    subcategory: "cultural-bureau",
    borough: null,
    text_fr: "Relancer le bureau Montréal métropole culturelle.",
    text_en: "Relaunch the Bureau Montréal Cultural Metropolis.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
  {
    id: "international-01",
    category: "international",
    subcategory: "attractiveness",
    borough: null,
    text_fr: "Mobiliser les partenaires pour se doter d'un plan d'actions concertées et de cibles communes pour le rayonnement international de Montréal et son attractivité.",
    text_en: "Mobilize partners to develop a concerted action plan with shared targets for Montreal's international profile and attractiveness.",
    measurable: false,
    target_value: null,
    target_timeline: "100 jours",
    auto_trackable: false,
    data_source: null,
    first_100_days: true,
  },
];
