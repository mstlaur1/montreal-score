-- Promise status updates — February 2026
-- Sources: La Presse, Le Devoir, Journal Métro, Newswire

-- 1. governance-01: Table des maires — COMPLETED (Nov 18, 2025)
UPDATE promises SET status = 'completed', updated_at = datetime('now') WHERE id = 'governance-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('governance-01', '2025-11-18',
  'https://www.lapresse.ca/actualites/grand-montreal/2025-11-18/ville-de-montreal/la-mairesse-martinez-ferrada-devoile-son-comite-executif.php',
  'La mairesse Martinez Ferrada dévoile son comité exécutif',
  'La Table des maires a été créée dès la formation du comité exécutif le 18 novembre 2025. Nancy Blanchet et Jean-François Lalonde en sont coprésidents, assurant une coordination transpartisane entre arrondissements.',
  'The Table des maires was created upon formation of the executive committee on November 18, 2025. Nancy Blanchet and Jean-François Lalonde were named co-chairs, ensuring cross-party coordination between boroughs.',
  'positive');

-- 2. housing-01: RMM replacement — IN PROGRESS (Jan 23, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'housing-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('housing-01', '2026-01-23',
  'https://www.lapresse.ca/actualites/grand-montreal/2026-01-23/crise-du-logement/montreal-met-la-hache-dans-le-reglement-pour-une-metropole-mixte.php',
  'Montréal met la hache dans le Règlement pour une métropole mixte',
  'La mairesse a annoncé le remplacement du RMM en deux phases : Phase 1 simplifie l''exigence à une norme de 20% hors marché; Phase 2 confie à un comité d''experts l''élaboration d''incitatifs financiers. Plus de 30M$ en soutien financier annoncés.',
  'The mayor announced the replacement of the RMM in two phases: Phase 1 simplifies the requirement to a 20% off-market housing norm; Phase 2 tasks an expert committee with designing financial incentives. Over $30M in financial support announced.',
  'positive');

