// ─────────────────────────────────────────────────────────────────
//  CINEMATCH IA — Store v2
//  Clés :
//    - TMDb  : clé publique read-only (nécessaire côté client pour les affiches)
//    - OpenAI: gérée côté serveur via env var Netlify (OPENAI_API_KEY)
//              Le client envoie un header vide → le proxy injecte la vraie clé.
//              En dev local, on peut override via localStorage ou CONFIG.
// ─────────────────────────────────────────────────────────────────

// ── Helpers localStorage safe (navigation privée / quota dépassé) ──
function _safeGet(key) {
    try { return localStorage.getItem(key); } catch(e) { return null; }
}
function _safeGetJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch(e) { return fallback; }
}

// ⚠️  Cette clé TMDb est read-only (lecture seule) et visible côté client — c'est inévitable
//     pour une app frontend sans proxy. Pour limiter les abus :
//     → Aller sur https://www.themoviedb.org/settings/api et restreindre
//       cette clé au domaine cineamatch.com uniquement.
const DEFAULT_TMDB_KEY   = '9845ee0aa36c422338ce96c39c07178f';
const DEFAULT_OPENAI_KEY = 'server-managed';  // Clé gérée côté serveur via env var Cloudflare

export const store = {
    step: 0,

    answers: {
        // Q1 — Contexte social
        context: null,
        // Q2 — Mood / état émotionnel
        mood: null,
        // Q3 — Durée disponible (nouvelle)
        duration: null,
        // Q4 — Batterie mentale
        pace: null,
        // Q5 — Exclusions (tableau multi)
        exclude: [],
        // Q6 — Époque / vibe
        era: null,
        // Q7 — Films de référence ADN (optionnel, max 3)
        lastLovedMovies: []
    },

    apiKeys: {
        tmdb:   _safeGet('tmdb_key')   || DEFAULT_TMDB_KEY,
        openai: _safeGet('openai_key') || DEFAULT_OPENAI_KEY
    },

    // Pool de candidats + historique session
    recommendationPool: [],
    suggestedMovieIds: [],   // IDs déjà proposés dans la session
    suggestedTitles: [],     // Titres déjà proposés (pour le prompt IA)
    rerollCount: 0,

    // Watchlist locale
    watchlist: _safeGetJSON('watchlist', []),

    // Résultat de l'analyse ADN (pour debug / affichage)
    aiAnalysis: {
        dna_analysis: null,
        theme_interpretation: null,
        mood_tags: []
    },

    // ── Mode Duo ──
    duoMode: false,
    duoRole: null,
    duoPartnerAnswers: null,
    duoPersonBAnswers: null,
    duoMerged: false,
    duoNameA: '',
    duoNameB: '',

    // ── Utilisateur connecté (Supabase) ──
    currentUser: null,
    userAge: null,          // Âge calculé depuis birth_date (null = inconnu)
    _lastMovies: [],
    trendingMovies: [],

    // ── Personnalisation IA ──
    userFavGenres: [],   // genres favoris chargés depuis l'historique

    // ── Préférences utilisateur ──
    preferredPlatforms: JSON.parse(localStorage.getItem('preferred_platforms') || '[]'),
    recoPrefs: JSON.parse(localStorage.getItem('reco_prefs') || '{"vibes":[],"epoques":[],"origines":[],"exclusions":[]}')
};

export const getters = {
    getOpenAIKey() {
        return store.apiKeys.openai || '';
    }
};
