// ─────────────────────────────────────────────────────────────────
//  CINEMATCH — Profils de test automatisés
//  Chaque profil correspond à un scénario utilisateur réel
//  Aucun 'any' — chaque profil sélectionne une réponse précise
//  Références : 1 ou 2 films maximum par profil
// ─────────────────────────────────────────────────────────────────

const PROFILES = [

  {
    id: 'romance-mature',
    name: '💕 Romance mature émouvante mais pas triste',
    answers: {
      context:  'couple',
      mood:     '18,10749',
      language: 'en',          // Américain — La La Land, Her
      duration: 'long',        // Romances matures souvent >2h
      exclude:  ['sad', 'slow', 'teen'],
      era:      'modern',      // Moderne 2000-2020
    },
    references: ['La La Land', 'Her'],
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
      duration: 'short',       // Film court (<1h45) pour les enfants
      exclude:  ['complex', 'horror', 'adult'],
      era:      'new',         // Récent (2020+)
    },
    references: ['WALL-E', 'Big Hero 6'],
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
      language: 'en',          // Références anglophones
      duration: 'long',        // Hereditary, The Others > 1h45
      exclude:  ['horror'],
      era:      'modern',      // Moderne 2000-2020
    },
    references: ['Hereditary', 'The Others'],
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
      language: 'en',          // Gone Girl, Knives Out — anglophones
      duration: 'long',        // Thrillers souvent longs (>2h)
      exclude:  ['slow', 'complex'],
      era:      'modern',      // Moderne 2000-2020
    },
    references: ['Gone Girl', 'Knives Out'],
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
      duration: 'short',       // Soirée entre amis → film court
      exclude:  ['sad', 'adult'],
      era:      'modern',      // Moderne 2000-2020
    },
    references: [],
    expectations: {
      shouldContain:    ['humour', 'comédie', 'rire', 'légèreté', 'fun'],
      shouldNotContain: ['violence', 'déprimant', 'tragique'],
      expectedGenres:   ['Comédie'],
      forbiddenGenres:  ['Horreur', 'Thriller'],
    },
  },

  {
    id: 'romance-sans-adn',
    name: '💑 Romance sans références — fallback couple',
    answers: {
      context:  'couple',
      mood:     '18,10749',
      language: 'en',          // Américain, couple mainstream
      duration: 'short',       // Soirée détente → film pas trop long
      exclude:  ['sad', 'teen'],
      era:      'modern',      // Moderne 2000-2020
    },
    references: [],   // ← AUCUNE référence : teste le fallback romance chaleureuse
    expectations: {
      shouldContain:    ['romance', 'romantique', 'amour', 'couple', 'feel-good'],
      shouldNotContain: ['biopic', 'réussite', 'lutte', 'pauvreté', 'tragédie'],
      expectedGenres:   ['Romance', 'Comédie'],
      forbiddenGenres:  ['Horreur', 'Guerre'],
    },
  },

  {
    id: 'biopic-inspirant',
    name: '🏆 Biopic inspirant dépassement humain',
    answers: {
      context:  'alone',
      mood:     '18,10749',
      language: 'en',          // Whiplash, Bohemian Rhapsody — anglophones
      duration: 'long',        // Biopics généralement >2h
      exclude:  ['slow'],
      era:      'modern',      // Moderne 2000-2020 (Whiplash 2014, Bohemian 2018)
    },
    references: ['Whiplash', 'Bohemian Rhapsody'],
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
      language: 'ko',          // 🌏 Asiatique — coréen/japonais/chinois
      duration: 'long',        // Thrillers coréens souvent >2h
      exclude:  ['slow'],
      era:      'modern',      // Parasite (2019), Oldboy (2003) → Moderne
    },
    references: ['Parasite', 'Oldboy'],
    expectations: {
      shouldContain:    ['tension', 'suspense', 'social', 'intense', 'coréen'],
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
      mood:     '28,12',
      language: 'ko',          // 🌏 Asiatique — couvre japonais (Ghibli, Your Name)
      duration: 'short',       // Soirée entre amis → pas trop long
      exclude:  ['sad', 'complex'],
      era:      'modern',      // Spirited Away (2001), Your Name (2016) → Moderne
    },
    references: ['Spirited Away', 'Your Name'],
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
      duration: 'long',        // Action épique → films longs
      exclude:  ['slow', 'complex'],
      era:      'new',         // Récent (2020+)
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