-- 3. housing-02: Property inventory — IN PROGRESS (Jan 23, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'housing-02';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('housing-02', '2026-01-23',
  'https://www.newswire.ca/fr/news-releases/10-actions-en-100-jours-la-mairesse-de-montreal-soraya-martinez-ferrada-presente-une-nouvelle-approche-pour-sortir-de-la-crise-du-logement-872607617.html',
  '10 actions en 100 jours — nouvelle approche pour sortir de la crise du logement',
  'La Ville a identifié 80 propriétés municipales disponibles pour des projets de logements, dont environ 40 sites prêts pour la construction. Une cartographie complète sera lancée d''ici le 1er mars 2026. Le registre public des propriétés vacantes n''a pas encore été annoncé.',
  'The City identified 80 available municipal properties for housing projects, with approximately 40 sites ready for construction. A complete mapping will launch by March 1, 2026. The public registry of vacant properties has not yet been announced.',
  'mixed');

-- 4. homelessness-01: GITI — IN PROGRESS (Jan 12, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'homelessness-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('homelessness-01', '2026-01-12',
  'https://www.lapresse.ca/actualites/grand-montreal/2026-01-12/budget-de-montreal-2026/une-pluie-de-millions-pour-contrer-l-itinerance.php',
  'Une pluie de millions pour contrer l''itinérance',
  'Le GITI a été officiellement créé, prenant la relève d''une cellule de crise. Il coordonne les interventions terrain avec le gouvernement du Québec et les organismes de première ligne. Un protocole de gestion humanitaire des campements est en cours d''élaboration.',
  'The GITI has been officially created, taking over from a crisis cell. It coordinates field operations with the Quebec government and frontline organizations. A humanitarian encampment protocol is being developed.',
  'positive');

-- 5. homelessness-02: Budget increase — IN PROGRESS (Jan 12, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'homelessness-02';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('homelessness-02', '2026-01-12',
  'https://www.lapresse.ca/actualites/grand-montreal/2026-01-12/budget-de-montreal-2026/une-pluie-de-millions-pour-contrer-l-itinerance.php',
  'Une pluie de millions pour contrer l''itinérance',
  'Le budget itinérance a triplé, passant de 9,8M$ à 29,9M$. La Ville prévoit 100M$ d''ici 2035 pour des bâtiments d''hébergement d''urgence. Toutefois, le fonds de contrepartie de 10M$ avec le secteur privé n''apparaît pas dans le budget 2026.',
  'The homelessness budget tripled from $9.8M to $29.9M. The City plans $100M by 2035 for emergency shelter buildings. However, the $10M matching fund with the private sector does not appear in the 2026 budget.',
  'mixed');

-- 6. mobility-01: Cycling audit — IN PROGRESS (Jan 16, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'mobility-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('mobility-01', '2026-01-16',
  'https://www.lapresse.ca/actualites/grand-montreal/2026-01-16/audit-sur-les-pistes-cyclables-a-montreal/la-nouvelle-administration-maintient-le-flou.php',
  'Audit sur les pistes cyclables — la nouvelle administration maintient le flou',
  'L''audit du réseau cyclable reste flou. Alan DeSousa a déclaré « Audit si nécessaire, mais pas nécessairement un audit ». La mairesse avait affirmé qu''un audit existait, mais le DG a confirmé qu''aucun audit de sécurité complet n''a été réalisé. Aucun inventaire des chantiers n''a été annoncé.',
  'The cycling network audit remains vague. Alan DeSousa stated "Audit if necessary, but not necessarily an audit." The mayor claimed a previous audit existed, but the city DG confirmed no comprehensive safety audit had been conducted. No construction-site inventory has been announced.',
  'negative');

-- 7. security-01: Vigilance committees — IN PROGRESS (Jan 12, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'security-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('security-01', '2026-01-12',
  'https://www.ledevoir.com/politique/montreal/947382/securite-coeur-premier-budget-ensemble-montreal',
  'La sécurité au cœur du premier budget d''Ensemble Montréal',
  'Les comités de vigie réunissant le SPVM, organismes communautaires et résidents sont prévus au budget 2026. Le budget policier atteint 860,3M$ (+4,4%). La prévention de la violence chez les jeunes reçoit 15,8M$.',
  'Neighbourhood vigilance committees bringing together SPVM, community organizations, and residents are included in the 2026 budget. The police budget reaches $860.3M (+4.4%). Youth violence prevention receives $15.8M.',
  'positive');

-- 8. governance-02: AI/optimization — IN PROGRESS (Jan 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'governance-02';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('governance-02', '2026-01-12',
  'https://journalmetro.com/actualites/montreal/3207350/deja-de-lia-pour-ameliorer-lefficience-de-la-ville-de-montreal/',
  'Déjà de l''IA pour améliorer l''efficience de la Ville de Montréal',
  'En novembre 2025, la Ville a demandé aux arrondissements de soumettre des projets d''IA; 135 propositions reçues, dont la moitié réalisables en première phase. 15 solutions d''IA sont déjà en développement, dont le traitement automatisé des actes notariés (96% de succès).',
  'In November 2025, the City asked boroughs to submit AI projects; 135 proposals received, with half viable for Phase 1. Fifteen AI solutions are already in development, including automated notarial act processing (96% success rate).',
  'positive');

-- 9. culture-01: Bureau culturelle — IN PROGRESS (Jan 12, 2026)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'culture-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('culture-01', '2026-01-12',
  'https://www.lapresse.ca/actualites/grand-montreal/2026-01-12/budget-de-montreal-2026/la-ville-bonifie-le-budget-du-conseil-des-arts.php',
  'La Ville bonifie le budget du Conseil des arts',
  'Le budget du Conseil des arts a été bonifié de 2,5M$, atteignant 24,4M$ en 2026 avec un objectif de 30M$ d''ici 2028. Le Bureau Montréal métropole culturelle n''a pas encore été formellement relancé. La mission en Corée du Sud (mars 2026) est un premier geste.',
  'The Arts Council budget was increased by $2.5M, reaching $24.4M in 2026 with a target of $30M by 2028. The Bureau Montréal métropole culturelle has not been formally relaunched. The South Korea mission (March 2026) is a first step.',
  'mixed');

-- 10. international-01: Attractiveness plan — IN PROGRESS (Nov 18, 2025)
UPDATE promises SET status = 'in_progress', updated_at = datetime('now') WHERE id = 'international-01';
INSERT INTO promise_updates (promise_id, date, source_url, source_title, summary_fr, summary_en, sentiment)
VALUES ('international-01', '2025-11-18',
  'https://www.lapresse.ca/actualites/grand-montreal/2025-11-18/ville-de-montreal/la-mairesse-martinez-ferrada-devoile-son-comite-executif.php',
  'La mairesse Martinez Ferrada dévoile son comité exécutif',
  'Stéphanie Valenzuela a été nommée responsable du rayonnement international. Le budget 2026 prévoit 1 milliard sur 10 ans pour revitaliser le centre-ville. La mission en Corée du Sud (mars 2026) est la première mission internationale. Aucun plan d''action formel n''a été publié.',
  'Stéphanie Valenzuela was named responsible for international visibility. The 2026 budget plans $1B over 10 years for downtown revitalization. The South Korea mission (March 2026) is the first international mission. No formal action plan has been published.',
  'mixed');
