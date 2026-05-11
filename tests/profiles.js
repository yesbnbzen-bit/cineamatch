// ─────────────────────────────────────────────────────────────────
//  CINEMATCH — Profils de test automatisés
//  Chaque profil correspond à un scénario utilisateur réel
// ─────────────────────────────────────────────────────────────────

const PROFILES = [

  {
    id: 'romance-mature',
    name: '💕 Romance mature émouvante mais pas triste',
    answers: {
      context:  'couple',       // En couple
      mood:     '18,10749',     // Émouvant / Inspirant
      language: 'any',          // Peu importe
      duration: 'any',          // Peu importe
      exclude:  ['sad', 'slow', 'teen'], // Trop triste / Trop lent / Films d'ados
      era:      'any',          // Peu importe
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
      context:  'family',       // En famille
      mood:     '878,9648',     // SF / Mystère
      language: 'en',           // Américain
      duration: 'any',
      exclude:  ['complex', 'horror', 'adult'], // Trop complexe / Trop violent / Contenu adulte
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
      context:  'alone',        // Seul
      mood:     '27',           // Horreur
      language: 'any',
      duration: 'any',
      exclude:  ['horror'],     // Trop violent (gore)
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
      context:  'alone',        // Seul
      mood:     '53',           // Thriller / Suspense
      language: 'any',
      duration: 'any',
      exclude:  ['slow', 'complex'], // Trop lent / Trop complexe
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
      context:  'friends',      // Entre amis
      mood:     '35,10751',     // Rire / Comédie
      language: 'fr',           // Français
      duration: 'any',
      exclude:  ['sad', 'adult'], // Trop triste / Contenu adulte
      era:      'any',
    },
    references: [],             // Pas de références (skip)
    expectations: {
      shouldContain:    ['humour', 'comédie', 'rire', 'légèreté', 'fun'],
      shouldNotContain: ['violence', 'déprimant', 'tragique'],
      expectedGenres:   ['Comédie'],
      forbiddenGenres:  ['Horreur', 'Thriller'],
    },
  },

];

module.exports = { PROFILES };
