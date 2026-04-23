// ─────────────────────────────────────────────────────────────────
//  CineaMatch IA — Supabase Client & Database Operations
//  Remplace tes clés ci-dessous une fois le projet créé
// ─────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://wyikiuwcygaemjzwbltk.supabase.co';
const SUPABASE_ANON = 'sb_publishable_z2dX34NgOMVj4spzMWF1-w_fQOWQb0x';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────────

export const authService = {

    // Récupérer la session active
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    // Récupérer l'utilisateur connecté
    async getUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    // Inscription email + mot de passe
    async signUp(email, password, name, birthDate = null) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name, birth_date: birthDate } }
        });
        if (error) throw error;
        // Créer le profil
        if (data.user) {
            await supabase.from('profiles').upsert({
                id:         data.user.id,
                name:       name || email.split('@')[0],
                birth_date: birthDate || null
            });
        }
        return data;
    },

    // Connexion email + mot de passe
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    // Connexion Google OAuth
    async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options:  { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
    },

    // Déconnexion
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    // Changer le mot de passe (utilisateur déjà connecté)
    async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    },

    // Écouter les changements d'état (connecté / déconnecté)
    onAuthChange(callback) {
        return supabase.auth.onAuthStateChange((_event, session) => {
            callback(session?.user || null);
        });
    }
};

// ─────────────────────────────────────────────────────────────────
//  WATCHLIST
// ─────────────────────────────────────────────────────────────────

export const watchlistService = {

    async getAll(userId) {
        const { data, error } = await supabase
            .from('watchlist')
            .select('*')
            .eq('user_id', userId)
            .order('added_at', { ascending: false });
        if (error) { console.error('watchlist getAll:', error); return []; }
        return data;
    },

    async add(userId, movie) {
        const { error } = await supabase.from('watchlist').upsert({
            user_id:     userId,
            movie_id:    movie.id,
            title:       movie.title,
            poster_path: movie.poster_path,
            year:        movie.release_date?.split('-')[0] || ''
        });
        if (error) console.error('watchlist add:', error);
    },

    async remove(userId, movieId) {
        const { error } = await supabase
            .from('watchlist')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        if (error) console.error('watchlist remove:', error);
    },

    async isInList(userId, movieId) {
        const { data } = await supabase
            .from('watchlist')
            .select('id')
            .eq('user_id', userId)
            .eq('movie_id', movieId)
            .maybeSingle();
        return !!data;
    }
};

// ─────────────────────────────────────────────────────────────────
//  HISTORIQUE
// ─────────────────────────────────────────────────────────────────

export const historyService = {

    // Sauvegarder une recommandation reçue
    async save(userId, movie, mood, matchScore) {
        const { error } = await supabase.from('history').insert({
            user_id:     userId,
            movie_id:    movie.id,
            title:       movie.title,
            poster_path: movie.poster_path,
            year:        movie.release_date?.split('-')[0] || '',
            genre_ids:   movie.genre_ids || [],
            mood:        mood,
            match_score: matchScore
        });
        if (error) console.error('history save:', error);
    },

    // Récupérer l'historique (pour affichage)
    async getAll(userId, limit = 50) {
        const { data, error } = await supabase
            .from('history')
            .select('*')
            .eq('user_id', userId)
            .order('recommended_at', { ascending: false })
            .limit(limit);
        if (error) { console.error('history getAll:', error); return []; }
        return data;
    },

    // IDs des films déjà recommandés (pour éviter les répétitions)
    async getSeenMovieIds(userId) {
        const { data } = await supabase
            .from('history')
            .select('movie_id')
            .eq('user_id', userId);
        return (data || []).map(r => r.movie_id);
    },

    // Genres les plus vus (pour personnaliser les futures recommandations)
    async getFavoriteGenres(userId) {
        const { data } = await supabase
            .from('history')
            .select('genre_ids, match_score')
            .eq('user_id', userId)
            .order('recommended_at', { ascending: false })
            .limit(30);
        if (!data) return [];
        const freq = {};
        data.forEach(row => {
            const weight = (row.match_score || 70) / 100;
            (row.genre_ids || []).forEach(g => {
                freq[g] = (freq[g] || 0) + weight;
            });
        });
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id]) => parseInt(id));
    }
};

// ─────────────────────────────────────────────────────────────────
//  NOTATIONS & "DÉJÀ VU"
// ─────────────────────────────────────────────────────────────────

