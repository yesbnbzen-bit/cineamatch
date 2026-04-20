// URL OpenAI : proxy Cloudflare Pages en production, direct en local
const OPENAI_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://api.openai.com/v1/chat/completions'
    : '/api/openai';

// Clé de fallback dev — à remplacer par une clé valide si la clé localStorage est vide
const _DEV_KEY = '';

export const tmdbService = {
    apiKey: '',
    lang: 'fr-FR',

    init(key) {
        this.apiKey = key;
    },

    setLanguage(lang) {
        this.lang = lang === 'en' ? 'en-US' : 'fr-FR';
    },

    async searchMovies(query) {
        if (!this.apiKey || this.apiKey === 'MOCK') {
            console.warn("⚠️ TMDb API Key is missing. Returning MOCK search results.");
            return { 
                results: [
                    { id: 27205, title: 'Inception', release_date: '2010-07-16', poster_path: '/edv9riS99vS67itFvS49p9S90E.jpg' },
                    { id: 157336, title: 'Interstellar', release_date: '2014-11-05', poster_path: '/gEU2QniE6E77NI6lCU6MvrIdYjD.jpg' },
                    { id: 155, title: 'The Dark Knight', release_date: '2008-07-16', poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg' }
                ] 
            };
        }
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${this.lang}`;
        const resp = await fetch(url);
        if (!resp.ok) {
            console.error(`❌ TMDb Search Error: ${resp.status} ${resp.statusText}`);
            return { results: [] };
        }
        return await resp.json();
    },

    async getRecommendations(movieIds) {
        const allSuggestions = await Promise.all(movieIds.map(async id => {
            const url = `https://api.themoviedb.org/3/movie/${id}/recommendations?api_key=${this.apiKey}&language=${this.lang}`;
            const resp = await fetch(url);
            const data = await resp.json();
            return data.results || [];
        }));
        const flat = [].concat(...allSuggestions);
        return Array.from(new Map(flat.map(item => [item.id, item])).values());
    },

    async getMovieDetails(movieId) {
        if (this.apiKey === 'MOCK' || !this.apiKey) {
            return {
                id: movieId,
                title: "Inception Test",
                release_date: "2010-07-16",
                genres: [{ id: 878, name: "SF" }, { id: 28, name: "Action" }],
                vote_average: 8.8,
                vote_count: 35000,
                poster_path: "/edv9riS99vS67itFvS49p9S90E.jpg",
                overview: "Un voleur qui utilise une technologie de partage de rêves pour extraire des secrets...",
                videos: { results: [] },
                'watch/providers': { results: { FR: { flatrate: [{ provider_id: 8, logo_path: "/t2yyOuvvBkUMXvUughv9zO9pob.jpg", provider_name: "Netflix" }] } } },
                release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "12" }] }] }
            };
        }
        const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${this.apiKey}&append_to_response=videos,watch/providers,release_dates,credits&language=${this.lang}`;
        const resp = await fetch(url);
        if (!resp.ok) {
            console.error(`❌ TMDb getMovieDetails Error: ${resp.status} ${resp.statusText} (movieId: ${movieId})`);
            return null;
        }
        const data = await resp.json();

        // TMDb filtre les vidéos par langue → presque aucune bande-annonce en fr-FR
        // Si aucune vidéo trouvée, on refait la requête sans langue pour récupérer les trailers YouTube
        if (!data.videos?.results?.length) {
            try {
                const videoResp = await fetch(
                    `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${this.apiKey}`
                );
                if (videoResp.ok) {
                    const videoData = await videoResp.json();
                    data.videos = videoData;
                }
            } catch(e) { /* silencieux */ }
        }

        return data;
    },

    async searchActor(actorName) {
        if (!this.apiKey || this.apiKey === 'MOCK') return 287; // Brad Pitt Mock ID
        const url = `https://api.themoviedb.org/3/search/person?api_key=${this.apiKey}&query=${encodeURIComponent(actorName)}&language=${this.lang}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            console.log(`🎬 Found actor: ${data.results[0].name} (ID: ${data.results[0].id})`);
            return data.results[0].id;
        }
        return null;
    },

    async getActorMovies(actorId) {
        const url = `https://api.themoviedb.org/3/person/${actorId}/movie_credits?api_key=${this.apiKey}&language=${this.lang}`;
        const resp = await fetch(url);
        const data = await resp.json();
        return data.cast || [];
    },

    async getMovieKeywords(movieId) {
        if (!this.apiKey || this.apiKey === 'MOCK') return [];
        try {
            const url = `https://api.themoviedb.org/3/movie/${movieId}/keywords?api_key=${this.apiKey}`;
            const resp = await fetch(url);
            if (!resp.ok) return [];
            const data = await resp.json();
            return data.keywords || [];
        } catch (e) { return []; }
    },

    async getAdvancedDiscovery(preferences, metadata = {}, isReroll = false, page = 1, castIds = []) {
        // Note: le paramètre `page` de l'URL de base est remplacé plus bas par `randomPage`.
        // On le retire ici pour éviter le doublon page=X&...&page=Y (le dernier gagne, mais c'est source de confusion).
        let url = `https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&language=${this.lang}&include_adult=false`;
        
        // Add with_cast parameter if we have cast IDs from loved movies
        if (castIds && castIds.length > 0) {
            const castIdsString = castIds.slice(0, 3).join(','); // Use top 3 actors max
            url += `&with_cast=${castIdsString}`;
            console.log('🎭 Adding with_cast filter:', castIdsString);
        }

        // 1. Genre filtering — utilise le blend ADN+mood si disponible
        // blendedGenreIds = mood strict + genres récurrents des films de référence
        // Ex: mood=thriller(53) + ADN=horreur(27) → "53,27" → trouve Barbarian, Nope, etc.
        let genreIds = metadata.genre_ids || preferences.blendedGenreIds || preferences.mood;

        // excludeMap :
        // - "horror" → genre 27
        // - "scary" → genres 27 (horreur) + 53 (thriller angoissant)
        // - "sad" → genre 18 (drame)
        // - "slow" → pas de genre TMDb (géré uniquement par scoring IA)
        // - "complex" → pas de genre TMDb (géré uniquement par scoring IA)
        // - "adult" → pas de genre TMDb (TMDb a include_adult=false global ; scoring IA pénalise)
        // - "animation" → genre 16
        // - "none" → rien à exclure (carte blanche)
        const excludeMap = {
            "horror":    [27],
            "scary":     [27, 53],
            "sad":       [18],
            "slow":      [],
            "complex":   [],
            "adult":     [],
            "animation": [16],
            "none":      []
        };
        const myExclusions = (preferences.exclude || []).map(ex => excludeMap[ex] || []).flat().filter(Boolean);

        if (genreIds) {
            const genreIdsStr = String(genreIds);
            const cleanGenres = genreIdsStr.split(',').filter(id => !myExclusions.includes(Number(id))).join(',');
            if (cleanGenres) url += `&with_genres=${cleanGenres}`;
        }

        // 2. Strict Exclusions (without_genres)
        let excluded = [];
        if (preferences.exclude && Array.isArray(preferences.exclude)) {
            preferences.exclude.forEach(ex => {
                if (excludeMap[ex] && excludeMap[ex].length > 0) {
                    const ids = Array.isArray(excludeMap[ex]) ? excludeMap[ex].join(',') : excludeMap[ex];
                    excluded.push(ids);
                }
            });
        }
        if (excluded.length > 0) url += `&without_genres=${excluded.join(',')}`;

        // 3. Social Context Filter
        if (preferences.context === 'family') {
            // Famille = certification max 12, pas de violence/horreur, pas de romance adulte
            url += `&certification_country=FR&certification.lte=12&without_genres=27,53,10749&include_adult=false`;
            // Autoriser mystère/suspense doux si mood le demande
            if (preferences.mood === "53" || preferences.mood === "878,9648") {
                url += `&with_genres=9648`; // mystère
            }
        } else if (preferences.context === 'couple') {
            // En couple → boost films avec une dimension relationnelle/émotionnelle forte
            // On n'exclut rien mais on pousse vers des films avec du drame ou de la romance
            // La nuance est gérée au niveau du scoring IA
        } else if (preferences.context === 'friends') {
            // Entre amis → exclure les films très lents/contemplatifs (sauf si pace=mindblow)
            if (preferences.pace === 'easy') {
                url += `&vote_average.gte=6.5`; // Accessible, bien noté
            }
        }

        const era = preferences.era;
        const hasCastFilter = castIds && castIds.length > 0;

        // 4. Duration Filter (short = <105min, long = >120min)
        if (preferences.duration === 'short') {
            url += `&with_runtime.lte=105`;
        } else if (preferences.duration === 'long') {
            url += `&with_runtime.gte=120`;
        }
        // duration === 'any' → pas de filtre durée

        // 4b. Language Filter — déduit des films de référence
        if (preferences.detectedLanguage) {
            url += `&with_original_language=${preferences.detectedLanguage}`;
            console.log(`🌍 Langue détectée depuis ADN : ${preferences.detectedLanguage}`);
        }

        // 4c. Keywords Filter — style narratif précis déduit des films de référence
        if (preferences.adnKeywordIds?.length > 0) {
            url += `&with_keywords=${preferences.adnKeywordIds.join('|')}`;
            console.log(`🔑 Keywords ADN : ${preferences.adnKeywordIds.join('|')}`);
        }

        // 5. Broad Technical Standards
        if (!hasCastFilter) {
            url += `&vote_average.gte=5.5&vote_count.gte=50`;
        }

        // 6. Era Filter — applied strictly regardless of cast filter
        if (era === 'new') {
            url += `&primary_release_date.gte=2020-01-01`;
        }
        else if (era === 'modern') url += `&primary_release_date.gte=2000-01-01&primary_release_date.lte=2019-12-31`;
        else if (era === 'vintage') url += `&primary_release_date.gte=1975-01-01&primary_release_date.lte=1999-12-31`;
        else if (era === 'retro') url += `&primary_release_date.lte=1974-12-31`;

        // 7. Sort / Pivot Strategy
        if (hasCastFilter) {
            url += `&sort_by=popularity.desc&vote_average.gte=4.5&vote_count.gte=10`;
        } else if (isReroll) {
            url += `&sort_by=vote_average.desc&vote_count.lte=4000&vote_average.gte=7.0`;
        } else {
            // Seuil min 300 votes pour la qualité, pas de cap max
            // L'exclusion des mega-blockbusters est gérée par le scoring IA (pénalités)
            url += `&sort_by=vote_average.desc&vote_count.gte=300`;
        }

        const randomPage = isReroll ? Math.floor(Math.random() * 5) + 1 : 1;
        const finalUrl = url + `&page=${randomPage}&_=${Date.now()}`;

        let resp = await fetch(finalUrl, { cache: 'no-store' });
        let data = await resp.json();
        let results = data.results || [];

        try {
            const resp2 = await fetch(finalUrl.replace(`page=${randomPage}`, `page=${randomPage + 1}`), { cache: 'no-store' });
            const data2 = await resp2.json();
            if (data2.results) results = [...results, ...data2.results];
        } catch(e) { console.warn("Next page fetch failed"); }

        // Fallback sans keywords si trop peu de résultats
        if (results.length < 5 && preferences.adnKeywordIds?.length > 0) {
            console.log('⚠️ Keywords trop restrictifs, fallback sans keywords');
            const urlNoKw = finalUrl.replace(/&with_keywords=[^&]+/, '');
            try {
                const r = await fetch(urlNoKw, { cache: 'no-store' });
                const d = await r.json();
                if (d.results?.length > results.length) results = d.results;
            } catch(e) {}
        }

        let finalResults = [...results];

        // T2 FALLBACK si résultats trop faibles
        if (finalResults.length < 3) {
            let t2Url = `https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&language=${this.lang}&include_adult=false&vote_count.gte=20&sort_by=popularity.desc&page=${page}`;
            if (genreIds) t2Url += `&with_genres=${genreIds}`;
            if (excluded.length > 0) t2Url += `&without_genres=${excluded.join(',')}`;
            if (hasCastFilter) t2Url += `&with_cast=${castIds.slice(0,3).join(',')}`;
            if (era === 'new') t2Url += `&primary_release_date.gte=2010-01-01`;
            t2Url += `&_=${Date.now()}`;
            const t2Resp = await fetch(t2Url, { cache: 'no-store' });
            const t2Data = await t2Resp.json();
            const t2Res = t2Data.results || [];
            finalResults = [...finalResults, ...t2Res.filter(r => !finalResults.some(old => old.id === r.id))];
        }

        if (finalResults.length === 0) {
            console.log("FALLBACK T3 déclenché (Aucun film trouvé avec ces filtres !)");
            let t3Url = `https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&language=${this.lang}&include_adult=false&sort_by=popularity.desc`;
            if (era === 'new') t3Url += `&primary_release_date.gte=2020-01-01`;
            if (excluded.length > 0) t3Url += `&without_genres=${excluded.join(',')}`;
            if (castIds && castIds.length > 0) t3Url += `&with_cast=${castIds.slice(0,3).join(',')}`;
            const t3Resp = await fetch(t3Url + `&_=${Date.now()}`);
            const t3Data = await t3Resp.json();
            finalResults = t3Data.results || [];
        }

        if (this.apiKey === 'MOCK' || !this.apiKey) {
            console.log("🛠️ Testing with Mock Data...");
            return Array.from({ length: 20 }, (_, i) => ({
                id: 101 + i,
                title: `Peux-tu me surprendre ? ${i+1}`,
                release_date: (2000 + i) + '-01-01',
                genre_ids: [28, 53],
                vote_average: 8.5,
                vote_count: 5000,
                poster_path: '/r24A810N5T6v3F0Z69o6U0mS.jpg', // Dummy real poster path from TMDB
                overview: "Ceci est une recommandation test générée par l'IA pour valider l'interface. Un film captivant qui vous tiendra en haleine."
            }));
        }
        return finalResults.slice(0, 40);
    }
};

