// ─────────────────────────────────────────────────────────────────
//  CINEMATCH IA — Questions v3  (FR + EN)
// ─────────────────────────────────────────────────────────────────

export const QUESTIONS = [
    null, // index 0 réservé (store.step commence à 1)

    // ── Q1 : CONTEXTE ── (obligatoire)
    {
        title: "Dans quel cadre regardes-tu ce film ?",
        subtitle: "Pour t'éviter toute mauvaise surprise.",
        type: "options",
        key: "context",
        options: [
            { id: "alone",   label: "Seul",         icon: "👤", description: "Zéro limite, ton ADN ciné prend toute sa place." },
            { id: "couple",  label: "En couple",    icon: "👩‍❤️‍👨", description: "Thématiques matures ou romantiques possibles." },
            { id: "family",  label: "En famille",   icon: "👪", description: "Contrôle parental activé — contenu tout public." },
            { id: "friends", label: "Entre amis",   icon: "🍻", description: "Priorité au fun et au rythme soutenu." }
        ]
    },

    // ── Q2 : MOOD ── (obligatoire)
    {
        title: "Qu'est-ce que tu veux regarder ce soir ?",
        subtitle: "Choisis le genre qui te correspond le mieux.",
        type: "options",
        key: "mood",
        options: [
            { id: "35,10751", label: "Rire / Comédie",       icon: "😂", description: "Comédies, gags, films qui font vraiment rire." },
            { id: "28,12",    label: "Action / Aventure",    icon: "⚡", description: "Bagarres, poursuites, adrénaline et grand spectacle." },
            { id: "53",       label: "Thriller / Suspense",  icon: "🕵️", description: "Tension, manipulation, impossible de décrocher." },
            { id: "27",       label: "Horreur",              icon: "😱", description: "Peur, épouvante et sensations fortes." },
            { id: "18,10749", label: "Émouvant / Inspirant",  icon: "💕", description: "Drames, biopics, histoires vraies qui émeuvent et inspirent." },
            { id: "878,9648", label: "SF / Mystère",         icon: "🌌", description: "Futur, réalité tordue, énigmes et révélations." }
        ]
    },

    // ── Q3 : ORIGINE ── (nouveau)
    {
        title: "Tu préfères des films de quelle origine ?",
        subtitle: "Hollywood, cinéma français, coréen… ou peu importe.",
        type: "options",
        key: "language",
        options: [
            { id: "en",  label: "Américain",          icon: "🇺🇸", description: "Hollywood et cinéma anglophone." },
            { id: "fr",  label: "Français",            icon: "🇫🇷", description: "Cinéma français et francophone." },
            { id: "ko",  label: "Asiatique",           icon: "🌏", description: "Coréen, japonais, chinois..." },
            { id: "es",  label: "Espagnol / Latino",   icon: "🇪🇸", description: "Espagne, Mexique, Amérique latine." },
            { id: "any", label: "Peu importe",         icon: "🌍", description: "L'IA cherche dans tous les pays." }
        ]
    },

    // ── Q4 : DURÉE ──
    {
        title: "T'as combien de temps devant toi ?",
        subtitle: "Pour ne pas te proposer The Irishman si tu dois te coucher tôt.",
        type: "options",
        key: "duration",
        options: [
            { id: "short", label: "Film court",      icon: "⚡",  description: "Moins de 1h45 — efficace et rythmé." },
            { id: "long",  label: "Long format",     icon: "🎬",  description: "Plus de 2h — je suis là pour un grand film." },
            { id: "any",   label: "Peu importe",     icon: "🕐",  description: "La durée n'est pas un critère ce soir." }
        ]
    },

    // ── Q6 : EXCLUSIONS ── (multi-choix, max 3)
    {
        title: "Qu'est-ce qui peut gâcher ta soirée ?",
        subtitle: "Choisis jusqu'à 3 choses que tu veux absolument éviter.",
        type: "options-multi",
        maxSelect: 3,
        key: "exclude",
        options: [
            { id: "horror",    label: "Trop de violence",         icon: "🚫", description: "Pas de sang ni de scènes traumatisantes." },
            { id: "sad",       label: "Trop triste / lourd",      icon: "😢", description: "Rien de déprimant ou pesant ce soir." },
            { id: "scary",     label: "Films qui font peur",      icon: "😱", description: "Pas d'horreur ni de suspense angoissant." },
            { id: "adult",     label: "Contenu adulte / nudité",  icon: "🔞", description: "Contenu explicite à éviter." },
            { id: "slow",      label: "Trop lent",                icon: "🐌", description: "Pas de films contemplatifs sans rythme." },
            { id: "complex",   label: "Trop complexe",            icon: "🧠", description: "Scénarios alambiqués ou prise de tête." },
            { id: "animation", label: "Films d'animation",        icon: "🎨", description: "Que du live-action." },
            { id: "teen",      label: "Films d'ados",             icon: "🎓", description: "Pas de lycée, coming-of-age ou romance ado." },
            { id: "none",      label: "Rien ne me dérange",       icon: "😎", description: "L'IA a carte blanche sur tous les thèmes." }
        ]
    },

    // ── Q7 : ÉPOQUE / VIBE ──
    {
        title: "Quelle vibe cinéma tu cherches ?",
        subtitle: "L'époque change tout à l'ambiance d'un film.",
        type: "options",
        key: "era",
        options: [
            { id: "new",     label: "Récent (2020+)",        icon: "🆕", description: "Les dernières productions, ultra-nettes." },
            { id: "modern",  label: "Moderne (2000-2020)",   icon: "📡", description: "L'ère dorée du cinéma numérique." },
            { id: "vintage", label: "Vintage (avant 2000)",  icon: "📼", description: "La texture unique des années 80-90." },
            { id: "any",     label: "Peu importe l'époque",  icon: "🌍", description: "La qualité prime sur l'âge du film." }
        ]
    },

    // ── Q8 : FILMS DE RÉFÉRENCE ── (optionnel)
    {
        title: "Un film que tu as aimé, proche de ce que tu cherches ?",
        subtitle: "Il sera ajouté à tes films vus et sert à calibrer le style. Tu peux en ajouter jusqu'à 3.",
        type: "search-multi"
    }
];

