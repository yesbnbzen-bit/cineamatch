// ─────────────────────────────────────────────────────────────────
//  CINEMATCH — Profils de test automatisés
//  Chaque profil correspond à un scénario utilisateur réel
// ─────────────────────────────────────────────────────────────────

const PROFILES = [

  // ── ANCIENS PROFILS (validés) ──────────────────────────────────

  {
    id: 'romance-mature',
    name: '💕 Romance mature émouvante mais pas triste',
    answers: {
      context:  'couple',
      mood:     '18,10749',
      language: 'any',
      duration: 'any',
      exclude:  ['sad', 'slow', 'teen'],
      era:      'any',
    },
    references: ['About Time', 'La La Land', 'Her'],
    expectations: {
      shouldContain:    ['romance', 'romantique', 'couple', 'amour', 'feel-good'],
      shouldNotContain: ['tragique', 'maladie', 'mort', 'deuil', 'ado', 'lycée'],
      expectedGenres:   ['Romance', 'Comédie', 'Drame'],
      forbiddenGenres:  ['Horreur', 'Thriller'],
    },
  },

  {
    id: 'sf-familiale',
    name: '🚀 SF familiale feel-good',
    answers: {
      context:  'family',
      mood:     '878,9648',
      language: 'en',
      duration: 'any',
      exclude:  ['complex', 'horror', 'adult'],
      era:      'any',
    },
    references: ['WALL-E', 'Ready Player One', 'Big Hero 6'],
    expectations: {
      shouldContain:    ['famille', 'aventure', 'accessible', 'fun', 'enfant'],
      shouldNotContain: ['violence', 'gore', 'adulte', 'sombre', 'dark'],
      expectedGenres:   ['Science-Fiction', 'Aventure', 'Animation', 'Famille'],
      forbiddenGenres:  ['Horreur', 'Thriller'],
    },
  },

  {
    id: 'horreur-psychologique',
    name: '😱 Horreur psychologique sans gore',
    answers: {
      context:  'alone',
      mood:     '27',
      language: 'any',
      duration: 'any',
      exclude:  ['horror'],
      era:      'any',
    },
    references: ['Hereditary', 'Midsommar', 'The Others'],
    expectations: {
      shouldContain:    ['atmosphère', 'psychologique', 'tension', 'angoisse'],
      shouldNotContain: ['gore', 'sang', 'slasher', 'torture'],
      expectedGenres:   ['Horreur', 'Thriller', 'Mystère'],
      forbiddenGenres:  ['Comédie', 'Animation'],
    },
  },

  {
    id: 'thriller-intelligent',
    name: '🕵️ Thriller intelligent mais pas lent',
    answers: {
      context:  'alone',
      mood:     '53',
      language: 'any',
      duration: 'any',
      exclude:  ['slow', 'complex'],
      era:      'any',
    },
    references: ['Gone Girl', 'Knives Out', 'Prisoners'],
    expectations: {
      shouldContain:    ['suspense', 'tension', 'enquête', 'retournement', 'rythme'],
      shouldNotContain: ['contemplatif', 'lent', 'incompréhensible'],
      expectedGenres:   ['Thriller', 'Mystère', 'Crime'],
      forbiddenGenres:  ['Comédie', 'Romance', 'Animation'],
    },
  },

  {
    id: 'comedie-francaise',
    name: '🇫🇷 Comédie française entre amis',
    answers: {
      context:  'friends',
      mood:     '35,10751',
      language: 'fr',
      duration: 'any',
      exclude:  ['sad', 'adult'],
      era:      'any',
    },
    references: [],
    expectations: {
      shouldContain:    ['humour', 'comédie', 'rire', 'légèreté', 'fun'],
      shouldNotContain: ['violence', 'déprimant', 'tragique'],
      expectedGenres:   ['Comédie'],
      forbiddenGenres:  ['Horreur', 'Thriller'],
    },
  },

  // ── NOUVEAUX PROFILS ───────────────────────────────────────────

  {
    id: 'romance-sans-adn',
    name: '💑 Romance sans références — fallback couple',
    answers: {
      context:  'couple',
      mood:     '18,10749',
      language: 'any',
      duration: 'any',
      exclude:  ['sad', 'teen'],
      era:      'any',
    },
    references: [],   // ← AUCUNE référence : teste le fallback romance chaleureuse
    expectations: {
      shouldContain:    ['romance', 'romantique', 'amour', 'couple', 'feel-good'],
      shouldNotContain: ['biopic', 'réussite', 'lutte', 'pauvreté', 'tragédie'],
      expectedGenres:   ['Romance', 'Comédie'],
      // Thriller toléré si romance est aussi présent (ex: Sueurs froides/Vertigo = romance + suspense)
      forbiddenGenres:  ['Horreur', 'Guerre'],
    },
  },

  {
    id: 'biopic-inspirant',
    name: '🏆 Biopic inspirant dépassement humain',
    answers: {
      context:  'alone',
      mood:     '18,10749',
      language: 'any',
      duration: 'any',
      exclude:  ['slow'],          // Pas d'exclusion "sad" → POLARITÉ B attendue
      era:      'any',
    },
    references: ['Whiplash', 'Rocky', 'Bohemian Rhapsody'],
    expectations: {
      shouldContain:    ['dépassement', 'ambition', 'lutte', 'inspirant', 'réussite'],
      shouldNotContain: ['romance sentimentale', 'comédie romantique'],
      expectedGenres:   ['Drame', 'Biographie', 'Musique'],
      forbiddenGenres:  ['Horreur', 'Animation'],
    },
  },

  {
    id: 'thriller-coreeen',
    name: '🇰🇷 Thriller coréen style Parasite',
    answers: {
      context:  'alone',
      mood:     '53',
      language: 'any',
      duration: 'any',
      exclude:  ['slow'],
      era:      'any',
    },
    references: ['Parasite', 'Oldboy', 'Train to Busan'],
    expectations: {
      shouldContain:    ['coréen', 'tension', 'suspense', 'social', 'intense'],
      shouldNotContain: ['feel-good', 'légèreté', 'comédie'],
      expectedGenres:   ['Thriller', 'Drame', 'Horreur'],
      forbiddenGenres:  ['Animation', 'Comédie'],
    },
  },

  {
    id: 'anime-feel-good',
    name: '🎌 Animé feel-good entre amis',
    answers: {
      context:  'friends',
      mood:     '28,12',           // Action / Aventure
      language: 'any',
      duration: 'any',
      exclude:  ['sad', 'complex'],
      era:      'any',
    },
    references: ['Spirited Away', 'Your Name', 'Princess Mononoke'],
    expectations: {
      shouldContain:    ['animation', 'aventure', 'poétique', 'japonais', 'magie'],
      shouldNotContain: ['gore', 'violence extrême', 'adulte'],
      expectedGenres:   ['Animation', 'Aventure', 'Fantastique'],
      forbiddenGenres:  ['Horreur'],
    },
  },

  {
    id: 'action-recente',
    name: '⚡ Action récente 2020+ solo',
    answers: {
      context:  'alone',
      mood:     '28,12',
      language: 'en',
      duration: 'any',
      exclude:  ['slow', 'complex'],
      era:      'new',             // Récent (2020+)
    },
    references: ['John Wick', 'Mission: Impossible'],
    expectations: {
      shouldContain:    ['action', 'adrénaline', 'rythme', 'spectaculaire'],
      shouldNotContain: ['lent', 'contemplatif', 'années 90', 'années 80'],
      expectedGenres:   ['Action', 'Aventure', 'Thriller'],
      forbiddenGenres:  ['Animation', 'Comédie'],
    },
  },

];

module.exports = { PROFILES };