// ─────────────────────────────────────────────────────────────────
//  GENRE ID → LABEL MAP  (for enriched candidate context)
// ─────────────────────────────────────────────────────────────────
const GENRE_LABELS = {
    28: "Action", 12: "Aventure", 16: "Animation", 35: "Comédie",
    80: "Crime", 99: "Documentaire", 18: "Drame", 10751: "Famille",
    14: "Fantastique", 36: "Histoire", 27: "Horreur", 10402: "Musique",
    9648: "Mystère", 10749: "Romance", 878: "Science-Fiction",
    10770: "Téléfilm", 53: "Thriller", 10752: "Guerre", 37: "Western"
};

function formatGenres(ids) {
    if (!ids || ids.length === 0) return "Non précisé";
    return ids.map(id => GENRE_LABELS[id] || id).join(', ');
}

// ─────────────────────────────────────────────────────────────────
//  Résume les films aimés en "archétypes" pour l'analyse ADN
// ─────────────────────────────────────────────────────────────────
function buildDNAArchetypes(likedMovies) {
    if (!likedMovies || likedMovies.length === 0) return "Aucun film de référence fourni.";
    return likedMovies.map(m => `"${m.title}" (${(m.release_date || '').split('-')[0] || '?'})`).join(', ');
}

export const openaiService = {
    apiKey: '',

    init(key) {
        this.apiKey = key;
    },

    // Résout la clé effective : localStorage > fallback dev
    _resolveKey() {
        return this.apiKey || _DEV_KEY;
    },

    async getCinemaTrivia(lang = 'fr') {
        if (!this._resolveKey()) return lang === 'en' ? "Getting your films ready..." : "Préparation de tes films...";
        try {
            const prompt = lang === 'en'
                ? "Give me a very short and surprising cinema fact (max 15 words)."
                : "Donne-moi une anecdote très courte et surprenante sur le cinéma (max 15 mots).";
            const resp = await fetch(OPENAI_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this._resolveKey()}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 50
                })
            });
            if (!resp.ok) throw new Error("OpenAI API Fetch Error");
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) return lang === 'en' ? "Cinema is the art of making pleasure last." : "Le cinéma, c'est l'art de faire durer le plaisir.";
            return content.trim();
        } catch (e) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                console.error("❌ OpenAI CORS Error: Browser blocked the request. You might need a proxy or a browser extension (like CORS Unblock) to run this locally.");
            } else {
                console.error("❌ OpenAI Trivia Error:", e);
            }
            return lang === 'en' ? "Cinema is the art of making pleasure last." : "Le cinéma, c'est l'art de faire durer le plaisir.";
        }
    },

    // ─────────────────────────────────────────────────────────────
    //  ÉTAPE 1 : EXTRACTION DES MÉTADONNÉES (ADN v3 — Style Narratif)
    //  Analyse profonde du profil cinéphile pour générer des filtres
    //  TMDB précis + déduire le style narratif, le rythme, l'esthétique
    //  visuelle et les archétypes émotionnels du spectateur.
    // ─────────────────────────────────────────────────────────────
    async extractMetadata(userAnswers, isReroll = false, seenTitles = []) {
        if (!this._resolveKey()) return {};
        try {
            const eraLabel = userAnswers.era === 'new' ? '2020 à aujourd\'hui'
                : userAnswers.era === 'modern' ? '2000 à 2020'
                : userAnswers.era === 'vintage' ? 'Vintage 1975-1999'
                : 'Toutes époques';

            const dnaBlock = buildDNAArchetypes(userAnswers.lastLovedMovies || []);
            const seenBlock = seenTitles.length > 0
                ? `\n[FILMS DEJA SUGGERES - EXCLURE ABSOLUMENT] : ${seenTitles.join(', ')}\n`
                : '';

            const durationLabel = userAnswers.duration === 'short' ? 'Film court (< 1h45)'
                : userAnswers.duration === 'long' ? 'Long format (> 2h)'
                : 'Peu importe';

            // ── Bloc profil d'apprentissage (films notés par l'utilisateur) ──
            const profile = userAnswers._ratingProfile;
            const learningBlock = (() => {
                if (!profile || profile.loved.length === 0) return '';
                const lovedStr    = profile.loved.map(r => `${r.title} (${r.rating}★)`).join(', ');
                const dislikedStr = profile.disliked.length > 0
                    ? `\n[PROFIL APPRIS - Films peu appréciés (1-2★)] : ${profile.disliked.map(r => r.title).join(', ')}\n→ Évite les films dans le même registre stylistique et narratif que ceux-ci.`
                    : '';
                return `
[PROFIL APPRIS PAR L'IA - Films adorés par cet utilisateur (4-5★)] : ${lovedStr}
→ Ces films révèlent son goût PROFOND et permanent — indépendamment de la session en cours.
→ Utilise-les pour calibrer le NIVEAU D'EXIGENCE et l'ESTHÉTIQUE des suggestions.${dislikedStr}
⚡ RÈGLE LEARNING : Le profil appris ENRICHIT l'ADN style mais ne REMPLACE PAS le mood session. Priorité : mood session > ADN films référence > profil appris.`;
            })();

            const prompt = `Tu es un cinéphile expert et psychologue du goût. Ton rôle : décoder le profil narratif et émotionnel d'un spectateur pour calibrer les filtres TMDB.

═══════════════════════════════════════════
PROFIL SPECTATEUR COMPLET
═══════════════════════════════════════════
[CONTEXTE SOCIAL] : ${userAnswers.contextLabel}
[ENERGIE / MOOD] : ${userAnswers.moodLabel}
[BATTERIE MENTALE] : ${userAnswers.pace === 'easy' ? 'Cerveau débranché — rien de trop complexe' : userAnswers.pace === 'complex' ? 'Attentif — scénario bien construit bienvenu' : userAnswers.pace === 'mindblow' ? 'Mind-blow — intrigue dense et retournements exigés' : 'Peu importe'}
[DUREE DISPONIBLE] : ${durationLabel}
[LANGUE / ORIGINE] : ${(l => l && l !== 'any' ? ({fr:'Films français',en:'Films américains/anglais',ko:'Films asiatiques',es:'Films hispaniques',any:'Peu importe'}[l] || l) : 'Peu importe — toutes origines acceptées')(userAnswers.detectedLanguage || userAnswers.language)}
[FILMS DE REFERENCE (ADN STYLE)] : ${dnaBlock || 'Aucun fourni'}
[EXCLUSIONS STRICTES] : ${userAnswers.excludeLabels || "Aucune"}
[EPOQUE] : ${eraLabel}
${learningBlock}
${seenBlock}

═══════════════════════════════════════════
ANALYSE ADN NARRATIVE (Chain-of-Thought)
═══════════════════════════════════════════

⚠️ RÈGLE CRITIQUE SUR LES FILMS DE RÉFÉRENCE :
Les films de référence servent UNIQUEMENT à calibrer le STYLE et la QUALITÉ narrative.
Ils ne définissent PAS le genre. Le genre vient EXCLUSIVEMENT du champ [ENERGIE / MOOD].
Ex : si l'utilisateur cite "Get Out" (horreur) mais que le mood est "comédie", cherche une comédie au style soigné — pas un film d'horreur.

ÉTAPE 1 — DÉCODAGE ADN STYLE NARRATIF
Analyse les films de référence et réponds à ces questions :
→ Quel est le STYLE DE MISE EN SCÈNE privilégié ? (haletant/contemplatif/épique/intime/viscéral)
→ Quel est le RYTHME NARRATIF préféré ? (montage cut/plans séquences/récit non-linéaire/récit linéaire)
→ Quel est l'ARCHÉTYPE ÉMOTIONNEL ? (catharsis/adrénaline/réflexion/évasion/empathie)
→ Quel est le NIVEAU D'EXIGENCE NARRATIVE ? (divertissement pur / scénario construit / œuvre complexe)
→ Quelle est l'ESTHÉTIQUE VISUELLE ? (réaliste/stylisée/sombre/lumineuse/futuriste/brute)

ÉTAPE 2 — SYNTHÈSE POUR TMDB
→ Genre principal : mood "${userAnswers.moodLabel}" (${userAnswers.mood}).
${userAnswers.blendedGenreIds && userAnswers.blendedGenreIds !== userAnswers.mood
    ? `→ GENRE BLEND DÉTECTÉ : les films de référence incluent aussi les genres [${userAnswers.blendedGenreIds}]. Tes suggestions DOIVENT explorer ce croisement de genres — c'est là que se trouvent les meilleures recommandations.`
    : ''}
→ Keywords TMDB précis : mots-clés de niche ciblant le style narratif, pas juste le genre.
→ 12 titres PRÉCIS incarnant la fusion mood + style ADN + blend genres. Priorise :
   - Films dans le croisement exact des genres détectés (ex: horror-thriller si blend 27+53)
   - Films que l'utilisateur ne connaît probablement pas (évite les blockbusters ultra-connus)
   - Films récents si era="${eraLabel}"
   - Même intensité émotionnelle que les films ADN
   - Variété de sous-genres et de pays
   ${seenTitles.length > 0 ? 'AUCUN des titres déjà vus.' : ''}

${userAnswers.context === 'family' ? '⛔ CONTRAINTE ABSOLUE : Contexte famille = ZÉRO contenu adulte/violent. Exclure genre_ids : 27 (horreur), 53 (thriller intense), 18 (drames lourds).' : ''}

Réponds UNIQUEMENT par ce JSON strict (pas de markdown, pas de texte autour) :
{
  "dna_analysis": "string (2-3 phrases) décrivant le style narratif et le niveau d'exigence détectés",
  "theme_interpretation": "string (1-2 phrases) synthèse mood + style pour guider la recherche",
  "excluded_from_prompt": ["Titre Film Cité"],
  "genre_ids": "id1,id2",
  "specific_suggestions": ["Titre 1"],
  "mood_tags": ["tag1", "tag2"]
}`;
            const messages = [{ role: "user", content: prompt }];

            // --- MODIFICATION PROXY ---
            // On utilise le proxy local (port 8001) pour éviter l'erreur CORS
            const resp = await fetch(OPENAI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._resolveKey()}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: messages,
                    temperature: 0.7, // Plus élevé pour varier les suggestions à chaque recherche
                    response_format: { type: "json_object" }
                })
            });
            if (!resp.ok) throw new Error("OpenAI API Extract Error");
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content;
            let parsed = {};
            try {
                parsed = content ? JSON.parse(content) : {};
            } catch (jsonErr) {
                console.warn("AI returned invalid JSON:", jsonErr);
            }

            console.log("🧬 ADN Narratif:", parsed.dna_analysis);
            console.log("🎨 Style Visuel:", parsed.narrative_style);
            console.log("🎭 Archétype Émotionnel:", parsed.emotional_archetype);
            console.log("🎯 Thème Interprété:", parsed.theme_interpretation);
            return parsed;
        } catch (e) {
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                console.error("❌ OpenAI CORS Error: Browser blocked the request. This is expected when calling OpenAI from a browser. Solution: Use a backend proxy or a CORS-bypass extension for local testing.");
                console.error("❌ Proxy CORS : démarre python3 proxy.py sur le port 8001");
            } else {
                console.error("Extraction error:", e);
            }
            // FAIL-SAFE : retourne objet vide, l'app utilisera les filtres TMDb directs
            return {};
        }
    },

    // ─────────────────────────────────────────────────────────────
    //  ÉTAPE 3 : CLASSEMENT PROFOND PAR IA (Refonte v3)
    //
    //  Scoring multicritères à PONDÉRATION DYNAMIQUE :
    //  — Mode "Envie Précise"  : Thème 45% | ADN 25% | Mood 20% | Qualité 10%
    //  — Mode "ADN Libre"      : ADN 40%   | Mood 30% | Qualité 20% | Thème 10%
    //
    //  + Garantie de DIVERSITÉ du top 3 (genres / styles différents)
    //  + Match reasons ancrées dans les films aimés ET l'envie
    // ─────────────────────────────────────────────────────────────
    async getDeepRecommendations(likedMovies, preferences, candidates = [], isReroll = false, excludedIds = [], lang = 'fr') {
        if (!this._resolveKey()) return [];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const user_dna = buildDNAArchetypes(likedMovies);
        const eraLabel = preferences.era === 'new' ? '2020 à aujourd\'hui'
            : preferences.era === 'modern' ? '2000-2020'
            : preferences.era === 'vintage' ? 'Vintage 1975-1999'
            : 'Toutes époques';
        const durationLabel = preferences.duration === 'short' ? 'Film court (< 1h45)'
            : preferences.duration === 'long' ? 'Long format (> 2h)'
            : 'Peu importe';

        // ── Pondération fixe : ADN style 40% | Mood 30% | Qualité 20% | Thème 10% ──
        const weights = { dna: 40, mood: 30, quality: 20, theme: 10 };
        const weightingDescription = `MODE ADN LIBRE :
  → ADN Style Cinéphile = ${weights.dna} pts MAX (PRIORITÉ — style narratif, rythme, esthétique)
  → Mood/Énergie = ${weights.mood} pts max
  → Qualité Objective = ${weights.quality} pts max
  → Thème = ${weights.theme} pts max (bonus secondaire)`;

        // ── Enrichissement des candidats avec contexte narratif ──
        const enrichedCandidates = candidates.map(m => {
            const year = (m.release_date || '').split('-')[0] || '?';
            const rating = m.vote_average ? `${Number(m.vote_average).toFixed(1)}/10` : 'N/A';
            const votes = m.vote_count ? `${m.vote_count.toLocaleString()} votes` : '';
            const genres = formatGenres(m.genre_ids || []);
            const overview = m.overview ? m.overview.substring(0, 220) : 'Pas de synopsis.';
            return `- [ID:${m.id}] "${m.title}" (${year}) | ${genres} | ⭐${rating} (${votes})\n  └─ ${overview}`;
        }).join('\n');

        // ── Ancrage ADN pour les match reasons ──
        const dnaAnchor = likedMovies && likedMovies.length > 0
            ? `Films de référence de cet utilisateur : ${user_dna}. Dans tes raisons de match, fais des LIENS EXPLICITES avec ces films quand c'est pertinent (ex: "Dans la lignée de [Film X]", "Le même souffle que [Film Y]").`
            : `Pas de films de référence fournis. Base tes raisons sur le mood et l'envie.`;

        // ── Contexte re-roll ──
        const rerollContext = isReroll
            ? `\n🔄 MODE RE-ROLL ACTIF : L'utilisateur veut de la NOUVEAUTÉ. IDs exclus : [${excludedIds.join(', ')}]. Favorise impérativement la diversité dans le top 3.`
            : '';

        // ── Personnalisation depuis l'historique CineaMatch IA ──
        const userFavGenres = preferences._userFavGenres || [];
        const userPersonalization = userFavGenres.length > 0
            ? `\n\n✨ PROFIL CINÉPHILE PERSONNALISÉ (historique CineaMatch IA) :
  Genres que cet utilisateur apprécie historiquement : ${userFavGenres.map(id => GENRE_ID_NAMES[id] || id).join(', ')}
  → Accorde +5 pts BONUS aux films qui incluent ces genres, SANS jamais sacrifier la cohérence avec le mood actuel.
  → Ces genres reflètent ses goûts à long terme — ils peuvent orienter à égalité entre deux films similaires.`
            : '';

        // ── Plateformes de streaming préférées ──
        const userPlatforms = preferences._userPlatforms || [];
        const streamingContext = userPlatforms.length > 0
            ? `\n\n📺 PLATEFORMES DE STREAMING DE L'UTILISATEUR : ${userPlatforms.join(', ')}
  → Parmi les films qui correspondent au mood, PRÉFÈRE ceux disponibles sur ces plateformes (+3 pts bonus).
  → Si plusieurs films sont équivalents, favorise celui disponible sur ces plateformes.
  → Ne sacrifie JAMAIS la cohérence mood/genre pour cette contrainte.`
            : '';

        // ── Préférences de recommandation par défaut (vibe, époque, origine, exclusions) ──
        const rp = preferences._recoPrefs || {};
        const rpVibes      = rp.vibes      || [];
        const rpEpoques    = rp.epoques    || [];
        const rpOrigines   = rp.origines   || [];
        const rpExclusions = rp.exclusions || [];
        const hasRecoPrefs = rpVibes.length || rpEpoques.length || rpOrigines.length || rpExclusions.length;
        const recoPrefsContext = hasRecoPrefs
            ? `\n\n🎯 PRÉFÉRENCES PERMANENTES CONFIGURÉES PAR L'UTILISATEUR :${
                rpEpoques.length && !rpEpoques.includes("Peu importe l'époque")
                                  ? `\n  📅 Époque : ${rpEpoques.join(', ')} — favorise ces périodes` : ''}${
                rpOrigines.length && !rpOrigines.includes('Monde entier')
                                  ? `\n  🌍 Pays d'origine : ${rpOrigines.join(', ')} — favorise ces origines` : ''}${
                rpExclusions.length ? `\n\n  ⛔ RÈGLES ABSOLUES — SANS EXCEPTION :\n${rpExclusions.map(e => `    • JAMAIS de films avec : ${e}`).join('\n')}\n  Ces règles s'appliquent même si un film est excellent par ailleurs. Élimination immédiate.` : ''}`
            : '';

        // ── Contexte Duo Mode ──
        const LANG_LABELS = { fr: 'Films français', en: 'Films américains/anglais', ko: 'Films asiatiques', es: 'Films hispaniques/latinos', any: 'Indifférent' };
        const langConflictNote = preferences.isDuoMode && preferences._duoLangConflict
            ? `\n  ⚡ CONFLIT D'ORIGINE : A préfère "${LANG_LABELS[preferences._duoLangA] || preferences._duoLangA}" vs B "${LANG_LABELS[preferences._duoLangB] || preferences._duoLangB}"
  → Cherche une co-production, un film d'auteur international, ou un film universellement adopté par les deux cultures.
  → Exemples : Intouchables (FR-INT), La Haine, Amélie, The Artist, OSS 117 — ou un film américain très francophile.
  ⛔ Ne choisis PAS 3 films tous dans la même langue.`
            : '';
        const eraConflictNote = preferences.isDuoMode && preferences._duoEraConflict
            ? `\n  ⚡ CONFLIT D'ÉPOQUE : A veut du "${preferences._duoEraLabelA || preferences._duoEraA}" vs B du "${preferences._duoEraLabelB || preferences._duoEraB}"
  → Cherche un film INTEMPOREL : soit un classique qui a vieilli parfaitement, soit un film récent au style rétro.
  → Exemples : The Shawshank Redemption, Parasite, Goodfellas, The Godfather, Drive, Blade Runner 2049.
  → Privilégie des films dont l'année n'est pas leur première qualité — des œuvres qui transcendent leur époque.
  ⛔ Ne choisis PAS 3 films tous du même siècle.`
            : '';

        const duoContext = preferences.isDuoMode
            ? `\n\n👫 MODE DUO — RÈGLE ABSOLUE ET NON NÉGOCIABLE :