// ─────────────────────────────────────────────────────────────────
//  Version anglaise des questions
// ─────────────────────────────────────────────────────────────────
export const QUESTIONS_EN = [
    null, // index 0 reserved

    {
        title: "Who are you watching with tonight?",
        subtitle: "So we avoid any awkward surprises.",
        type: "options",
        key: "context",
        options: [
            { id: "alone",   label: "Solo",          icon: "👤", description: "No limits — your full cinematic DNA." },
            { id: "couple",  label: "With a partner", icon: "👩‍❤️‍👨", description: "Mature or romantic themes welcome." },
            { id: "family",  label: "With family",    icon: "👪", description: "Parental control on — all-ages content." },
            { id: "friends", label: "With friends",   icon: "🍻", description: "Fun and fast-paced, priority." }
        ]
    },

    {
        title: "What do you want to feel tonight?",
        subtitle: "The emotion you're after is the heart of the recommendation.",
        type: "options",
        key: "mood",
        options: [
            { id: "35,10751", label: "Comedy / Laugh",       icon: "😂", description: "Comedies, gags, films that make you laugh." },
            { id: "28,12",    label: "Action / Adventure",   icon: "⚡", description: "Fights, chases, adrenaline and spectacle." },
            { id: "53",       label: "Thriller / Suspense",  icon: "🕵️", description: "Tension, manipulation, impossible to stop watching." },
            { id: "27",       label: "Horror",               icon: "😱", description: "Fear, dread and strong sensations." },
            { id: "18,10749", label: "Moving / Inspiring",    icon: "💕", description: "Dramas, biopics, true stories that move and inspire." },
            { id: "878,9648", label: "Sci-Fi / Mystery",     icon: "🌌", description: "Future, twisted reality, enigmas and revelations." }
        ]
    },

    {
        title: "Which film origin do you prefer?",
        subtitle: "Hollywood, French, Korean… or whatever.",
        type: "options",
        key: "language",
        options: [
            { id: "en",  label: "American",          icon: "🇺🇸", description: "Hollywood and English-language cinema." },
            { id: "fr",  label: "French",             icon: "🇫🇷", description: "French and Francophone cinema." },
            { id: "ko",  label: "Asian",              icon: "🌏", description: "Korean, Japanese, Chinese..." },
            { id: "es",  label: "Spanish / Latino",   icon: "🇪🇸", description: "Spain, Mexico, Latin America." },
            { id: "any", label: "Doesn't matter",     icon: "🌍", description: "The AI searches across all countries." }
        ]
    },

    {
        title: "How much time do you have?",
        subtitle: "So we don't recommend The Irishman if you have an early morning.",
        type: "options",
        key: "duration",
        options: [
            { id: "short", label: "Short film",    icon: "⚡",  description: "Under 1h45 — tight and punchy." },
            { id: "long",  label: "Long format",   icon: "🎬",  description: "Over 2h — I'm here for a great film." },
            { id: "any",   label: "Doesn't matter",icon: "🕐",  description: "Runtime isn't a factor tonight." }
        ]
    },

    {
        title: "What could ruin your evening?",
        subtitle: "Pick up to 3 things you absolutely want to avoid.",
        type: "options-multi",
        maxSelect: 3,
        key: "exclude",
        options: [
            { id: "horror",    label: "Too violent",           icon: "🚫", description: "No blood or traumatising scenes." },
            { id: "sad",       label: "Too sad / heavy",       icon: "😢", description: "Nothing depressing or draining tonight." },
            { id: "scary",     label: "Scary films",           icon: "😱", description: "No horror or nerve-wracking suspense." },
            { id: "adult",     label: "Adult content / nudity",icon: "🔞", description: "Explicit content to avoid." },
            { id: "slow",      label: "Too slow",              icon: "🐌", description: "No slow-burn, contemplative films." },
            { id: "complex",   label: "Too complex",           icon: "🧠", description: "No convoluted or mind-bending plots." },
            { id: "animation", label: "Animation",             icon: "🎨", description: "Live-action only." },
            { id: "teen",      label: "Teen / YA films",       icon: "🎓", description: "No high school, coming-of-age or teen romance." },
            { id: "none",      label: "Nothing bothers me",    icon: "😎", description: "AI has free rein on all themes." }
        ]
    },

    {
        title: "What cinema vibe are you after?",
        subtitle: "The era changes everything about a film's feel.",
        type: "options",
        key: "era",
        options: [
            { id: "new",     label: "Recent (2020+)",       icon: "🆕", description: "The latest productions, ultra-sharp." },
            { id: "modern",  label: "Modern (2000-2020)",   icon: "📡", description: "The golden age of digital cinema." },
            { id: "vintage", label: "Vintage (pre-2000)",   icon: "📼", description: "The unique texture of the 80s-90s." },
            { id: "any",     label: "Any era",              icon: "🌍", description: "Quality over age." }
        ]
    },

    {
        title: "A film you loved that's close to what you're after?",
        subtitle: "It will be added to your watched list and helps calibrate the style. You can add up to 3.",
        type: "search-multi"
    }
];