export const ratingsService = {

    // Sauvegarder ou mettre à jour une notation
    async rate(userId, movie, rating, seen = true) {
        const { error } = await supabase.from('ratings').upsert({
            user_id:     userId,
            movie_id:    movie.id,
            title:       movie.title,
            poster_path: movie.poster_path,
            genre_ids:   movie.genre_ids || [],
            rating:      rating,
            seen:        seen
        });
        if (error) console.error('ratings rate:', error);
    },

    // Marquer comme "déjà vu" sans noter
    async markSeen(userId, movie) {
        const { error } = await supabase.from('ratings').upsert({
            user_id:     userId,
            movie_id:    movie.id,
            title:       movie.title,
            poster_path: movie.poster_path,
            genre_ids:   movie.genre_ids || [],
            seen:        true
        });
        if (error) console.error('ratings markSeen:', error);
    },

    // Récupérer la notation d'un film
    async getRating(userId, movieId) {
        const { data } = await supabase
            .from('ratings')
            .select('rating, seen')
            .eq('user_id', userId)
            .eq('movie_id', movieId)
            .maybeSingle();
        return data;
    },

    // IDs des films déjà vus (pour les exclure ou les déprioritiser)
    async getSeenMovieIds(userId) {
        const { data } = await supabase
            .from('ratings')
            .select('movie_id')
            .eq('user_id', userId)
            .eq('seen', true);
        return (data || []).map(r => r.movie_id);
    },

    // Films bien notés (4-5 étoiles) — pour affiner l'ADN ciné
    async getTopRated(userId) {
        const { data } = await supabase
            .from('ratings')
            .select('movie_id, title, rating')
            .eq('user_id', userId)
            .gte('rating', 4)
            .order('rating', { ascending: false })
            .limit(20);
        return data || [];
    },

    // ── Profil d'apprentissage complet ──
    // Retourne les films adorés, les films ratés, et les genres dominants
    // utilisés pour enrichir le prompt OpenAI à chaque nouvelle recherche
    async getRatingProfile(userId) {
        const { data } = await supabase
            .from('ratings')
            .select('movie_id, title, rating, genre_ids')
            .eq('user_id', userId)
            .not('rating', 'is', null)
            .order('rating', { ascending: false })
            .limit(60);

        if (!data || data.length === 0) return null;

        const loved    = data.filter(r => r.rating >= 4).slice(0, 8);
        const disliked = data.filter(r => r.rating <= 2).slice(0, 5);

        // Genres dominants dans les films bien notés
        const genreFreq = {};
        loved.forEach(r => (r.genre_ids || []).forEach(g => {
            genreFreq[g] = (genreFreq[g] || 0) + 1;
        }));
        const topGenres = Object.entries(genreFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id]) => parseInt(id));

        return {
            loved,
            disliked,
            totalRated: data.length,
            topGenres
        };
    },

    // Retirer le marquage "vu" (garder la notation si elle existe)
    async removeSeen(userId, movieId) {
        const { error } = await supabase
            .from('ratings')
            .update({ seen: false })
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        if (error) console.error('ratings removeSeen:', error);
    },

    // Supprimer entièrement une entrée (film sans notation)
    async removeEntry(userId, movieId) {
        const { error } = await supabase
            .from('ratings')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        if (error) console.error('ratings removeEntry:', error);
    },

    // Tous les films notés OU marqués vus — pour la page "Mes Films"
    async getAllRatedOrSeen(userId) {
        const { data, error } = await supabase
            .from('ratings')
            .select('*')
            .eq('user_id', userId);
        if (error) { console.error('getAllRatedOrSeen:', error); return []; }
        // Trier par rating décroissant (films bien notés en premier), puis par movie_id
        return (data || []).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
};

// ─────────────────────────────────────────────────────────────────
//  PRÉFÉRENCES UTILISATEUR (plateformes de streaming, etc.)
// ─────────────────────────────────────────────────────────────────

export const preferencesService = {

    // ── PLATEFORMES ──────────────────────────────────────────────
    async savePlatforms(platforms) {
        localStorage.setItem('preferred_platforms', JSON.stringify(platforms));
        try {
            await supabase.auth.updateUser({ data: { streaming_platforms: platforms } });
        } catch(e) {
            console.warn('preferencesService save (non bloquant):', e);
        }
    },

    loadPlatforms(user) {
        const fromMeta = user?.user_metadata?.streaming_platforms;
        if (fromMeta && Array.isArray(fromMeta) && fromMeta.length > 0) {
            localStorage.setItem('preferred_platforms', JSON.stringify(fromMeta));
            return fromMeta;
        }
        try {
            const stored = localStorage.getItem('preferred_platforms');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    },

    // ── PRÉFÉRENCES DE RECOMMANDATION ────────────────────────────
    async saveRecoPrefs(prefs) {
        // prefs = { vibes:[], epoques:[], origines:[], exclusions:[] }
        localStorage.setItem('reco_prefs', JSON.stringify(prefs));
        try {
            await supabase.auth.updateUser({ data: { reco_prefs: prefs } });
        } catch(e) {
            console.warn('preferencesService saveRecoPrefs (non bloquant):', e);
        }
    },

    loadRecoPrefs(user) {
        const fromMeta = user?.user_metadata?.reco_prefs;
        if (fromMeta && typeof fromMeta === 'object') {
            localStorage.setItem('reco_prefs', JSON.stringify(fromMeta));
            return fromMeta;
        }
        try {
            const stored = localStorage.getItem('reco_prefs');
            return stored ? JSON.parse(stored) : { vibes: [], epoques: [], origines: [], exclusions: [] };
        } catch {
            return { vibes: [], epoques: [], origines: [], exclusions: [] };
        }
    }
};