Ces recommandations sont pour DEUX personnes avec des envies DIFFÉRENTES :
  → Personne A veut : ${preferences.duoMoodLabelA || '?'}
  → Personne B veut : ${preferences.duoMoodLabelB || '?'}${langConflictNote}${eraConflictNote}

CHAQUE film du top 3 DOIT être un vrai compromis qui satisfait les DEUX simultanément.
Cherche des films à l'INTERSECTION des deux moods — par exemple :
  • Comédie avec tension/twist (ex: Knives Out, Game Night, The Nice Guys)
  • Thriller accessible et divertissant (ex: Ocean's Eleven, Catch Me If You Can)
  • Drame avec énergie/rythme (ex: The Pursuit of Happyness, La La Land)

⛔ PÉNALITÉ SÉVÈRE : -35 pts pour tout film orienté à 80%+ vers UN SEUL des deux profils.
⛔ INTERDIT : Recommander 3 films qui plaisent tous uniquement à la même personne.
✅ OBJECTIF : Les deux personnes doivent dire "oui" après avoir vu la fiche du film.`
            : '';

        // ── Profil d'âge de l'utilisateur ──
        const ageProfile = preferences._ageProfile || null;
        const ageContext = ageProfile
            ? `\n\n👤 PROFIL D'ÂGE : ${ageProfile.label}
  → ${ageProfile.hint}${ageProfile.excludeAdult ? '\n  ⛔ INTERDIT ABSOLU : tout contenu adulte explicite, nudité, violence graphique, thèmes trop lourds. Score = 0 forcé pour ces films.' : ''}`
            : '';

        // ── Contexte social → impact sur le scoring ──
        const contextImpact = preferences.context === 'family'
            ? `\n⛔ CONTEXTE FAMILLE (BLOQUANT) : Score = 0 automatique pour tout film violent, sexuellement explicite, ou contenu adulte.`
            : preferences.context === 'couple'
            ? `\n💑 CONTEXTE COUPLE : Favorise les films avec une dimension émotionnelle forte, une tension relationnelle, ou une histoire qui invite à la discussion post-visionnage. +10 pts bonus pour les films qui créent un "effet miroir" dans une relation.`
            : preferences.context === 'friends'
            ? `\n👥 CONTEXTE AMIS : Favorise les films accessibles, qui se regardent bien en groupe, avec un rythme soutenu. Évite les films trop intimes ou trop contemplatifs qui perdent leur force en groupe.`
            : `\n🎬 CONTEXTE SOLO : Aucune contrainte particulière. L'expérience peut être immersive, difficile, ou très personnelle.`;
        const familyWarning = contextImpact; // compatibilité avec le template

        // ── Traduire blendedGenreIds en noms lisibles pour le prompt ──
        const GENRE_ID_NAMES = {
            18: 'Drame', 10749: 'Romance', 28: 'Action', 12: 'Aventure',
            53: 'Thriller', 27: 'Horreur', 35: 'Comédie', 10751: 'Famille',
            878: 'Science-Fiction', 9648: 'Mystère', 16: 'Animation',
            36: 'Histoire', 80: 'Crime', 99: 'Documentaire', 10402: 'Musique'
        };
        const blendedIds = (preferences.blendedGenreIds || '').split(',').map(Number).filter(Boolean);
        const blendedNames = blendedIds.map(id => GENRE_ID_NAMES[id] || id).join(', ');
        const hasRomanceInBlend = blendedIds.includes(10749);
        const romanceWarning = !hasRomanceInBlend && preferences.mood?.includes('10749')
            ? `\n⛔ ROMANCE EXCLUE DU BLEND : Le film de référence n'a pas de dimension romantique. NE PAS scorer favorablement les films romantiques/sentimentaux. Score = 0 pour tout film dont le genre principal est Romance (10749).`
            : '';

        // Avertissement conflit ADN/mood (ex: légèreté + Get Out)
        const conflictWarning = preferences.adnConflictsWithMood
            ? `\n⚠️ CONFLIT ADN/MOOD DÉTECTÉ : Les films de référence appartiennent à un genre OPPOSÉ au mood choisi (ex: film d'horreur cité pour une soirée légère). Dans ce cas, le MOOD est prioritaire pour le genre — cherche des films du genre demandé (${blendedNames}) mais avec la SOPHISTICATION NARRATIVE et le niveau d'exigence du film de référence. Ne recommande PAS des films du genre du film de référence.`
            : '';

        const systemPrompt = `Tu es le moteur de recommandation cinéphile de CineaMatch IA. Tu appliques un scoring multicritères avec garantie de diversité.

⚠️ RÈGLE CRITIQUE — ADN CINÉPHILE :
Les films de référence (ADN) calibrent le style narratif, le rythme et l'esthétique visuelle.
L'ÉNERGIE/MOOD donne le registre émotionnel général. Les GENRES EFFECTIFS ci-dessous ont priorité sur le libellé du mood.
${romanceWarning}${conflictWarning}

═══════════════════════════════════════════
PROFIL SPECTATEUR
═══════════════════════════════════════════
👤 CONTEXTE : ${preferences.contextLabel}
⚡ ÉNERGIE / MOOD : ${preferences.moodLabel}
🎭 GENRES EFFECTIFS (blend ADN + mood) : ${blendedNames || preferences.moodLabel}
🧠 NIVEAU D'ATTENTION : ${preferences.pace === 'easy' ? 'Détendu (simplicité avant tout)' : preferences.pace === 'complex' ? 'Attentif (scénario construit)' : preferences.pace === 'mindblow' ? 'Mind-blow (complexité max)' : 'Peu importe'}
⏱️ DURÉE DISPONIBLE : ${durationLabel}
🌍 LANGUE / ORIGINE : ${(l => l && l !== 'any' ? (LANG_LABELS[l] || l) : 'Peu importe')(preferences.detectedLanguage || preferences.language)}
🎬 ADN STYLE CINÉPHILE : ${user_dna || 'Non fourni'}
🚫 EXCLUSIONS : ${preferences.excludeLabels || 'Aucune'}
📅 ÉPOQUE : ${eraLabel}
${rerollContext}${familyWarning}${ageContext}${duoContext}${userPersonalization}${streamingContext}${recoPrefsContext}

⚠️ IMPORTANT: Ces films candidats ont DÉJÀ été pré-filtrés pour correspondre à la demande. Si l'utilisateur mentionne un acteur, TOUS ces films le contiennent (même si ce n'est pas précisé dans le synopsis court). Ne pénalise pas un film pour ça.

═══════════════════════════════════════════
SYSTÈME DE SCORING DYNAMIQUE (100 pts)
═══════════════════════════════════════════
${weightingDescription}

📐 CALCUL DÉTAILLÉ PAR FILM :

🧬 ÉTAPE A — ADN STYLE (${weights.dna} pts MAX — CRITÈRE DOMINANT)
→ Films de référence : ${user_dna || 'non fourni'}.
→ Le film partage-t-il le même STYLE narratif ? (rythme, mise en scène, esthétique, niveau d'exigence)
→ ⚠️ NE PAS évaluer la similarité de GENRE — seulement le style et la qualité narrative.
→ ${weights.dna} pts = style très proche | ${Math.round(weights.dna*0.5)} pts = vague ressemblance | 0 pt = aucun lien.

🎯 ÉTAPE B — PERTINENCE THÉMATIQUE (${weights.theme} pts max)
→ Bonus secondaire si le film correspond à un thème implicite du profil (hors genre).

⚡ ÉTAPE C — ADÉQUATION MOOD/ÉNERGIE (${weights.mood} pts max)
→ Énergie demandée : ${preferences.moodLabel}.
→ Le film correspond-il au rythme, au ton, à l'intensité émotionnelle attendus ?
→ Attention au niveau d'attention : ${preferences.pace === 'easy' ? 'évite les films denses et cryptiques' : preferences.pace === 'mindblow' ? 'favorise les films à multiples couches' : 'Scénario construit OK'}.

⭐ ÉTAPE D — QUALITÉ OBJECTIVE (${weights.quality} pts max)
→ ≥ 8.0 = ${weights.quality} pts | 7.5-8.0 = ${Math.round(weights.quality*0.8)} pts | 7.0-7.5 = ${Math.round(weights.quality*0.6)} pts | < 7.0 = ${Math.round(weights.quality*0.4)} pts.

⛔ PÉNALITÉS (soustraire du total)

— EXCLUSIONS & CONTENU —
→ ID dans [${excludedIds.join(', ')}] : Score = 0 FORCÉ
→ Genre explicitement exclu (animation, horreur, tristesse…) : Score = 0 FORCÉ
${preferences.context === 'family' ? '→ Contenu adulte/violent/sexuel avec contexte famille : Score = 0 FORCÉ' : ''}
${preferences.exclude?.includes('horror') || preferences.exclude?.includes('scary') ? '→ Film d\'horreur ou thriller angoissant alors que l\'utilisateur l\'a explicitement exclu : Score = 0 FORCÉ.' : ''}
${preferences.exclude?.includes('sad') ? '→ Film déprimant/lourd/à fin tragique alors que l\'utilisateur l\'a exclu : Score = 0 FORCÉ.' : ''}
${preferences.exclude?.includes('adult') ? '→ Film avec nudité/contenu sexuel explicite alors que l\'utilisateur l\'a exclu : Score = 0 FORCÉ.' : ''}
${preferences.exclude?.includes('animation') ? '→ Film d\'animation alors que l\'utilisateur l\'a exclu : Score = 0 FORCÉ.' : ''}
${preferences.exclude?.includes('teen') ? '→ Film dont le public cible est clairement adolescent (lycée, coming-of-age, romance ado, teen drama) alors que l\'utilisateur l\'a exclu : Score = 0 FORCÉ. Critères : personnages principaux en lycée/collège, intrigue centrée sur l\'adolescence, public visé 13-17 ans. Exemples exclus : "À tous les garçons que j\'ai aimés", "Clueless", "The Kissing Booth", "Twilight", "The Fault in Our Stars", "Divergente". Un film comme "The Breakfast Club" ou "Stand by Me" peut être exclu également.' : ''}
${preferences.exclude?.includes('slow') ? '→ Film au rythme contemplatif/très lent avec exclusion "lenteur" demandée : -30 pts. Privilégie un rythme soutenu, des scènes qui avancent.' : ''}
${preferences.exclude?.includes('complex') ? '→ Film à scénario alambiqué/cryptique/non-linéaire difficile à suivre alors que l\'utilisateur veut du simple : -30 pts. Favorise des récits clairs et accessibles.' : ''}

— DURÉE (contrainte ferme) —
${preferences.duration === 'short' ? '→ Film > 2h (120 min) alors que durée demandée = court (< 1h45) : -35 pts. C\'est une contrainte forte — pénalise sévèrement.' : preferences.duration === 'long' ? '→ Film < 1h45 (105 min) alors que durée demandée = long format (> 2h) : -25 pts.' : ''}

— GENRE REQUIS —
→ Le film n'appartient PAS au genre demandé (${preferences.moodLabel}) — ex: documentaire pour "thriller", comédie pour "suspense" : -45 pts. C'est la contrainte principale.
→ Si le film est uniquement un documentaire ou un film de musique sans aucune dimension thriller/action/drama selon le mood demandé : Score = 0 FORCÉ.

— ÉPOQUE —
${preferences.era === 'new' ? `→ Film sorti AVANT 2020 alors que l'utilisateur veut des films récents (+2020) : Score = 0 FORCÉ. C'est une contrainte non-négociable.` : `→ Hors époque "${eraLabel}" : -40 pts.`}

— NIVEAU D'ATTENTION —
${preferences.pace === 'easy' ? '→ Film dense/cryptique/confus avec pace=détendu : -20 pts. Favorise la clarté narrative et le divertissement accessible.' : ''}
${preferences.pace === 'mindblow' ? '→ Film prévisible/simple avec pace=mind-blow : -15 pts. Exige des retournements, plusieurs couches narratives, une intrigue qui résiste.' : ''}

— CONTEXTE SOCIAL —
${preferences.context === 'couple' ? '→ Film trop solitaire/contemplatif sans dimension relationnelle pour un visionnage en couple : -12 pts. Bonus +10 pts si le film crée un "effet miroir" ou invite à la discussion post-visionnage.' : ''}
${preferences.context === 'friends' ? '→ Film trop intimiste/personnel/lent pour une soirée entre amis : -15 pts. Favorise les films avec énergie, humour ou suspense partageable en groupe.' : ''}
${preferences.context === 'alone' ? '→ Pas de contrainte de contexte — l\'expérience peut être immersive, difficile ou très personnelle. Bonus +5 pts pour les films qui gagnent à être vus seul.' : ''}

═══════════════════════════════════════════
GARANTIE DE DIVERSITÉ (CRITIQUE)
═══════════════════════════════════════════
Dans ton classement final, les 3 premiers films DOIVENT être diversifiés :
→ Pas 3 thrillers si des alternatives existent. Pas 3 films de la même décennie si évitable.
→ Si le top 2 est du même sous-genre, le 3ème DOIT être d'un registre différent (même si score légèrement inférieur).
→ Objectif : 3 films qui se COMPLÈTENT (ex: un intime, un épique, un original) plutôt que 3 clones.

═══════════════════════════════════════════
MATCH REASONS — RÈGLES DE RÉDACTION
═══════════════════════════════════════════
${dnaAnchor}

Chaque match_reason doit :
1. Être rédigée en ${lang === 'en' ? 'ANGLAIS' : 'FRANÇAIS'}, 1-2 phrases percutantes (max 180 caractères).
2. Mentionner CE QUI EST SPÉCIFIQUE à ce film (une scène emblématique, un thème unique, un style distinctif).
3. Faire le PONT avec le profil : relier explicitement au mood, à l'envie, ou à un film aimé.
4. VARIER le style d'accroche : parfois factuel, parfois émotionnel, parfois surprenant.
5. Ne jamais être générique (interdit : "un film parfait pour toi", "correspond à tes goûts").

Exemples de bons débuts : "Dans la lignée de [film aimé]...", "Si tu cherches [envie], ce film...", "L'atmosphère [adj] de [titre] va...", "Rarement un film [caractéristique unique]..."

═══════════════════════════════════════════
FORMAT JSON OBLIGATOIRE
═══════════════════════════════════════════
Retourne TOUS les films scorés. JSON strict, aucun texte autour :
{"recommendations": [{"tmdb_id": number, "match_score": number, "match_reason": "string", "diversity_tag": "string"}]}

où diversity_tag est un mot décrivant le registre du film (ex: "épique", "intime", "haletant", "dépaysant", "poétique", "viscéral").`;

        const userPrompt = `Voici les ${candidates.length} films candidats à scorer :

${enrichedCandidates}

Applique le scoring dynamique, garantis la diversité du top 3, et génère des match reasons percutantes.`;

        try {
            const resp = await fetch(OPENAI_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this._resolveKey()}`
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.25,  // Légèrement plus haut pour varier les formulations des reasons
                    response_format: { type: "json_object" },
                    max_tokens: 4000   // Plus de tokens pour des reasons plus riches
                })
            });
            clearTimeout(timeout);

            if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
            const data = await resp.json();
            const parsed = JSON.parse(data.choices[0].message.content);
            let recommendations = parsed.recommendations || [];

            // ── POST-PROCESSING : Garantie diversité top 3 côté client ──
            const sorted = [...recommendations].sort((a, b) => b.match_score - a.match_score);
            const diversified = this._applyDiversityFilter(sorted, candidates);

            // Log debug
            console.log(`🎬 Scoring IA : ${recommendations.length} films scorés`);
            console.log(`⚖️ ADN x${weights.dna}% | Mood x${weights.mood}% | Qualité x${weights.quality}% | Thème x${weights.theme}%`);
            diversified.slice(0, 3).forEach((r, i) =>
                console.log(`  ${i+1}. [${r.match_score}pts | ${r.diversity_tag || ''}] ID:${r.tmdb_id} — ${r.match_reason?.substring(0, 90)}...`)
            );

            return diversified;
        } catch (error) {
            clearTimeout(timeout);
            console.error("OpenAI Hybrid Ranking Error:", error);
            throw new Error("Rank API failed: " + error.message);
        }
    },

    // ─────────────────────────────────────────────────────────────
    //  DIVERSITÉ FILTER : Garantit que le top 3 est varié
    //  Si les 3 premiers ont le même "diversity_tag" ou les mêmes
    //  genres principaux, on intercale le meilleur film d'un autre registre.
    // ─────────────────────────────────────────────────────────────
    _applyDiversityFilter(sortedRecs, candidates) {
        if (sortedRecs.length <= 3) return sortedRecs;

        const result = [sortedRecs[0]]; // Le #1 est toujours gardé
        const usedTags = new Set([sortedRecs[0].diversity_tag || 'unknown']);
        const usedGenreSigs = new Set();

        // Calcule la "signature genre" d'un film (2 genres principaux)
        const getGenreSig = (rec) => {
            const movie = candidates.find(c => Number(c.id) === Number(rec.tmdb_id));
            if (!movie || !movie.genre_ids) return 'unknown';
            return movie.genre_ids.slice(0, 2).sort().join('-');
        };
        usedGenreSigs.add(getGenreSig(sortedRecs[0]));

        // Slot #2 : meilleur score parmi les restants
        for (let i = 1; i < sortedRecs.length && result.length < 2; i++) {
            result.push(sortedRecs[i]);
            usedTags.add(sortedRecs[i].diversity_tag || 'unknown');
            usedGenreSigs.add(getGenreSig(sortedRecs[i]));
        }

        // Slot #3 : préfère un film d'un tag ET genre-sig différents
        const remaining = sortedRecs.filter(r => !result.includes(r));
        const diverse = remaining.find(r => {
            const tag = r.diversity_tag || 'unknown';
            const sig = getGenreSig(r);
            return !usedTags.has(tag) || !usedGenreSigs.has(sig);
        });

        if (diverse) {
            result.push(diverse);
            console.log(`🌈 Diversité : #3 remplacé par "${diverse.diversity_tag}" (ID:${diverse.tmdb_id}) pour la variété`);
        } else {
            // Pas d'alternative assez diverse, on prend juste le suivant
            const fallback = remaining.find(r => !result.includes(r));
            if (fallback) result.push(fallback);
        }

        // Réintègre le reste après le top 3 diversifié
        const tail = sortedRecs.filter(r => !result.includes(r));
        return [...result, ...tail];
    }
};
