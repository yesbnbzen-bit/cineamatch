import { tmdbService, openaiService, tmdbUrl } from './services/api.js?v=68';
import { store, getters } from './state/store.js?v=44';
import { ui } from './modules/ui.js?v=44';
import { QUESTIONS, QUESTIONS_EN } from './config/questions.js?v=48';
import { historyService, ratingsService, watchlistService, preferencesService } from './services/supabase.js?v=12';
import { t, getLang, setLang, applyTranslations } from './config/i18n.js?v=351';

// ── Met à jour le compteur de sélections d'une question multi ──
function _updateMultiCounter(grid, q, count) {
    const maxSelect = q.maxSelect || null;
    if (!maxSelect) return;
    const counter = document.getElementById('multi-counter');
    if (!counter) return;
    const remaining = maxSelect - count;
    if (count === 0) {
        counter.textContent = `${count} / ${maxSelect} sélectionné`;
    } else {
        counter.textContent = `${count} / ${maxSelect} sélectionné${count > 1 ? 's' : ''}`;
    }
    counter.style.color = count >= maxSelect ? 'rgba(80, 200, 120, 0.85)' : 'rgba(255,255,255,0.4)';
}

// ── Sanitisation HTML — protection XSS sur les données API ──
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Exposer t() globalement pour les onclick inline (synopsis toggle, etc.)
window.t = t;

// Exposer setLang globalement pour le switcher HTML
window._setLang = (lang) => {
    setLang(lang);
    tmdbService.setLanguage(lang);
    // Re-rendre le questionnaire si actif
    const qActive = document.getElementById('questionnaire')?.classList.contains('active');
    if (qActive) App.renderStep();
    // Re-rendre les résultats si actifs
    const resultsActive = document.getElementById('results')?.classList.contains('active');
    if (resultsActive && store._lastMovies?.length) {
        App.renderResults(store._lastMovies);
    }
    // Re-rendre la page tendances si active
    const homeActive = document.getElementById('hero')?.classList.contains('active');
    if (homeActive && store.trendingMovies?.length) {
        App._renderTrendingCards(store.trendingMovies);
    }
};

// Langue courante → questions correspondantes
function getQuestions() {
    return getLang() === 'en' ? QUESTIONS_EN : QUESTIONS;
}

// ─────────────────────────────────────────────────────────────────
//  Score de match décroissant selon le nombre de rerolls
// ─────────────────────────────────────────────────────────────────
const MAX_LOVED_MOVIES      = 3;   // films de référence max ("que tu as aimé")
const REROLL_MAX_SCORES     = [95, 87, 79, 71, 64, 58, 54, 50, 47, 45, 43];
const REROLL_FREE_LIMIT     = 0;   // sans compte : 0 reroll (1er clic → inscription)
const REROLL_LOGGED_LIMIT   = 2;   // compte gratuit : 2 rerolls (3 batches total)
const REROLL_PREMIUM_LIMIT  = 5;   // premium : 5 rerolls (au-delà → surcharge de choix / fatigue décisionnelle)

function getMaxScore(rerollCount) {
    return REROLL_MAX_SCORES[Math.min(rerollCount, REROLL_MAX_SCORES.length - 1)];
}

function getNextScore(rerollCount) {
    return REROLL_MAX_SCORES[Math.min(rerollCount + 1, REROLL_MAX_SCORES.length - 1)];
}

// « Américain » = origine USA réelle. origin_country est le signal fiable ;
// production_countries est pollué par Netflix US (co-liste "US" sur des films
// nigérians/indiens). On exclut explicitement Nollywood/Bollywood (NG/IN).
function passesUSFilter(details, lang) {
    if (lang !== 'en' || !details) return true;
    const orig = details.origin_country || [];
    const prod = (details.production_countries || []).map(c => c.iso_3166_1);
    if ([...orig, ...prod].some(c => c === 'NG' || c === 'IN')) return false;
    return orig.length > 0 ? orig.includes('US') : prod.includes('US');
}

// ── Logos plateformes : carrousel de l'écran de chargement ──
// Vrais logos COLORÉS (icône officielle de chaque plateforme) via le service
// de favicons Google — fiable, coloré, immédiat. Posés sur pastille blanche.
const PLATFORM_DOMAINS = [
    'netflix.com', 'primevideo.com', 'disneyplus.com',
    'tv.apple.com', 'max.com', 'paramountplus.com'
];

function cacheProviderLogos(movies) {
    try {
        const map = JSON.parse(localStorage.getItem('cm_provider_logos') || '{}');
        (movies || []).forEach(m => {
            const fr = m['watch/providers']?.results?.FR || {};
            [...(fr.flatrate || []), ...(fr.rent || []), ...(fr.free || []), ...(fr.ads || [])]
                .forEach(p => {
                    if (p.logo_path && p.provider_name && !map[p.provider_name]) {
                        map[p.provider_name] = p.logo_path;
                    }
                });
        });
        const keys = Object.keys(map).slice(0, 14);
        const capped = {};
        keys.forEach(k => capped[k] = map[k]);
        localStorage.setItem('cm_provider_logos', JSON.stringify(capped));
    } catch (e) { /* localStorage indispo : on ignore */ }
}

let _lbgRaf = null;
function renderLoadingBgLogos() {
    const box = document.getElementById('loading-bg-logos');
    if (!box) return;
    // Frise pleine largeur : grands logos sur les côtés, qui rapetissent et
    // s'enfoncent vers le centre (concave vers le fond).
    const domains = [...PLATFORM_DOMAINS, ...PLATFORM_DOMAINS.slice(0, 2)]; // 8
    const N = domains.length;
    box.innerHTML = '<div class="loading-bg-stage">' + domains.map(d =>
        `<img class="lbg-logo" src="https://logo.clearbit.com/${d}?size=512&format=png"
              data-fav="https://www.google.com/s2/favicons?sz=256&domain=${d}"
              alt="" onerror="this.onerror=null;this.src=this.dataset.fav;">`
    ).join('') + '</div>';
    const imgs = box.querySelectorAll('.lbg-logo');
    const speed = 0.02;
    if (_lbgRaf) cancelAnimationFrame(_lbgRaf);
    let start = null;
    function frame(ts) {
        if (!box.isConnected || box.offsetParent === null) { _lbgRaf = null; return; }
        if (start === null) start = ts;
        const t = (ts - start) / 1000;
        const W = box.clientWidth || 1400;
        const H = box.clientHeight || 700;
        const margin   = W * 0.15;                  // moins de marge = logos plus rapprochés
        const total    = W + 2 * margin;
        const edgeSize = Math.min(W * 0.27, 500);   // GÉANT sur les côtés
        const cy = H * 0.5;
        imgs.forEach((img, i) => {
            let f = ((i / N) + t * speed) % 1;
            if (f < 0) f += 1;
            const sx = -margin + f * total;                 // position écran (pleine largeur)
            const c  = Math.max(-1, Math.min(1, (sx / W - 0.5) * 2));
            const cc = c * c;                               // 0 centre .. 1 bords
            const size = edgeSize * (0.26 + 0.74 * cc);     // centre plus petit = profondeur
            const yOff = 32 * (1 - cc);                     // léger creux au centre
            const edgeFade = Math.max(0, Math.min(1, (1 - Math.abs(c)) / 0.12));
            img.style.width = img.style.height = size.toFixed(0) + 'px';
            img.style.borderRadius = (size * 0.22).toFixed(0) + 'px';
            img.style.left = sx.toFixed(1) + 'px';
            img.style.top  = (cy + yOff).toFixed(1) + 'px';
            img.style.transform = 'translate(-50%,-50%)';
            img.style.opacity = ((0.34 + 0.12 * cc) * edgeFade).toFixed(3);
        });
        _lbgRaf = requestAnimationFrame(frame);
    }
    _lbgRaf = requestAnimationFrame(frame);
}

// ─────────────────────────────────────────────────────────────────
//  Deep links vers les plateformes de streaming
// ─────────────────────────────────────────────────────────────────
const STREAMING_URLS = {
    'Netflix':               t => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
    'Amazon Prime Video':    t => `https://www.amazon.fr/s?k=${encodeURIComponent(t)}&i=instant-video`,
    'Amazon Video':          t => `https://www.amazon.fr/s?k=${encodeURIComponent(t)}&i=instant-video`,
    'Prime Video':           t => `https://www.amazon.fr/s?k=${encodeURIComponent(t)}&i=instant-video`,
    'Disney Plus':           t => `https://www.disneyplus.com/search/${encodeURIComponent(t)}`,
    'Disney+':               t => `https://www.disneyplus.com/search/${encodeURIComponent(t)}`,
    'Apple TV Plus':         t => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
    'Apple TV+':             t => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
    'Canal+':                t => `https://www.canalplus.com/recherche/?q=${encodeURIComponent(t)}`,
    'Max':                   t => `https://play.max.com/search?q=${encodeURIComponent(t)}`,
    'Paramount Plus':        t => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
    'Paramount+':            t => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
    'Mubi':                  t => `https://mubi.com/fr/films`,
    'Crunchyroll':           t => `https://www.crunchyroll.com/fr/search?q=${encodeURIComponent(t)}`,
    'Salto':                 t => `https://www.salto.fr/search?q=${encodeURIComponent(t)}`,
    'OCS':                   t => `https://www.ocs.fr/recherche?q=${encodeURIComponent(t)}`,
    'myCanal':               t => `https://www.canalplus.com/recherche/?q=${encodeURIComponent(t)}`,
};

// ─────────────────────────────────────────────────────────────────
//  App — Orchestrateur principal
// ─────────────────────────────────────────────────────────────────
const App = {

    async init() {
        // Appliquer les traductions dès le démarrage
        applyTranslations();

        const openaiKey = getters.getOpenAIKey();
        if (store.apiKeys.tmdb) tmdbService.init(store.apiKeys.tmdb);
        tmdbService.setLanguage(getLang());
        openaiService.init(openaiKey);

        // Déclencher l'apparition fluide de la page après que le DOM est prêt
        requestAnimationFrame(() => requestAnimationFrame(() => {
            document.body.classList.add('page-ready');
        }));

        ui.dom.startBtn.addEventListener('click', () => {
            // openaiKey peut être vide — openaiService utilise _resolveKey() comme fallback
            if (!store.apiKeys.tmdb) {
                this.showModal();
            } else {
                this.startFlow();
            }
        });

        ui.dom.saveApiBtn.addEventListener('click', () => this.saveSettings());

        if (ui.dom.configBtn) {
            ui.dom.configBtn.addEventListener('click', () => this.showModal());
        }

        if (ui.dom.watchlistNavBtn) {
            ui.dom.watchlistNavBtn.addEventListener('click', () => this.showWatchlist());
        }

        if (ui.dom.profileNavBtn) {
            ui.dom.profileNavBtn.addEventListener('click', () => this.showProfile());
        }

        const prefsBtn = document.getElementById('prefs-nav-btn');
        if (prefsBtn) prefsBtn.addEventListener('click', () => this.showPreferences());

        // ── Toggle dropdown user-menu au clic (en plus du hover) ──
        const userMenu = document.getElementById('user-menu');
        if (userMenu) {
            userMenu.addEventListener('click', (e) => {
                // Si le clic est sur le bouton déconnexion, laisser son onclick gérer
                if (e.target.closest('.btn-signout-drop')) return;
                userMenu.classList.toggle('open');
            });
            // Fermer si on clique ailleurs
            document.addEventListener('click', (e) => {
                if (!userMenu.contains(e.target)) {
                    userMenu.classList.remove('open');
                }
            });
        }

        // Navbar : fondu progressif selon scroll (0→80px = transparent→sombre)
        const navbar = document.querySelector('.navbar');
        const _handleNavbarScroll = () => {
            const sy = window.scrollY || document.documentElement.scrollTop
                     || document.getElementById('main-container')?.scrollTop || 0;
            const t = Math.min(sy / 80, 1); // 0 en haut, 1 après 80px
            const opacity = t * 0.9;
            const blur    = t * 18;
            if (navbar) {
                navbar.style.background    = `rgba(8, 8, 8, ${opacity})`;
                navbar.style.backdropFilter       = blur > 1 ? `blur(${blur.toFixed(1)}px)` : '';
                navbar.style.webkitBackdropFilter = blur > 1 ? `blur(${blur.toFixed(1)}px)` : '';
                navbar.style.boxShadow = t > 0.5 ? `0 1px 0 rgba(255,255,255,${t * 0.06})` : '';
            }
        };
        window.addEventListener('scroll', _handleNavbarScroll, { passive: true });
        document.getElementById('main-container')?.addEventListener('scroll', _handleNavbarScroll, { passive: true });

        // Fermer modal préférences
        const _closePrefs = () => {
            const m = document.getElementById('preferences-modal');
            if (!m) return;
            m.classList.remove('visible');
            setTimeout(() => { m.style.display = 'none'; }, 320);
        };
        document.getElementById('prefs-modal-close')?.addEventListener('click', _closePrefs);
        document.getElementById('preferences-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) _closePrefs();
        });
        document.getElementById('prefs-save-btn')?.addEventListener('click', () => this.savePreferences());

        // Navigation onglets personnalisation
        document.querySelectorAll('.prefs-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                document.querySelectorAll('.prefs-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.prefs-tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab-' + target)?.classList.add('active');
            });
        });

        window.toggleWatchlist = (e, id) => {
            e.stopPropagation();
            // Si non connecté → ouvrir la modale d'inscription
            if (!store.currentUser) {
                document.getElementById('auth-btn')?.click();
                return;
            }
            this.handleWatchlistToggle(id);
        };

        // ── Bouton Mode Duo (hero) ──
        const duoBtn = document.getElementById('duo-btn');
        if (duoBtn) {
            duoBtn.addEventListener('click', () => {
                if (!store.apiKeys.tmdb) {
                    this.showModal();
                } else {
                    this.startDuoFlow();
                }
            });
        }

        // ── Retour depuis Stripe Checkout ──
        const premiumParam = new URLSearchParams(location.search).get('premium');
        if (premiumParam === 'success' || premiumParam === 'cancel') {
            // Attendre que l'auth soit initialisée avant d'afficher le toast
            setTimeout(() => this.handleStripeReturn(premiumParam), 1500);
        }

        // ── Détection URL Personne B — format Supabase (?duo_id=SESSION_ID) ──
        const duoSessionId = new URLSearchParams(location.search).get('duo_id');
        if (duoSessionId) {
            // Retirer le loader HTML instantané (classe ajoutée avant app.js dans <head>)
            document.documentElement.classList.remove('duo-link');
            this.injectDuoBg();
            ui.switchView('duo-welcome');
            const welcomeCard = document.querySelector('#duo-welcome .duo-card');
            if (welcomeCard) {
                welcomeCard.innerHTML = `
                    <div class="duo-badge-pill">${t('duo.badge')}</div>
                    <div class="duo-welcome-icon" style="animation:float 2s ease-in-out infinite">🎬</div>
                    <p style="color:rgba(255,255,255,0.5);font-size:0.95rem;margin:1rem 0 0;">
                        ${getLang() === 'en' ? 'Loading session…' : 'Chargement de la session…'}
                    </p>`;
            }
            try {
                const { duoSessionService } = await import('./services/supabase.js?v=12');
                const session = await duoSessionService.get(duoSessionId);
                if (session && session.status !== 'done') {
                    store.duoMode           = true;
                    store.duoRole           = 'B';
                    store.duoPartnerAnswers = session.answers_a;
                    store.duoNameA          = session.name_a || '';
                    store.duoMerged         = false;
                    store._duoSessionId     = duoSessionId;
                    await duoSessionService.setResponding(duoSessionId);
                    localStorage.setItem('duo_b_status', 'responding'); // fallback même appareil
                    this.renderDuoWelcome();
                } else if (!session) {
                    // Session introuvable ou expirée — afficher un message d'erreur
                    if (welcomeCard) {
                        welcomeCard.innerHTML = `
                            <div class="duo-welcome-icon">⏱️</div>
                            <h2 style="font-size:1.3rem;font-weight:800;color:#fff;margin:0 0 0.5rem;">
                                ${getLang() === 'en' ? 'Link expired' : 'Lien expiré'}
                            </h2>
                            <p style="color:rgba(255,255,255,0.5);font-size:0.9rem;line-height:1.6;">
                                ${getLang() === 'en'
                                    ? 'Ask your partner to generate a new link.'
                                    : 'Demande à ton partenaire de générer un nouveau lien.'}
                            </p>
                            <button onclick="location.href='/'" class="btn-primary" style="margin-top:1.5rem;">
                                ${getLang() === 'en' ? 'Back to home' : 'Retour à l\'accueil'}
                            </button>`;
                    }
                    console.warn('Duo session introuvable ou expirée :', duoSessionId);
                }
            } catch(e) {
                console.error('Duo session load failed:', e);
            }
        }

        // ── Détection URL Personne B — ancien format (?duo=BASE64) — rétrocompat ──
        const duoParam = new URLSearchParams(location.search).get('duo');
        if (duoParam && !duoSessionId) {
            try {
                const cleanParam = duoParam.replace(/ /g, '+');
                const answersA = JSON.parse(decodeURIComponent(escape(atob(cleanParam))));
                store.duoMode = true;
                store.duoRole = 'B';
                store.duoPartnerAnswers = answersA;
                store.duoMerged = false;
                localStorage.setItem('duo_b_status', 'responding');
                this.renderDuoWelcome();
            } catch(e) {
                console.error('Duo param invalide', e);
            }
        }

        // Vérifier et proposer la reprise de session
        this._checkResumeSession();

        // Initialiser l'onboarding
        this._initOnboarding();

        // Charger les films tendances sur la homepage
        this._loadTrending();
    },

    // ── Modale config API ──
    showModal() {
        ui.dom.apiModal.style.display = 'flex';
        if (ui.dom.tmdbInput)  ui.dom.tmdbInput.value  = store.apiKeys.tmdb   || '';
        if (ui.dom.openaiInput) ui.dom.openaiInput.value = store.apiKeys.openai || '';
    },

    saveSettings() {
        store.apiKeys.tmdb   = ui.dom.tmdbInput.value;
        store.apiKeys.openai = ui.dom.openaiInput.value;
        localStorage.setItem('tmdb_key',   store.apiKeys.tmdb);
        localStorage.setItem('openai_key', store.apiKeys.openai);
        tmdbService.init(store.apiKeys.tmdb);
        openaiService.init(store.apiKeys.openai);
        ui.dom.apiModal.style.display = 'none';
        this.startFlow();
    },

    // ── Sauvegarde automatique de session ──
    _saveSession() {
        if (store.step < 2 || store.duoMode) return;
        const session = {
            step: store.step,
            answers: store.answers,
            ts: Date.now()
        };
        localStorage.setItem('cinematch_session', JSON.stringify(session));
    },

    // ── Nettoyage de la session sauvegardée ──
    _clearSession() {
        localStorage.removeItem('cinematch_session');
    },

    // ── Vérification et restauration de session ──
    _checkResumeSession() {
        const raw = localStorage.getItem('cinematch_session');
        if (!raw) return;
        let session;
        try { session = JSON.parse(raw); } catch { return; }
        const age = Date.now() - (session.ts || 0);
        if (age > 4 * 60 * 60 * 1000) { this._clearSession(); return; }

        const banner = document.getElementById('resume-banner');
        if (!banner) return;

        // Afficher le toast avec animation
        banner.style.display = 'flex';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => banner.classList.add('visible'));
        });

        const hideToast = () => {
            banner.classList.add('hiding');
            banner.classList.remove('visible');
            setTimeout(() => { banner.style.display = 'none'; banner.classList.remove('hiding'); }, 450);
        };

        document.getElementById('resume-yes-btn')?.addEventListener('click', () => {
            hideToast();
            store.step    = session.step;
            store.answers = session.answers;
            store.duoMode = false;
            ui.switchView('questionnaire');
            this.renderStep();
        });
        document.getElementById('resume-no-btn')?.addEventListener('click', () => {
            this._clearSession();
            hideToast();
        });
        document.getElementById('resume-close-btn')?.addEventListener('click', () => {
            hideToast();
        });
    },

    // ── Films populaires sur streaming (homepage) ──
    async _loadTrending() {
        // En prod, le proxy gère la clé — on vérifie quand même en dev
        const key = store.apiKeys.tmdb;
        const IS_PROD = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        if (!IS_PROD && !key) return;

        const section = document.getElementById('trending-section');
        if (!section) return;

        try {
            const lang = tmdbService.lang;
            // Deux pages pour avoir 40 films disponibles → on prend les 20 avec poster
            // ✅ Sécurité : passe par tmdbUrl() → clé gérée côté proxy, jamais exposée
            const [r1, r2] = await Promise.all([
                fetch(tmdbUrl('/discover/movie', { language: lang, sort_by: 'popularity.desc', with_watch_monetization_types: 'flatrate', watch_region: 'FR', 'vote_count.gte': '200', page: '1' }), { cache: 'no-store' }),
                fetch(tmdbUrl('/discover/movie', { language: lang, sort_by: 'popularity.desc', with_watch_monetization_types: 'flatrate', watch_region: 'FR', 'vote_count.gte': '200', page: '2' }), { cache: 'no-store' })
            ]);
            const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
            const all = [...(d1.results || []), ...(d2.results || [])];
            const movies = all.filter(m => m.poster_path).slice(0, 20);
            if (!movies.length) return;

            // Stocker pour pouvoir re-rendre au changement de langue
            store.trendingMovies = movies;

            this._renderTrendingCards(movies);
            section.style.display = 'block';
            // Petit délai pour laisser le navigateur peindre, puis fade-in smooth
            requestAnimationFrame(() => requestAnimationFrame(() => section.classList.add('visible')));
        } catch (e) {
            console.warn('Trending load failed', e);
        }
    },

    _renderTrendingCards(movies) {
        const row = document.getElementById('trending-row');
        if (!row || !movies?.length) return;

        // Plateformes connues → label court pour le badge
        const PLATFORM_LABELS = {
            8: 'NETFLIX', 9: 'AMAZON', 337: 'DISNEY+', 350: 'APPLE TV+',
            384: 'MAX', 381: 'CANAL+', 531: 'PARAMOUNT+', 283: 'CRUNCHYROLL'
        };

        // Génère le HTML d'un set de cartes
        const makeCards = () => movies.map((m) => {
            const poster = `https://image.tmdb.org/t/p/w342${m.poster_path}`;
            const rating = m.vote_average ? `★ ${m.vote_average.toFixed(1)}` : '';
            // Déduire la plateforme depuis les providers si disponibles
            const providers = m['watch/providers']?.results?.FR;
            const firstProvider = providers?.flatrate?.[0] || providers?.rent?.[0];
            const platformLabel = firstProvider ? (PLATFORM_LABELS[firstProvider.provider_id] || firstProvider.provider_name?.toUpperCase().slice(0,8)) : '';
            return `
            <div class="trending-poster">
                <img src="${poster}" alt="${escapeHtml(m.title)}" loading="lazy">
                ${platformLabel ? `<div class="trending-poster-platform">${platformLabel}</div>` : ''}
                <div class="trending-poster-overlay">${rating}</div>
                <span class="trending-poster-rank"></span>
                <div class="trending-poster-title">${escapeHtml(m.title)}</div>
            </div>`;
        }).join('');

        // Triple les cartes (A + B + C) pour scroll infini sans blocage
        row.innerHTML = makeCards() + makeCards() + makeCards();

        // Démarrer au TOUT PREMIER film (à gauche), pas au milieu.
        requestAnimationFrame(() => {
            row.scrollLeft = 0;

            // Défilement infini vers la droite : quand on entre dans le 3e set,
            // on revient discrètement au 2e (contenu identique → invisible).
            // Le scroll vers la gauche s'arrête au premier film (comportement attendu).
            let scrollTimer = null;
            row.addEventListener('scroll', () => {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    const sl = row.scrollLeft;
                    const sw = row.scrollWidth / 3;
                    if (sl >= sw * 2) {
                        row.style.scrollBehavior = 'auto';
                        row.scrollLeft = sl - sw;
                        row.style.scrollBehavior = '';
                    }
                    scrollTimer = null;
                }, 120);
            }, { passive: true });

            // Boutons navigation
            const prev = document.getElementById('trending-prev');
            const next = document.getElementById('trending-next');
            const scrollAmt = 680;
            if (prev) prev.onclick = () => row.scrollBy({ left: -scrollAmt, behavior: 'smooth' });
            if (next) next.onclick = () => row.scrollBy({ left: scrollAmt, behavior: 'smooth' });
        });
    },

    async _openTrendingMovie(movieId) {
        // ✅ Sécurité : proxy tmdbUrl() — clé jamais exposée dans les requêtes réseau
        const IS_PROD = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        if (!IS_PROD && !store.apiKeys.tmdb) return;
        try {
            // Afficher un écran de chargement rapide
            ui.switchView('loading');
            renderLoadingBgLogos();
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = t('loading.movie');

            const res = await fetch(
                tmdbUrl(`/movie/${movieId}`, { language: tmdbService.lang, append_to_response: 'watch/providers' })
            );
            const m = await res.json();

            // Récupérer les providers FR
            const frProviders = m['watch/providers']?.results?.FR || {};
            const flatrate = frProviders.flatrate || [];
            const rent = frProviders.rent || [];
            const providers = flatrate.length > 0 ? flatrate : rent;

            // Afficher directement la fiche sans passer par l'IA
            this.renderResults([{
                title: m.title,
                year: m.release_date?.slice(0, 4) || '',
                genre: m.genres?.map(g => g.name).join(', ') || '',
                synopsis: m.overview || '',
                tmdb_id: m.id,
                poster_path: m.poster_path,
                match_score: Math.round((m.vote_average || 7) * 10),
                reason: `⭐ ${m.vote_average?.toFixed(1) || '?'}/10 · ${m.vote_count?.toLocaleString('fr-FR') || '?'} votes sur TMDb`,
                streaming_providers: providers.map(p => ({
                    name: p.provider_name,
                    logo: `https://image.tmdb.org/t/p/original${p.logo_path}`
                }))
            }]);
        } catch(e) {
            console.warn('Trending movie detail failed', e);
            this.goHome();
        }
    },

    // ── Onboarding interactif (3 étapes) ──
    // force=true → déclenché par auth.js au premier login utilisateur
    _initOnboarding(force = false) {
        if (!force && localStorage.getItem('cinematch_onboarded')) return;
        if (!force) return; // Ne se déclenche plus au simple chargement de page

        const steps = [
            {
                targetId: 'start-btn',
                icon: '🎬',
                title: t('onboard.0.title'),
                text: t('onboard.0.text'),
            },
            {
                targetId: 'watchlist-nav-btn',
                icon: '❤️',
                title: t('onboard.1.title'),
                text: t('onboard.1.text'),
            },
            {
                targetId: 'auth-btn',
                icon: '🧠',
                title: t('onboard.2.title'),
                text: t('onboard.2.text'),
            }
        ];

        let currentStep = 0;

        const overlay      = document.getElementById('onboarding-overlay');
        const tooltip      = document.getElementById('onboarding-tooltip');
        const tipTitle     = document.getElementById('onboarding-title');
        const tipText      = document.getElementById('onboarding-text');
        const tipNext      = document.getElementById('onboarding-next');
        const tipSkip      = document.getElementById('onboarding-skip');
        const tipIcon      = document.getElementById('onboarding-icon');
        const tipDots      = document.getElementById('onboarding-dots');
        const tipPill      = document.getElementById('onboarding-step-pill');
        const highlight    = document.getElementById('onboarding-highlight');
        const bounceArrow  = document.getElementById('onboarding-bounce-arrow');

        if (!overlay) return;

        const updateDots = (i) => {
            if (!tipDots) return;
            [...tipDots.children].forEach((dot, idx) => dot.classList.toggle('active', idx === i));
        };

        const showStep = (i) => {
            const step   = steps[i];
            const target = document.getElementById(step.targetId);
            if (!target) { advanceStep(); return; }

            const rect = target.getBoundingClientRect();

            // Spotlight
            highlight.style.cssText = `
                position:fixed;
                left:${rect.left - 6}px; top:${rect.top - 6}px;
                width:${rect.width + 12}px; height:${rect.height + 12}px;
                border-radius:12px;
                border:2px solid rgba(229,9,20,0.9);
                pointer-events:none; z-index:9998;
                animation:onboarding-pulse 2s ease infinite;
            `;

            // Contenu
            if (tipIcon) {
                tipIcon.style.animation = 'none';
                void tipIcon.offsetWidth;
                tipIcon.textContent = step.icon;
                tipIcon.style.animation = '';
            }
            if (tipTitle) tipTitle.textContent = step.title;
            if (tipText)  tipText.textContent  = step.text;
            if (tipNext)  tipNext.textContent  = i < steps.length - 1 ? t('q.next') : t('q.letsgo');
            if (tipPill)  tipPill.textContent  = `${i + 1} / ${steps.length}`;
            updateDots(i);

            overlay.style.display = 'block';

            // Masquer pendant le repositionnement, puis fondu
            tooltip.classList.remove('visible');
            if (bounceArrow) bounceArrow.classList.remove('visible');

            // Positionner flèche + tooltip sous la cible, puis fondu
            requestAnimationFrame(() => {
                const ARROW_GAP  = 14;   // espace bouton → flèche
                const ARROW_H    = 26;   // hauteur flèche SVG
                const ARROW_GAP2 = 8;    // espace flèche → carte

                const targetCX = rect.left + rect.width / 2;

                // Flèche centrée sous le bouton, avec espace
                if (bounceArrow) {
                    bounceArrow.style.left = `${targetCX - 9}px`;
                    bounceArrow.style.top  = `${rect.bottom + ARROW_GAP}px`;
                }

                // Tooltip centré sous la flèche
                const tW = 300;
                let left = targetCX - tW / 2;
                left = Math.max(12, Math.min(left, window.innerWidth - tW - 12));
                const top = rect.bottom + ARROW_GAP + ARROW_H + ARROW_GAP2;

                tooltip.style.left = `${left}px`;
                tooltip.style.top  = `${top}px`;

                // Déclencher le fondu après un micro-délai (permet au navigateur de calculer la position)
                requestAnimationFrame(() => {
                    tooltip.classList.add('visible');
                    if (bounceArrow) bounceArrow.classList.add('visible');
                });
            });
        };

        const closeOnboarding = () => {
            tooltip.classList.remove('visible');
            if (bounceArrow) bounceArrow.classList.remove('visible');
            highlight.style.cssText = '';
            setTimeout(() => { overlay.style.display = 'none'; }, 350);
            localStorage.setItem('cinematch_onboarded', '1');
        };

        const advanceStep = () => {
            currentStep++;
            if (currentStep >= steps.length) { closeOnboarding(); return; }
            showStep(currentStep);
        };

        const skipAll = () => closeOnboarding();

        tipNext?.addEventListener('click', advanceStep);
        tipSkip?.addEventListener('click', skipAll);

        setTimeout(() => showStep(0), 900);
    },

    // ── Démarrage du questionnaire ──
    startFlow(keepDuoState = false) {
        // ── Gate anonyme : 1 essai gratuit À VIE → 1 recherche bonus si partage → abonnement ──
        if (!keepDuoState && !store.currentUser) {
            const trialUsed   = localStorage.getItem('anon_trial_used') === '1';
            const shareUnlock = localStorage.getItem('anon_share_unlocked') === '1';
            const bonusUsed   = localStorage.getItem('anon_bonus_used') === '1';

            if (!trialUsed) {
                // 1er essai gratuit → on laisse passer (marqué à l'affichage des résultats)
            } else if (shareUnlock && !bonusUsed) {
                // Recherche bonus débloquée par le partage → on laisse passer
            } else if (!shareUnlock) {
                // Essai consommé, pas encore partagé → propose le partage pour 1 reco de plus
                this._showShareGate();
                return;
            } else {
                // Essai + bonus partage consommés → directement la modale des prix
                this.showPricingModal('trial_ended');
                return;
            }
        }

        // ── Gate compte gratuit : connecté mais NON-Premium → abonnement requis ──
        // (ferme la faille : sans ça, créer un compte gratuit redonnait des recherches
        //  illimitées. Ex. quelqu'un qui s'inscrit pour payer puis abandonne Stripe.)
        if (!keepDuoState && store.currentUser) {
            const isPremium = store.currentUser?.user_metadata?.is_premium === true;
            if (!isPremium) {
                this.showPricingModal('trial_ended');
                return;
            }
        }

        // Fermer l'onboarding s'il est encore affiché
        const onbOverlay   = document.getElementById('onboarding-overlay');
        const onbHighlight = document.getElementById('onboarding-highlight');
        const onbTooltip   = document.getElementById('onboarding-tooltip');
        const onbArrow     = document.getElementById('onboarding-bounce-arrow');
        if (onbOverlay)   onbOverlay.style.display = 'none';
        if (onbHighlight) onbHighlight.style.cssText = '';
        if (onbTooltip)   onbTooltip.classList.remove('visible');
        if (onbArrow)     onbArrow.classList.remove('visible');
        localStorage.setItem('cinematch_onboarded', '1');

        // Nettoyer toute session sauvegardée au démarrage
        this._clearSession();
        // Vider le cache TMDB pour éviter des données obsolètes entre sessions
        tmdbService.clearDetailsCache();
        // Reset compteur anti-boucle
        store._autoRetryCount = 0;
        // Reset complet à chaque nouvelle session
        store.step = 1;
        // En mode solo, réinitialiser l'état duo et retirer les blobs
        if (!keepDuoState) {
            store.duoMode = false;
            store.duoRole = null;
            store.duoPartnerAnswers = null;
            store.duoMerged = false;
            this.removeDuoBg();
        }
        store.answers = {
            context: null,
            mood: null,
            language: null,
            duration: null,
            pace: null,
            exclude: [],
            era: null,
            lastLovedMovies: []
        };
        store.suggestedMovieIds  = [];
        store.suggestedTitles    = [];
        store.rerollCount        = 0;
        store._anonSearchCounted = false;   // reset pour la nouvelle session

        // ── Mode Duo Personne B : sauter Q1, hériter du contexte de A ──
        if (keepDuoState && store.duoMode && store.duoRole === 'B') {
            store.answers.context = store.duoPartnerAnswers?.context || 'couple';
            store.step = 2;
        }

        ui.switchView('questionnaire');
        this.renderStep();
    },

    // ── Helpers préférences permanentes → skip de questions ──
    _prefCoversQuestion(q) {
        if (!q) return false;
        const prefs = store.recoPrefs || {};
        if (q.key === 'language') {
            const origins = (prefs.origines || []).filter(o => o !== 'Monde entier');
            return origins.length > 0;
        }
        if (q.key === 'era') {
            const epoques = (prefs.epoques || []).filter(e => e !== "Peu importe l'époque");
            return epoques.length > 0;
        }
        return false;
    },

    _applyPrefToAnswer(q) {
        const prefs = store.recoPrefs || {};
        if (q.key === 'language') {
            const ORIGIN_LANG_MAP = {
                'Américain/Anglophone': 'en', 'Britannique': 'en',
                'Français': 'fr', 'Italien': 'it', 'Espagnol': 'es',
                'Allemand': 'de', 'Scandinave': 'sv', 'Coréen': 'ko',
                'Japonais': 'ja', 'Indien': 'hi', 'Latino / Brésilien': 'es',
            };
            const origins = (prefs.origines || []).filter(o => o !== 'Monde entier');
            store.answers.language = origins.length === 1 ? (ORIGIN_LANG_MAP[origins[0]] || 'any') : 'any';
            console.log(`⚡ Skip Q-langue (pref: ${origins.join(',')}) → answers.language=${store.answers.language}`);
        }
        if (q.key === 'era') {
            const ERA_MAP = {
                'Récent (2010+)': 'new',
                'Années 90-2000': 'modern',
                'Classiques (avant 1990)': 'vintage',
            };
            const epoques = (prefs.epoques || []).filter(e => e !== "Peu importe l'époque");
            store.answers.era = ERA_MAP[epoques[0]] || 'any';
            console.log(`⚡ Skip Q-époque (pref: ${epoques[0]}) → answers.era=${store.answers.era}`);
        }
    },

    // ── Helper : construit le contenu d'une étape dans le container ──
    _buildStep(q) {
        const c = ui.dom.questionContainer;
        ui.clearQuestionnaire();

        const header = document.createElement('div');
        header.innerHTML = `<h2>${q.title}</h2>${q.subtitle ? `<p class="muted">${q.subtitle}</p>` : ''}`;
        c.appendChild(header);

        if (q.type === 'search-multi') {
            this.renderSearchMulti();
        } else if (q.type === 'options' || q.type === 'options-multi') {
            this.renderOptions(q);
        } else {
            this.renderTextInput(q);
        }

        if (store.step > 1) {
            const backWrap = document.createElement('div');
            backWrap.style.cssText = 'width:100%;text-align:center;margin-top:1.2rem;padding-top:0.8rem;border-top:1px solid rgba(255,255,255,0.06);';
            const backBtn = document.createElement('button');
            backBtn.className = 'btn-back';
            backBtn.innerHTML = t('q.prev');
            backBtn.onclick = () => this.prevStep();
            backWrap.appendChild(backBtn);
            c.appendChild(backWrap);
        }
    },

    // ── Rendu de l'étape courante (avec transitions fluides) ──
    renderStep() {
        const questions  = getQuestions();
        const totalSteps = questions.length - 1;

        // Met à jour la barre de progression immédiatement (effet glissement)
        const _bar = document.getElementById('progress');
        if (_bar) _bar.style.cssText = `width:${Math.round((store.step / totalSteps) * 100)}%; height:100%; background:linear-gradient(90deg,#E50914,#ff6b6b); border-radius:10px; transition:width 0.5s cubic-bezier(0.4,0,0.2,1);`;

        // Détermine la question à afficher (boucle de skip)
        // En mode Duo : on ne skip JAMAIS les questions basées sur les préférences sauvegardées
        // → les 2 partenaires doivent répondre à toutes les questions pour que leurs choix soient fusionnés
        const applyPrefSkip = !store.duoMode;
        let q = questions[store.step];
        let keepSkipping = true;
        while (keepSkipping && q) {
            keepSkipping = false;
            if (q.showOnlyIf && !q.showOnlyIf(store.answers)) {
                keepSkipping = true;
            } else if (applyPrefSkip && this._prefCoversQuestion(q)) {
                this._applyPrefToAnswer(q);
                keepSkipping = true;
            }
            if (keepSkipping) {
                store.step++;
                if (store.step >= questions.length) {
                    if (store.duoMode && store.duoRole === 'A') this.renderDuoShare();
                    else if (store.duoMode && store.duoRole === 'B') this.processDuoResults();
                    else this.processResults();
                    return;
                }
                q = questions[store.step];
            }
        }

        if (!q) {
            if (store.duoMode && store.duoRole === 'A') this.renderDuoShare();
            else if (store.duoMode && store.duoRole === 'B') this.processDuoResults();
            else this.processResults();
            return;
        }

        const c = ui.dom.questionContainer;

        // Si le container est vide (premier affichage), on construit directement avec fade-in
        if (!c.children.length) {
            this._buildStep(q);
            c.classList.remove('q-exit', 'q-enter');
            void c.offsetWidth; // force reflow
            c.classList.add('q-enter');
            c.addEventListener('animationend', () => c.classList.remove('q-enter'), { once: true });
            return;
        }

        // Sinon : fade-out → rebuild → fade-in
        c.classList.remove('q-enter');
        c.classList.add('q-exit');
        setTimeout(() => {
            c.classList.remove('q-exit');
            this._buildStep(q);
            void c.offsetWidth; // force reflow
            c.classList.add('q-enter');
            c.addEventListener('animationend', () => c.classList.remove('q-enter'), { once: true });
        }, 190);
    },

    prevStep() {
        if (store.step > 1) {
            store.step--;
            // En mode Duo : ne jamais sauter les questions de préférences en arrière non plus
            const applyPrefSkip = !store.duoMode;
            let q = getQuestions()[store.step];
            while (store.step > 1 && q && (
                (q.showOnlyIf && !q.showOnlyIf(store.answers)) ||
                (applyPrefSkip && this._prefCoversQuestion(q))
            )) {
                store.step--;
                q = getQuestions()[store.step];
            }
            ui._scrollTop();
            this.renderStep();
        }
    },

    nextStep() {
        this._saveSession();
        if (store.step < getQuestions().length - 1) {
            store.step++;
            // Effacer la réponse de la nouvelle étape pour éviter une pré-sélection indésirable
            const nextQ = getQuestions()[store.step];
            if (nextQ?.key) {
                store.answers[nextQ.key] = nextQ.type === 'options-multi' ? [] : null;
            }
            ui._scrollTop();
            this.renderStep();
        } else if (store.duoMode && store.duoRole === 'A') {
            this.renderDuoShare();
        } else if (store.duoMode && store.duoRole === 'B') {
            this.processDuoResults();
        } else {
            this.processResults();
        }
    },

    // ── Question à options (simple ou multi) ──
    renderOptions(q) {
        const grid    = document.createElement('div');
        const isMulti = q.type === 'options-multi';
        grid.className = isMulti ? 'options-grid options-grid--multi' : 'options-grid';

        // En mode duo, masquer l'option "Seul" (on est forcément avec quelqu'un)
        const filteredOptions = (store.duoMode && q.key === 'context')
            ? q.options.filter(o => o.id !== 'alone')
            : q.options;

        filteredOptions.forEach(opt => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'option-card';
            card.dataset.id = opt.id;

            const currentVal = store.answers[q.key];
            const isSelected = isMulti
                ? (Array.isArray(currentVal) && currentVal.includes(opt.id))
                : currentVal === opt.id;
            if (isSelected) card.classList.add('selected');

            card.innerHTML = `
                <div class="icon" style="pointer-events:none;">${opt.icon || ''}</div>
                <div class="option-info" style="pointer-events:none;">
                    <span class="option-label" style="pointer-events:none;">${opt.label}</span>
                    ${opt.description ? `<p class="option-desc" style="pointer-events:none;">${opt.description}</p>` : ''}
                </div>`;

            // ── Handler de sélection ──
            // On utilise UNIQUEMENT onclick — touch-action:manipulation sur le bouton CSS
            // supprime le délai 300ms iOS sans avoir besoin de gérer touchend manuellement.
            // Les listeners touchend causent des bugs sur iOS quand des animations
            // transform sont actives (hit-boxes décalées pendant l'animation).
            card.onclick = () => {
                if (isMulti) {
                    const arr       = store.answers[q.key] || [];
                    const isNeutral = opt.id === 'none' || opt.id === 'any';
                    const maxSelect = q.maxSelect || Infinity;

                    if (isNeutral) {
                        store.answers[q.key] = [opt.id];
                        grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                        _updateMultiCounter(grid, q, 0);
                        // "Rien ne me dérange" → avance automatiquement comme une question simple
                        grid.querySelectorAll('.option-card').forEach(c => {
                            c.style.opacity = '0.4';
                            c.style.pointerEvents = 'none';
                        });
                        card.style.opacity = '1';
                        setTimeout(() => this.nextStep(), 260);
                        return;
                    } else {
                        const cleaned = arr.filter(id => id !== 'none' && id !== 'any');
                        const idx = cleaned.indexOf(opt.id);
                        if (idx > -1) {
                            cleaned.splice(idx, 1);
                            card.classList.remove('selected');
                        } else {
                            if (cleaned.length >= maxSelect) {
                                grid.classList.add('limit-reached');
                                setTimeout(() => grid.classList.remove('limit-reached'), 500);
                                return;
                            }
                            cleaned.push(opt.id);
                            card.classList.add('selected');
                        }
                        store.answers[q.key] = cleaned;
                        grid.querySelectorAll('.option-card').forEach(c => {
                            if (c.dataset.id === 'none' || c.dataset.id === 'any') c.classList.remove('selected');
                        });
                        _updateMultiCounter(grid, q, cleaned.length);
                        // Mettre à jour le bouton + hint
                        const _nextBtn = document.getElementById('multi-next-btn');
                        const _hint    = document.getElementById('multi-hint');
                        if (_nextBtn) {
                            if (cleaned.length > 0) _nextBtn.classList.add('has-selection');
                            else _nextBtn.classList.remove('has-selection');
                        }
                        if (_hint) {
                            const left = maxSelect - cleaned.length;
                            if (cleaned.length === 0) {
                                _hint.textContent = t('q.hint.empty').replace('${max}', maxSelect);
                                _hint.className = 'multi-hint';
                            } else if (left === 0) {
                                _hint.textContent = t('q.hint.complete');
                                _hint.className = 'multi-hint complete';
                            } else {
                                const isEn = getLang() === 'en';
                                _hint.textContent = isEn
                                    ? `${cleaned.length} selected · ${left} more possible`
                                    : `${cleaned.length} sélectionné${cleaned.length > 1 ? 's' : ''} · encore ${left} possible${left > 1 ? 's' : ''}`;
                                _hint.className = 'multi-hint multi-hint-pulse';
                                setTimeout(() => { if (_hint) _hint.className = 'multi-hint'; }, 400);
                            }
                        }
                    }
                } else {
                    store.answers[q.key] = opt.id;
                    card.classList.add('selected');
                    grid.querySelectorAll('.option-card').forEach(c => {
                        if (c !== card) c.style.opacity = '0.4';
                        c.style.pointerEvents = 'none';
                    });
                    setTimeout(() => this.nextStep(), 260);
                }
            };
            grid.appendChild(card);
        });

        ui.dom.questionContainer.appendChild(grid);

        if (isMulti) {
            const maxSelect = q.maxSelect || null;
            const current = (store.answers[q.key] || []).filter(id => id !== 'none' && id !== 'any').length;

            // Hint dynamique (remplace l'ancien compteur statique)
            const hint = document.createElement('p');
            hint.id = 'multi-hint';
            hint.className = 'multi-hint';
            if (current === 0) {
                hint.textContent = maxSelect
                    ? t('q.hint.empty').replace('${max}', maxSelect)
                    : t('q.hint.select');
            } else {
                const left = (maxSelect || 0) - current;
                if (left > 0) {
                    const isEn = getLang() === 'en';
                    hint.textContent = isEn
                        ? `${current} selected · ${left} more possible`
                        : `${current} sélectionné${current > 1 ? 's' : ''} · encore ${left} possible${left > 1 ? 's' : ''}`;
                } else {
                    hint.textContent = t('q.hint.complete');
                    hint.classList.add('complete');
                }
            }
            // Conserver l'ancien compteur masqué pour la fonction _updateMultiCounter
            const counter = document.createElement('p');
            counter.id = 'multi-counter';
            counter.style.display = 'none';
            ui.dom.questionContainer.appendChild(counter);
            ui.dom.questionContainer.appendChild(hint);

            const nextWrap = document.createElement('div');
            nextWrap.style.cssText = 'width:100%;display:flex;justify-content:center;margin-top:1.25rem;';
            const nextBtn = document.createElement('button');
            nextBtn.id = 'multi-next-btn';
            nextBtn.className = 'btn-primary btn-multi-next';
            nextBtn.style.cssText = 'width:auto;min-width:160px;max-width:260px;';
            nextBtn.textContent = t('q.validate');
            if (current > 0) nextBtn.classList.add('has-selection');
            nextBtn.onclick = () => this.nextStep();
            nextWrap.appendChild(nextBtn);
            ui.dom.questionContainer.appendChild(nextWrap);
        }
    },

    // ── Recherche de films de référence ──
    renderSearchMulti() {
        const group = document.createElement('div');
        group.className = 'search-group';
        group.innerHTML = `
            <div id="selected-movies" class="selected-container"></div>
            <input type="text" id="movie-search" placeholder="${t('q.search.placeholder')}" autocomplete="off">
            <div id="search-results" class="search-results"></div>
            <div id="search-footer" style="display:flex; gap:10px; margin-top:20px;">
                <button id="search-next-btn" class="btn-primary" style="flex:1; display:none;">
                    ${t('q.search.submit')} (<span id="count">0</span> film<span id="count-plural"></span>)
                </button>
                <button id="search-skip-btn" class="btn-secondary" style="flex:1;">
                    ${t('q.search.skip')}
                </button>
            </div>`;
        ui.dom.questionContainer.appendChild(group);
        this.updateSelectedUI();

        const input = document.getElementById('movie-search');
        let timeout = null;
        input.addEventListener('input', e => {
            clearTimeout(timeout);
            timeout = setTimeout(() => this.handleSearch(e.target.value), 300);
        });

        document.getElementById('search-next-btn').onclick = () => this.nextStep();
        document.getElementById('search-skip-btn').onclick = () => this.nextStep();
    },

    async handleSearch(query) {
        const resultsDiv = document.getElementById('search-results');
        // Limite atteinte : on n'affiche plus de résultats
        if (store.answers.lastLovedMovies.length >= MAX_LOVED_MOVIES) {
            resultsDiv.innerHTML = `<div class="search-limit-note">${t('q.search.limit')}</div>`;
            resultsDiv.style.display = 'flex';
            return;
        }
        if (query.length < 2) { resultsDiv.style.display = 'none'; return; }

        const data = await tmdbService.searchMovies(query);
        if (!data?.results) return;

        const filtered = data.results.filter(m => m.poster_path).slice(0, 8);
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'flex';

        filtered.forEach((movie, idx) => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.style.animation = `fadeInUp 0.3s ease ${idx * 0.04}s both`;
            item.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w185${movie.poster_path}"
                     onerror="this.src='https://via.placeholder.com/60x90?text=?'">
                <div class="search-item-info">
                    <strong>${movie.title}</strong>
                    <span>${movie.release_date?.split('-')[0] || ''}</span>
                </div>`;
            item.onclick = () => {
                if (store.answers.lastLovedMovies.length >= MAX_LOVED_MOVIES) return;
                if (!store.answers.lastLovedMovies.find(m => m.id === movie.id)) {
                    store.answers.lastLovedMovies.push(movie);
                    // ── Sauvegarde IMMÉDIATE dans "déjà vus" si connecté (5★ + vu) ──
                    if (store.currentUser) {
                        ratingsService.rate(store.currentUser.id, movie, 5, true).catch(e => console.warn('rate ref:', e));
                        historyService.save(store.currentUser.id, movie, 'référence', 100).catch(e => console.warn('history ref:', e));
                        console.log(`⭐ Film de référence "${movie.title}" enregistré dans déjà vus`);
                    }
                }
                document.getElementById('movie-search').value = '';
                resultsDiv.style.display = 'none';
                this.updateSelectedUI();
            };
            resultsDiv.appendChild(item);
        });
    },

    updateSelectedUI() {
        const container = document.getElementById('selected-movies');
        if (!container) return;
        container.innerHTML = '';

        store.answers.lastLovedMovies.forEach((m, i) => {
            const b = document.createElement('div');
            b.className = 'movie-badge';
            b.innerHTML = `${escapeHtml(m.title)} <span>×</span>`;
            b.querySelector('span').onclick = e => {
                e.stopPropagation();
                store.answers.lastLovedMovies.splice(i, 1);
                this.updateSelectedUI();
            };
            container.appendChild(b);
        });

        const count      = store.answers.lastLovedMovies.length;
        const nextBtn    = document.getElementById('search-next-btn');
        const skipBtn    = document.getElementById('search-skip-btn');
        const countEl    = document.getElementById('count');
        const pluralEl   = document.getElementById('count-plural');
        if (countEl)   countEl.textContent  = count;
        if (pluralEl)  pluralEl.textContent = count > 1 ? 's' : '';
        if (nextBtn)   nextBtn.style.display = count > 0 ? 'block' : 'none';
        if (skipBtn)   skipBtn.style.display = count > 0 ? 'none'  : 'block';

        // ── Verrou visuel quand la limite est atteinte ──
        const input = document.getElementById('movie-search');
        if (input) {
            const atLimit = count >= MAX_LOVED_MOVIES;
            input.disabled = atLimit;
            input.placeholder = atLimit ? t('q.search.limit') : t('q.search.placeholder');
            input.classList.toggle('input-locked', atLimit);
            if (atLimit) {
                const rd = document.getElementById('search-results');
                if (rd) rd.style.display = 'none';
            }
        }
    },

    // ── Traitement des résultats ──
    async processResults(isReroll = false) {
        this._clearSession();
        ui.switchView('loading');
        renderLoadingBgLogos();
        const loadingText = document.getElementById('loading-text');

        // ── D : Helper feedback visuel live ──
        // Affiche l'étape courante + sous-texte + allume les points de progression
        const setStep = (n, msg, sub = '') => {
            if (loadingText) loadingText.innerHTML = msg;
            const subEl = document.getElementById('loading-sub');
            if (subEl) subEl.textContent = sub;
            document.querySelectorAll('.lstep').forEach(el => {
                const s = Number(el.dataset.step);
                el.style.background = s <= n
                    ? (s === n ? 'var(--primary-color)' : 'rgba(255,255,255,0.55)')
                    : 'rgba(255,255,255,0.2)';
            });
        };
        // Sous-texte rotatif pendant le chargement (donne l'illusion de progression)
        let _tipTimer = null;
        const isEn = getLang() === 'en';
        const loadingTips = isEn
            ? ['We analyse style, not just genre.','Cultural resonance matters — we factor it in.','Your past ratings improve every result.','Our database covers over 900,000 films worldwide.']
            : ['On analyse le style narratif, pas juste le genre.','La résonance culturelle entre en compte dans le calcul.','Tes notes passées affinent chaque résultat.','Notre base couvre plus de 900 000 films dans le monde.'];
        let _tipIdx = 0;
        const startTips = () => {
            const subEl = document.getElementById('loading-sub');
            _tipTimer = setInterval(() => {
                if (subEl) { subEl.style.opacity = 0; setTimeout(() => { subEl.textContent = loadingTips[_tipIdx++ % loadingTips.length]; subEl.style.opacity = 1; }, 300); }
            }, 4000);
        };
        const stopTips = () => clearInterval(_tipTimer);

        // Anecdote cinéma pendant le chargement
        document.querySelectorAll('.trivia-box').forEach(el => el.remove());
        const triviaBox = document.createElement('div');
        triviaBox.className = 'trivia-box animate-pulse';
        triviaBox.innerHTML = `
            <p style="font-size:0.8rem;color:var(--primary-color);margin-bottom:0.5rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;">${t('loading.trivia')}</p>
            <p id="trivia-content">${t('loading.profil')}</p>`;
        loadingText.after(triviaBox);

        openaiService.getCinemaTrivia(getLang()).then(trivia => {
            const el = document.getElementById('trivia-content');
            if (el) el.textContent = `"${trivia}"`;
        }).catch(err => {
            console.warn('Trivia fetch failed (non-blocking):', err);
        });

        try {
            // Réinitialiser l'historique au premier appel
            if (!isReroll) {
                store.suggestedMovieIds = [];
                store.suggestedTitles   = [];
                store.rerollCount       = 0;
                // Rotation du pool : +1 à chaque nouvelle recherche → page de départ différente
                // (films frais au quotidien, même sur un créneau identique). Persisté localement.
                let _rot = parseInt(localStorage.getItem('cm_pool_rotation') || '0', 10) || 0;
                _rot = (_rot + 1) % 100000;
                localStorage.setItem('cm_pool_rotation', String(_rot));
                store.answers._poolRotation = _rot;
            }

            // ── Variante de reroll : chaque reroll explore un angle différent ──
            // En duo : toujours 'different_angle' — hidden_gem restreint trop le pool
            // et risque d'éliminer les meilleurs films de compromis (peu connus mais pas "pépites")
            // En solo : rerollCount=0 → pépites | rerollCount=1+ → angle différent
            store.answers.rerollVariant = isReroll
                ? ((store.duoMode && store.duoMerged) ? 'different_angle'
                    : (store.rerollCount === 0 ? 'hidden_gem' : 'different_angle'))
                : '';

            // ── Personnalisation : charger l'historique utilisateur (premier appel uniquement) ──
            if (store.currentUser && !isReroll) {
                try {
                    // ── Sauvegarder les films de référence (lastLovedMovies) comme déjà vus / 5 étoiles ──
                    // Ces films servent de calibrage → ils ne doivent JAMAIS être recommandés
                    const refMovies = store.answers.lastLovedMovies || [];
                    if (refMovies.length > 0) {
                        await Promise.allSettled([
                            // Sauvegarder dans ratings (seen=true + 5★) pour exclusion future
                            ...refMovies.map(m => ratingsService.rate(store.currentUser.id, m, 5, true)),
                            // Sauvegarder dans history pour apparaître dans "Mes films vus"
                            ...refMovies.map(m => historyService.save(
                                store.currentUser.id, m, 'référence', 100
                            ))
                        ]);
                        console.log(`⭐ ${refMovies.length} film(s) de référence sauvegardés dans ratings + history`);
                    }

                    const [seenHistory, seenRatings, favGenres, ratingProfile] = await Promise.all([
                        historyService.getSeenMovieIds(store.currentUser.id),
                        ratingsService.getSeenMovieIds(store.currentUser.id),
                        historyService.getFavoriteGenres(store.currentUser.id),
                        ratingsService.getRatingProfile(store.currentUser.id)
                    ]);
                    // Exclure tous les films déjà recommandés ou marqués vus
                    const allSeenIds = [...new Set([...seenHistory, ...seenRatings])];
                    // ⚠️ seenRatedMovieIds = exclusion PERMANENTE (pas de cap FIFO) — jamais recommandés
                    store.seenRatedMovieIds = [...new Set([...(store.seenRatedMovieIds || []), ...allSeenIds])];
                    // Stocker les genres favoris pour le prompt IA
                    store.answers._userFavGenres = favGenres;
                    // Stocker le profil d'apprentissage (films adorés/détestés) pour le prompt IA
                    store.answers._ratingProfile = ratingProfile;
                    if (ratingProfile?.totalRated > 0) {
                        console.log(`🎯 Profil IA : ${ratingProfile.loved.length} films adorés | ${ratingProfile.disliked.length} films peu appréciés`);
                    }
                    if (allSeenIds.length > 0 || favGenres.length > 0 || ratingProfile?.loved?.length > 0) {
                        const lovedCount = ratingProfile?.loved?.length || 0;
                        const learnMsg = lovedCount >= 3
                            ? t('loading.perso').replace('${n}', ratingProfile.totalRated)
                            : t('loading.mode');
                        console.log(`✨ Mode Personnalisé : ${favGenres.length} genres favoris | ${allSeenIds.length} films exclus | ${lovedCount} films adorés mémorisés`);
                        const refineMsg = getLang() === 'en' ? 'Your ratings refine the recommendations' : 'Tes notes affinent les recommandations';
                        loadingText.innerHTML = `${learnMsg}<br><span style="font-size:0.8rem;opacity:0.6">${refineMsg}</span>`;
                    }
                } catch(e) {
                    console.warn('Personnalisation skip (non bloquant):', e);
                }
            }

            // ── Labels lisibles pour les prompts ──
            const contextMap  = { alone: "Seul", couple: "En couple", family: "En famille", friends: "Entre amis" };
            const moodMap     = {
                "35,10751": "Rire / Comédie",
                "28,12":    "Action / Aventure",
                "53":       "Thriller / Suspense",
                "27":       "Horreur",
                "18,10749": "Émouvant / Inspirant",
                "878,9648": "SF / Mystère"
            };
            const durationMap = { short: "Court (< 1h45)", any: "Peu importe", long: "Long format (2h+)" };
            const excludeItems = {
                horror:    "Violence / Scènes traumatisantes",
                sad:       "Tristesse / Lourdeur émotionnelle",
                scary:     "Films d'horreur / Suspense angoissant",
                adult:     "Contenu adulte / Nudité explicite",
                slow:      "Films contemplatifs sans rythme",
                complex:   "Scénarios trop complexes / prise de tête",
                animation: "Films d'animation",
                teen:      "Films d'ados / Coming-of-age"
            };

            const contextLabel  = contextMap[store.answers.context]  || "Standard";
            const durationLabel = durationMap[store.answers.duration] || "Peu importe";

            // ── Sous-mood : injecter dans le moodLabel si sélectionné ──
            if (store.answers.subMoodLabel) {
                store.answers._subMoodLabel = store.answers.subMoodLabel;
            }

            // ── En mode duo : construire un moodLabel qui reflète les 2 attentes ──
            let moodLabel = moodMap[store.answers.mood] || "Standard";
            let duoMoodLabelA = null;
            let duoMoodLabelB = null;
            if (store.duoMode && store.duoMerged) {
                // Fallback robuste : _duoMoodB = mood principal (B) si non stocké séparément
                const moodA = store.answers._duoMoodA;
                const moodB = store.answers._duoMoodB || store.answers.mood;
                if (moodA) {
                    duoMoodLabelA = moodMap[moodA] || moodA;
                    duoMoodLabelB = moodMap[moodB] || moodB;
                    moodLabel = `Compromis entre "${duoMoodLabelA}" et "${duoMoodLabelB}"`;
                }
            }
            const excludeLabels = (store.answers.exclude || [])
                .map(ex => excludeItems[ex]).filter(Boolean).join(', ') || "Aucune";

            // ── Inférer le pace depuis le mood (Q4 supprimée) ──
            // Le mood implique naturellement un niveau de complexité narrative
            const inferredPace = store.answers.pace || {
                "35,10751": "easy",      // légèreté → histoire simple
                "28,12":    "any",       // action → peu importe
                "53":       "complex",   // thriller → scénario construit
                "27":       "complex",   // horreur → tension construite
                "18,10749": "complex",   // drame fort → profondeur narrative
                "878,9648": "mindblow"   // SF/mystère → complexité max
            }[store.answers.mood] || "any";
            // Injecter dans les answers pour que le scorer IA l'utilise
            store.answers.pace = inferredPace;

            // ── Origine : priorité au choix explicite de l'utilisateur ──
            // "ko" = Asiatique → accepte ko, ja, zh, cn, th...
            // "en" = Américain / anglophone, "fr" = Français / francophone
            // "any" = pas de filtre langue
            // Groupes de langues par région
            const ASIAN_LANGS  = new Set(['ko', 'ja', 'zh', 'cn', 'th', 'hi']);
            const LATINO_LANGS = new Set(['es', 'pt']);  // espagnol + portugais (Brésil)
            const LANG_GROUPS  = { ko: ASIAN_LANGS, es: LATINO_LANGS };

            let detectedLanguage = null;   // langue principale pour la Discovery TMDb
            let langFilterSet    = null;   // set de langues acceptées pour le filtre client

            if (store.answers.language && store.answers.language !== 'any') {
                const group = LANG_GROUPS[store.answers.language];
                if (group) {
                    langFilterSet    = group;
                    detectedLanguage = store.answers.language;
                } else {
                    detectedLanguage = store.answers.language;
                    langFilterSet    = new Set([store.answers.language]);
                }
                console.log(`🌍 Origine explicite : ${store.answers.language} (filter: ${[...langFilterSet].join(',')})`);
            } else {
                // Fallback : auto-détection depuis les films de référence
                const lovedLangs = (store.answers.lastLovedMovies || [])
                    .map(m => m.original_language).filter(Boolean);
                if (lovedLangs.length > 0) {
                    const freq = {};
                    lovedLangs.forEach(l => freq[l] = (freq[l] || 0) + 1);
                    const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
                    if (dominant[1] / lovedLangs.length >= 0.6) {
                        detectedLanguage = dominant[0];
                        const group = LANG_GROUPS[detectedLanguage];
                        langFilterSet = group || new Set([detectedLanguage]);
                    }
                }
                if (detectedLanguage) console.log(`🌍 Origine auto-détectée : ${detectedLanguage}`);
            }

            // ── Détecter le blend de genres depuis les films de référence ──
            // Si les films ADN sont horror-thriller (27+53), on étend la Discovery au-delà
            // du mood strict — sinon Barbarian, Nope, Smile ne rentrent jamais dans le pool
            const GENRE_MAP = {
                "35,10751": [35, 10751],  // comédie/famille
                "28,12":    [28, 12],     // action/aventure
                "53":       [53],         // thriller
                "27":       [27],         // horreur
                "18,10749": [18, 10749],  // drame/romance
                "878,9648": [878, 9648]   // SF/mystère
            };
            const moodGenres = new Set(GENRE_MAP[store.answers.mood] || []);

            // ── Mode Duo : ajouter les genres du mood de la Personne A aussi ──
            // Ex : A=Légèreté + B=Suspense → blendedGenres = [35,10751,53] au départ
            if (store.duoMode && store.duoMerged && store.answers._duoMoodA) {
                const moodGenresA = GENRE_MAP[store.answers._duoMoodA] || [];
                moodGenresA.forEach(g => moodGenres.add(g));
                console.log(`👫 Duo blend : mood A [${store.answers._duoMoodA}] + mood B [${store.answers.mood}]`);
            }

            const lovedGenres = (store.answers.lastLovedMovies || [])
                .flatMap(m => m.genre_ids || []);
            const lovedGenreFreq = {};
            lovedGenres.forEach(g => lovedGenreFreq[g] = (lovedGenreFreq[g] || 0) + 1);
            const refCount = store.answers.lastLovedMovies?.length || 0;
            // ── Règle : le mood est TOUJOURS le genre principal ──
            // L'ADN ajoute des nuances de style mais ne remplace JAMAIS le mood.
            const blendedGenres = new Set(moodGenres); // mood = base immuable

            if (refCount > 0) {
                // Ajouter les genres ADN qui COMPLÈTENT le mood (pas ceux qui le contredisent)
                // Un genre ADN "complète" s'il n'est pas l'opposé du mood principal
                const CONFLICTING = {
                    "35,10751": [27, 53],    // légèreté ≠ horreur/thriller
                    "28,12":    [],
                    "53":       [35, 10751], // thriller ≠ comédie/famille
                    "27":       [35, 10751], // horreur ≠ comédie/famille
                    "18,10749": [],
                    "878,9648": []
                };
                const conflicts = new Set(CONFLICTING[store.answers.mood] || []);
                Object.entries(lovedGenreFreq).forEach(([gId, count]) => {
                    const id = Number(gId);
                    if (count / refCount >= 0.5 && !moodGenres.has(id) && !conflicts.has(id)) {
                        blendedGenres.add(id);
                    }
                });
            }

            // Détecter si l'ADN est en conflit fort avec le mood (pour l'informer au scorer)
            const adnConflictsWithMood = refCount > 0 && (() => {
                const CONFLICTING = { "35,10751": [27,53], "53": [35,10751], "27": [35,10751] };
                const conflicts = new Set(CONFLICTING[store.answers.mood] || []);
                return Object.keys(lovedGenreFreq).some(g => conflicts.has(Number(g)));
            })();
            if (adnConflictsWithMood) console.log(`⚠️ Conflit ADN/mood détecté — mood prioritaire, ADN = style seulement`);

            // En duo : utiliser | (OU) pour que TMDb cherche des films couvrant l'un OU l'autre genre
            // → pool plus large avec des films qui peuvent mixer les deux moods
            // En solo : utiliser , (ET) pour cibler précisément le blend
            const genreSeparator = (store.duoMode && store.duoMerged) ? '|' : ',';
            const blendedGenreIds = [...blendedGenres].join(genreSeparator);
            console.log(`🎭 Genre blend: ${store.answers.mood} → [${blendedGenreIds}] (sep: "${genreSeparator}"`);

            setStep(1, isEn ? '🎬 Analysing your profile...' : '🎬 Analyse du profil cinéphile...', '');
            startTips();

            // ── Collecter les keywords ET le cast/crew des films de référence ──
            // Objectif : trouver les mots-clés de style communs, les acteurs récurrents,
            // et l'univers culturel pour cibler les bonnes recommandations
            let adnKeywordIds = [];
            let adnCastIds = [];     // IDs TMDB des acteurs clés → with_cast Discovery
            let adnCastNames = [];   // Noms lisibles → contexte culturel pour l'IA
            let adnDirectors = [];   // Réalisateurs → signal de style et d'univers

            if (store.answers.lastLovedMovies?.length > 0) {
                const [keywordMaps, castMaps] = await Promise.all([
                    Promise.all(store.answers.lastLovedMovies.map(m => tmdbService.getMovieKeywords(m.id))),
                    Promise.all(store.answers.lastLovedMovies.map(m => tmdbService.getMovieCastAndCrew(m.id)))
                ]);

                // Keywords (inchangé)
                const freq = {};
                keywordMaps.flat().forEach(k => {
                    if (k && k.id) freq[k.id] = (freq[k.id] || 0) + 1;
                });
                adnKeywordIds = Object.entries(freq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([id]) => id);
                console.log(`🔑 Keywords ADN collectés :`, adnKeywordIds);

                // Enrichir chaque film de référence avec cast + director (pour buildDNAArchetypes)
                castMaps.forEach((castData, i) => {
                    const movie = store.answers.lastLovedMovies[i];
                    if (movie && castData) {
                        movie._castNames = castData.castNames?.slice(0, 3) || [];
                        movie._director  = castData.director || null;
                    }
                });

                // Cast ADN : acteurs récurrents sur ≥2 films, sinon têtes d'affiche du 1er film
                const castFreq = {};
                castMaps.forEach(cd => (cd.castIds || []).forEach(id => {
                    castFreq[id] = (castFreq[id] || 0) + 1;
                }));
                const refCount2 = store.answers.lastLovedMovies.length;
                if (refCount2 >= 2) {
                    adnCastIds = Object.entries(castFreq)
                        .filter(([, c]) => c >= 2)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([id]) => Number(id));
                }
                if (adnCastIds.length === 0 && castMaps[0]?.castIds?.length > 0) {
                    adnCastIds = castMaps[0].castIds.slice(0, 2).map(Number);
                }

                // Noms des acteurs et réalisateurs — pour le contexte culturel de l'IA
                adnCastNames = [...new Set(castMaps.flatMap(cd => cd.castNames || []))].slice(0, 6);
                adnDirectors = [...new Set(castMaps.map(cd => cd.director).filter(Boolean))];

                if (adnCastIds.length > 0) console.log(`🎭 Cast ADN IDs :`, adnCastIds);
                if (adnCastNames.length > 0) console.log(`🎭 Cast ADN noms :`, adnCastNames);
                if (adnDirectors.length > 0) console.log(`🎬 Réalisateurs ADN :`, adnDirectors);
            }

            // ── ÉTAPES 1 + 2 EN PARALLÈLE — gain ~2-3 secondes ──
            // extractMetadata (OpenAI ~2-3s) et Discovery TMDB (~1s) démarrent simultanément.
            // Source 3 (suggestions IA) attend metadata — mais Sources 1+2 n'en ont pas besoin.
            setStep(1, isEn ? `🧠 AI + search running together...` : `🧠 Analyse IA + recherche en parallèle...`, moodLabel);

            // Point 10 : incrémenter rerollCount AVANT le bloc parallèle
            // → extractMetadata et getDeepRecommendations voient le bon compteur
            if (isReroll) store.rerollCount++;

            const hasProviderFilter = (store.preferredPlatforms || []).length > 0;
            const userPlatforms = store.preferredPlatforms || [];

            const [metadata, [discovered, castDiscoveredRaw], tmdbRecsResult] = await Promise.all([
                // ── Branche A : OpenAI extractMetadata ──
                openaiService.extractMetadata(
                    { ...store.answers, contextLabel, moodLabel, durationLabel, excludeLabels, detectedLanguage, blendedGenreIds },
                    isReroll,
                    store.suggestedTitles
                ),
                // ── Branche B : TMDB Sources 2 + 2b (Discovery) ──
                // N'a pas besoin de metadata — utilise directement blendedGenreIds
                Promise.all([
                    tmdbService.getAdvancedDiscovery(
                        { ...store.answers, detectedLanguage, adnKeywordIds, blendedGenreIds, _userPlatforms: userPlatforms },
                        {}, isReroll, isReroll ? store.rerollCount + 1 : 1, []
                    ),
                    hasProviderFilter
                        ? tmdbService.getAdvancedDiscovery(
                            { ...store.answers, detectedLanguage, blendedGenreIds, _userPlatforms: userPlatforms, rerollVariant: 'different_angle' },
                            {}, true, Math.floor(Math.random() * 4) + 2, []
                          )
                        : adnCastIds.length > 0
                            ? tmdbService.getAdvancedDiscovery(
                                { ...store.answers, detectedLanguage, blendedGenreIds, _userPlatforms: [] },
                                {}, false, 1, adnCastIds
                              )
                            : Promise.resolve([])
                ]),
                // ── Branche C : TMDB Source 1 (recs depuis films de référence) ──
                (!hasProviderFilter && store.answers.lastLovedMovies?.length > 0)
                    ? tmdbService.getRecommendations(store.answers.lastLovedMovies.map(m => m.id))
                    : Promise.resolve([])
            ]);

            store.aiAnalysis = metadata;
            if (metadata.cultural_universe) console.log(`🌍 Univers culturel détecté :`, metadata.cultural_universe);

            let candidates = [];
            const addUnique = (films) => {
                for (const f of films) {
                    if (f && !candidates.some(c => Number(c.id) === Number(f.id))) {
                        candidates.push(f);
                    }
                }
            };

            // Fusionner les résultats des 3 branches
            if (tmdbRecsResult.length > 0) {
                addUnique(tmdbRecsResult);
                console.log(`🎯 ${tmdbRecsResult.length} candidats via ADN TMDb`);
            }
            addUnique(discovered);
            if (castDiscoveredRaw.length > 0) {
                addUnique(castDiscoveredRaw);
                console.log(`🎭 ${castDiscoveredRaw.length} candidats via cast ADN`);
            }

            setStep(2, isEn ? '🔍 Refining with AI suggestions...' : '🔍 Affinement avec suggestions IA...');

            // SOURCE 3 : Suggestions précises de l'IA (nécessite metadata — s'exécute après)
            if (metadata.specific_suggestions?.length > 0) {
                const searches = await Promise.all(
                    metadata.specific_suggestions.map(suggTitle => tmdbService.searchMovies(suggTitle).catch(() => null))
                );
                const aiResults = searches.map(d => d?.results?.[0]).filter(Boolean)
                    .filter(f => !langFilterSet || !f.original_language || langFilterSet.has(f.original_language));
                const _activePlatforms = (store.preferredPlatforms || []).filter(p => p !== 'any');
                if (_activePlatforms.length > 0) {
                    const poolIds = new Set(candidates.map(c => Number(c.id)));
                    addUnique(aiResults.filter(f => poolIds.has(Number(f.id))));
                } else {
                    addUnique(aiResults);
                }
            }

            console.log(`📡 Pool total : ${candidates.length} candidats (ADN+Discovery+IA)`);

            // IDs des films cités en référence — à exclure absolument des recommandations
            const lovedMovieIds = (store.answers.lastLovedMovies || []).map(m => Number(m.id));

            // ── Filtrage strict — appliqué sur TOUTES les sources sans exception ──
            const eraRanges = {
                new:     { min: 2020, max: 9999 },
                modern:  { min: 2000, max: 2019 },
                vintage: { min: 1975, max: 1999 },
                retro:   { min: 0,    max: 1974 }
            };

            // ── Préférences permanentes → fusionnées dans les filtres durs ──
            const savedPrefs = store.recoPrefs || {};

            // Époque : si la session est neutre ('any'), utiliser la préférence sauvegardée
            const PREF_ERA_MAP = {
                'Récent (2010+)':           { min: 2020, max: 9999 }, // cohérent avec questionnaire ('new' = 2020+)
                'Années 90-2000':           { min: 1990, max: 2009 },
                'Classiques (avant 1990)':  { min: 0,    max: 1989 },
            };
            const sessionEra = eraRanges[store.answers.era];
            const prefEra = (savedPrefs.epoques || [])
                .map(e => PREF_ERA_MAP[e]).find(Boolean);
            const eraRange = (store.duoMode && store.duoMerged && store.answers._duoEraRange)
                ? store.answers._duoEraRange
                : (sessionEra || prefEra || null);

            // Origine : si la session est neutre ('any'), appliquer la préférence sauvegardée
            if (!langFilterSet || store.answers.language === 'any') {
                const ORIGIN_LANG_MAP = {
                    'Américain/Anglophone': ['en'],
                    'Britannique':          ['en'],
                    'Français':             ['fr'],
                    'Italien':              ['it'],
                    'Espagnol':             ['es'],
                    'Allemand':             ['de'],
                    'Scandinave':           ['sv','da','no','fi'],
                    'Coréen':               ['ko'],
                    'Japonais':             ['ja'],
                    'Indien':               ['hi'],
                    'Latino / Brésilien':   ['es','pt'],
                };
                const prefOrigines = (savedPrefs.origines || []).filter(o => o !== 'Monde entier');
                const prefLangs = prefOrigines.flatMap(o => ORIGIN_LANG_MAP[o] || []);
                if (prefLangs.length > 0) {
                    langFilterSet    = new Set(prefLangs);
                    detectedLanguage = prefLangs[0];
                    console.log(`🌍 Origine depuis préfs permanentes : ${prefOrigines.join(', ')} → [${prefLangs.join(',')}]`);
                }
            }

            // Exclusions : les préférences sauvegardées s'ajoutent toujours (filtre dur absolu)
            const PREF_EXCLUDE_GENRE_MAP = {
                // Mêmes clés que le questionnaire
                horror:    [27, 53],   // Violence → Horreur + Thriller
                sad:       [18],       // Trop triste → Drame
                scary:     [27],       // Films qui font peur → Horreur
                adult:     [],         // Contenu adulte → géré via prompt IA
                slow:      [],         // Trop lent → géré via prompt IA
                complex:   [],         // Trop complexe → géré via prompt IA
                animation: [16],       // Films d'animation
                teen:      [10749, 10751], // Films d'ados → Romance ado + Famille
            };
            const prefExcludedGenreIds = (savedPrefs.exclusions || [])
                .flatMap(ex => PREF_EXCLUDE_GENRE_MAP[ex] || []);

            // Genres à exclure (session + préférences sauvegardées)
            const EXCLUDE_GENRE_MAP = {
                horror:    [27],           // Trop de violence → horreur
                sad:       [18],           // Trop triste → drame lourd
                scary:     [27],           // Films qui font peur → horreur pure seulement (53=thriller exclu du mapping — thriller ≠ "qui fait peur")
                adult:     [],             // Contenu adulte → géré via le prompt IA (pas de genre TMDb direct)
                slow:      [],             // Trop lent → géré via prompt IA
                complex:   [],             // Trop complexe → géré via prompt IA
                animation: [16],           // Films d'animation
                teen:      [16, 10751],    // Films d'ados → animation + famille (pas de genre ado direct TMDB)
                none:      []              // Rien ne me dérange
            };
            const excludedGenreIds = (store.answers.exclude || [])
                .flatMap(ex => EXCLUDE_GENRE_MAP[ex] || []);

            // Genres supplémentaires exclus pour le contexte famille
            const familyExcludedGenres = store.answers.context === 'family' ? [27, 53, 10749] : [];
            // Pour le mood Comédie : exclure Thriller(53) et Crime(80) — incompatibles avec un vrai film comique.
            // ⚠️ JAMAIS en Mode Duo : si l'autre personne veut du suspense, comédie + thriller EST le compromis
            // recherché (ex. Knives Out, Game Night). Cette exclusion vidait le pool de tout suspense.
            const isComedyMood = (store.answers.mood || '').includes('35');
            const comedyHardExclusions = (isComedyMood && !(store.duoMode && store.duoMerged)) ? [53, 80] : [];
            const allExcludedGenres = [...new Set([...excludedGenreIds, ...familyExcludedGenres, ...prefExcludedGenreIds, ...comedyHardExclusions])];

            if (prefExcludedGenreIds.length > 0) console.log(`🚫 Exclusions préfs permanentes : ${(savedPrefs.exclusions||[]).join(', ')} → genres [${prefExcludedGenreIds.join(',')}]`);

            // Genres requis (mood de l'utilisateur) — utilisé dans tous les niveaux de filtre
            const moodGenresArray = [...moodGenres];

            // ── Résolution de conflit mood/exclusions ──
            // Ex : mood=Thriller(53) + exclusion "qui fait peur"(53) → impossibilité logique
            // Règle : le MOOD prend toujours la priorité sur les exclusions
            // On retire des exclusions tout genre qui est aussi requis par le mood
            // ⚠️ On n'utilise que le genre PRINCIPAL du mood pour la détection (pas les genres secondaires)
            // Ex : mood=comédie → genre principal = 35 (comédie), 10751 (famille) = secondaire
            //      exclusion "ados" → genre 10751 → PAS un vrai conflit car comédie ≠ famille obligatoire
            const PRIMARY_MOOD_GENRE = {
                "35,10751": [35],         // comédie (35 = core, 10751 famille = secondaire)
                "28,12":    [28, 12],     // action/aventure
                "53":       [53],         // thriller
                "27":       [27],         // horreur
                "18,10749": [18, 10749],  // drame/romance
                "878,9648": [878, 9648]   // SF/mystère
            };
            const primaryMoodGenres = PRIMARY_MOOD_GENRE[store.answers.mood] || moodGenresArray;
            const conflictingExclusions = allExcludedGenres.filter(g => primaryMoodGenres.includes(g));
            const effectiveExclusions = conflictingExclusions.length > 0
                ? allExcludedGenres.filter(g => !primaryMoodGenres.includes(g))
                : allExcludedGenres;
            if (conflictingExclusions.length > 0) {
                console.warn(`⚠️ Conflit mood/exclusions détecté : genres [${conflictingExclusions.join(',')}] en conflit → mood prioritaire, exclusion ignorée pour ces genres`);
                store._moodExclusionConflict = true;
                // Retrouver le(s) label(s) d'exclusion concerné(s) pour les nommer dans la bannière
                const EXCLUDE_LABELS = {
                    horror: 'Trop violent', sad: 'Trop triste', scary: 'Films qui font peur',
                    adult: 'Contenu adulte', slow: 'Trop lent', complex: 'Trop complexe',
                    animation: 'Animation', teen: "Films d'ados"
                };
                store._moodExclusionConflictLabels = (store.answers.exclude || [])
                    .filter(ex => (EXCLUDE_GENRE_MAP[ex] || []).some(g => conflictingExclusions.includes(g)))
                    .map(ex => EXCLUDE_LABELS[ex] || ex);
            } else {
                store._moodExclusionConflict = false;
                store._moodExclusionConflictLabels = [];
            }
            // ── Garde-fou exclusions : rejette TOUT film d'un genre exclu, dans toutes les
            // passes (y compris les passes de secours qui n'appliquent pas les filtres). ──
            const _isExcludedGenre = (details) => {
                if (!effectiveExclusions.length || !details) return false;
                const gids = [
                    ...((details.genres || []).map(g => Number(g.id))),
                    ...((details.genre_ids || []).map(Number))
                ];
                return gids.some(g => effectiveExclusions.includes(g));
            };

            // ── Garde-fou ÉPOQUE : la découverte filtre déjà par époque, mais les suggestions
            // de l'IA et les recommandations des films de référence l'ignorent → des films
            // hors époque se glissaient (ex. moderne demandé → film 2024). On rejette donc tout
            // film hors de la plage demandée dans la passe principale (les passes de secours
            // n'appliquent PAS ce garde-fou pour pouvoir élargir si le pool est trop maigre). ──
            const _ERA_BOUNDS = {
                new:     { min: 2020, max: 9999 }, modern: { min: 2000, max: 2019 },
                vintage: { min: 1975, max: 1999 }, retro:  { min: 0,    max: 1974 }
            };
            const _activeEraRange = (store.duoMode && store.duoMerged && store.answers._duoEraRange)
                ? store.answers._duoEraRange
                : _ERA_BOUNDS[store.answers.era];
            const _isOutsideEra = (details) => {
                if (!_activeEraRange || !details?.release_date) return false;
                const y = parseInt(String(details.release_date).slice(0, 4), 10);
                if (!y) return false;
                return y < _activeEraRange.min || y > _activeEraRange.max;
            };

            // ── Garde-fou DISPONIBILITÉ : rejette un film regardable NULLE PART (ni en salle,
            // ni en streaming, ni en location, ni à l'achat → badge « Où voir ? »). Respecte la
            // règle « regardable le jour J ». Passe principale UNIQUEMENT (les passes de secours
            // ne l'appliquent pas → pas de risque de vider le pool). ──
            const _isWatchableNowhere = (details) => {
                if (!details) return false;
                const inTheaters = store._nowPlayingIds && store._nowPlayingIds.has(Number(details.id));
                if (inTheaters) return false;
                const fr = details['watch/providers']?.results?.FR || {};
                const hasAny = (fr.flatrate?.length || fr.rent?.length || fr.buy?.length
                              || fr.free?.length || fr.ads?.length);
                return !hasAny;
            };

            // ── Garde-fou films futurs : rejette un film dont la date de sortie est dans le
            // futur SAUF s'il est actuellement à l'affiche (now_playing). On garde donc les
            // films en salle (ex. Obsession) mais on exclut les films pas encore sortis et
            // indisponibles partout (ex. un film 2026 avec badge « Où voir ? »). ──
            const _isUnwatchableFuture = (details) => {
                if (!details || !details.release_date) return false;
                const _rel = new Date(details.release_date).getTime();
                if (!(_rel > Date.now())) return false; // déjà sorti → OK
                const _inTheaters = store._nowPlayingIds && store._nowPlayingIds.has(Number(details.id));
                return !_inTheaters; // futur ET pas en salle → pas regardable
            };

            // IDs TMDB de films explicitement interdits en contexte famille (dark/adulte malgré genre Animation ou SF)
            const FAMILY_BLACKLIST_IDS = new Set([
                38356,  // Batman: The Dark Knight Returns Part 1
                183011, // Batman: The Dark Knight Returns Part 2
                49009,  // Watchmen (film animé)
                293660, // Deadpool
                32657,  // Batman: Under the Red Hood
                263115, // Logan
                102382, // The Amazing Spider-Man 2 (violence)
                102926, // Deadpool 2
                567604, // Deadpool & Wolverine
                603,    // Matrix (violence intense, ados+)
                412656, // Chaos Walking (violence, PG-13 serré)
                37799,  // Project X (contenu adulte)
                320343, // Venom (violence)
                335983, // Venom: Let There Be Carnage
            ]);

            // IDs TMDB de films sick-lit/drame-maladie/teen-drame — filtrés si exclusion 'sad' ou 'teen' active
            const excludesSad  = (store.answers.exclude || []).includes('sad');
            const excludesTeen = (store.answers.exclude || []).includes('teen');
            const SAD_TEEN_BLACKLIST_IDS = new Set(excludesSad || excludesTeen ? [
                531309, // À deux mètres de toi (Five Feet Apart)
                264644, // Nos étoiles contraires (The Fault in Our Stars)
                296096, // The Best of Me (Une seconde chance)
                345922, // Me Before You (Avant toi)
                398181, // Everything, Everything
                298695, // Mr. Church
                410118, // À la vie (drame maladie)
                13354,  // P.S. I Love You (deuil romantique)
                67794,  // Now Is Good (drame maladie ado)
                228150, // If I Stay (drame maladie ado)
            ] : []);

            // IDs TMDB de biopics/drames humains sans romance — filtrés quand contexte couple + mood émouvant + sad exclu
            // Ces films sont émouvants mais ne sont PAS des "date movies" romantiques
            const isRomanceCoupleContext = store.answers.context === 'couple'
                && store.answers.mood === '18,10749'
                && excludesSad;
            const COUPLE_ROMANCE_BLACKLIST_IDS = new Set(isRomanceCoupleContext ? [
                1402,   // À la recherche du bonheur (The Pursuit of Happyness)
                314,    // Forrest Gump (biopic humain)
                328111, // Eddie the Eagle
                359724, // Ford v Ferrari
                9532,   // Le Discours d'un roi
                76203,  // 12 Years a Slave
                205596, // The Imitation Game
                49538,  // The Theory of Everything
                425,    // Little Miss Sunshine (comédie famille, pas romance)
            ] : []);

            // IDs TMDB de films gore/torture porn/extrêmes — filtrés quand exclusion 'horror' (Trop violent) active
            // S'applique MÊME quand le mood est Horreur (l'utilisateur veut horreur psychologique, PAS gore)
            const excludesViolence = (store.answers.exclude || []).includes('horror');
            const GORE_HORROR_BLACKLIST_IDS = new Set(excludesViolence ? [
                17609,  // Antichrist (Lars Von Trier — extrême)
                176,    // Saw (torture porn)
                1903,   // Saw II
                1905,   // Saw III
                8337,   // Hostel (torture porn)
                20322,  // Hostel: Part II
                13580,  // Martyrs (2008 — extrême)
                614917, // Terrifier
                889679, // Terrifier 2
                614916, // Terrifier 3
                49387,  // The Human Centipede
                228970, // A Serbian Film
                397422, // Raw (Grave — cannibalisme)
                591274, // Fear Street: 1978 (slasher gore)
                750822, // Fear Street: 1666
                545611, // Fear Street: 1994
                12155,  // Inside (À l'intérieur — 2007, extrême)
                11838,  // Frontier(s) (extrême)
                10929,  // Haute Tension (gore extrême)
            ] : []);

            let safeCandidates = candidates.filter(c => {
                const year = parseInt(c.release_date?.split('-')[0]) || 0;
                const genres = c.genre_ids || [];

                // Films cités en référence → jamais recommandés
                if (lovedMovieIds.includes(Number(c.id))) return false;
                // Films déjà suggérés cette session → pas de répétition
                if (store.suggestedMovieIds.includes(Number(c.id))) return false;
                // Films vus/notés dans la DB → exclusion PERMANENTE (sans cap FIFO)
                if ((store.seenRatedMovieIds || []).includes(Number(c.id))) return false;
                // Téléfilms (TV Movie genre 10770) → exclus par défaut
                if (genres.includes(10770)) return false;
                // Filtre époque → s'applique à toutes les sources
                if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) return false;
                // Filtre exclusions genres → s'applique à toutes les sources (animation, horreur, etc.)
                // Note: effectiveExclusions exclut les genres en conflit avec le mood (mood prioritaire)
                if (effectiveExclusions.length > 0 && genres.some(g => effectiveExclusions.includes(g))) return false;
                // Filtre origine — s'applique à TOUTES les sources (TMDb recs, Discovery, IA)
                // "Américain" → only en | "Français" → only fr | "Asiatique" → ko/ja/zh/cn/th/hi
                if (langFilterSet && c.original_language && !langFilterSet.has(c.original_language)) return false;
                // Filtre genre requis — le film doit avoir au moins un genre du mood demandé
                // Évite les documentaires, drames, etc. qui viennent de SOURCE 1 (recs TMDb) ou SOURCE 3 (IA)
                if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) return false;
                // ⛔ Contexte famille : blacklist films dark/adultes même si genre = Animation ou SF
                if (store.answers.context === 'family' && FAMILY_BLACKLIST_IDS.has(Number(c.id))) return false;
                // ⛔ Exclusion sad/teen : blacklist films sick-lit, drame-maladie, teen-drame
                if (SAD_TEEN_BLACKLIST_IDS.has(Number(c.id))) return false;
                // ⛔ Contexte couple + mood émouvant + sad exclu : blacklist biopics/drames humains sans romance
                if (COUPLE_ROMANCE_BLACKLIST_IDS.has(Number(c.id))) return false;
                // ⛔ Exclusion "Trop violent" : blacklist films gore/torture porn/extrêmes (même si mood = horreur)
                if (GORE_HORROR_BLACKLIST_IDS.has(Number(c.id))) return false;

                return true;
            });
            console.log(`✅ ${safeCandidates.length} candidats après filtrage | époque:${store.answers.era || 'any'} | langue:${detectedLanguage || 'any'} | exclusions:${allExcludedGenres.join(',') || 'aucune'}`);

            // Tracker les contraintes relâchées pour l'affichage utilisateur
            store._relaxedSearch = null; // null = recherche normale

            // ── FALLBACK PROGRESSIF : relâche les contraintes une par une jusqu'à toujours trouver ──

            // Niveau 1 : Discovery large sans keywords (filtres époque + langue + exclusions conservés)
            if (safeCandidates.length < 6) {
                console.log(`⚠️ Pool trop petit (${safeCandidates.length}), fallback L1 Discovery large`);
                // Fallback L1 : garde le filtre plateforme, relâche seulement les keywords
                const fb1 = await tmdbService.getAdvancedDiscovery({ ...store.answers, detectedLanguage, _userPlatforms: store.preferredPlatforms || [] }, {}, false, 1, []);
                for (const f of fb1) {
                    const year = parseInt(f.release_date?.split('-')[0]) || 0;
                    const genres = f.genre_ids || [];
                    if (lovedMovieIds.includes(Number(f.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                    if ((store.seenRatedMovieIds || []).includes(Number(f.id))) continue;
                    if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) continue;
                    if (effectiveExclusions.length > 0 && genres.some(g => effectiveExclusions.includes(g))) continue;
                    if (langFilterSet && f.original_language && !langFilterSet.has(f.original_language)) continue;
                    if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                    if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                }
                console.log(`📡 Pool L1 : ${safeCandidates.length} candidats`);
            }

            // Niveau 2 : on lâche le filtre langue SEULEMENT si l'utilisateur n'a pas choisi explicitement
            // → choix explicite (en, fr, ko, es) = respecté même en L2
            // → auto-détection ADN (language=any) = souple, peut être relâchée en L2
            if (safeCandidates.length < 6) {
                const keepLangInL2 = !!(store.answers.language && store.answers.language !== 'any');
                if (!keepLangInL2) store._relaxedSearch = 'langue';
                setStep(2, isEn ? '🌍 Expanding to all languages...' : '🌍 Élargissement toutes langues...');
                console.log(`⚠️ Pool toujours petit, fallback L2 ${keepLangInL2 ? '(langue ADN conservée)' : 'sans filtre langue'}`);
                // Fallback L2 : garde le filtre plateforme, relâche langue
                const fb2 = await tmdbService.getAdvancedDiscovery({ ...store.answers, _userPlatforms: store.preferredPlatforms || [] }, {}, false, 1, []);
                for (const f of fb2) {
                    const year = parseInt(f.release_date?.split('-')[0]) || 0;
                    const genres = f.genre_ids || [];
                    if (lovedMovieIds.includes(Number(f.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                    if ((store.seenRatedMovieIds || []).includes(Number(f.id))) continue;
                    if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) continue;
                    if (effectiveExclusions.length > 0 && genres.some(g => effectiveExclusions.includes(g))) continue;
                    // Si langue auto-détectée depuis ADN → conserver le filtre même en L2
                    if (keepLangInL2 && langFilterSet && f.original_language && !langFilterSet.has(f.original_language)) continue;
                    if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                    if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                }
                console.log(`📡 Pool L2 : ${safeCandidates.length} candidats`);
            }

            // Niveau 3 : on lâche VRAIMENT époque ET langue — seuls mood genre + exclusions conservés
            // (A1-fix : L3 ne réapplique plus eraRange/langFilterSet — il était identique à L2 avant)
            if (safeCandidates.length < 6) {
                store._relaxedSearch = 'epoque';
                setStep(2, isEn ? '📅 Expanding to all eras...' : '📅 Élargissement toutes époques...');
                // L3 : relâche les PLATEFORMES mais GARDE l'époque → films récents sans contrainte de plateforme
                console.log(`⚠️ Pool toujours petit, fallback L3 : relâche plateforme, CONSERVE époque`);
                const fb3 = await tmdbService.getAdvancedDiscovery(
                    { mood: store.answers.mood, blendedGenreIds, exclude: store.answers.exclude, _userPlatforms: [] },
                    {}, false, 1, []
                );
                for (const f of fb3) {
                    const year = parseInt(f.release_date?.split('-')[0]) || 0;
                    const genres = f.genre_ids || [];
                    if (lovedMovieIds.includes(Number(f.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                    if ((store.seenRatedMovieIds || []).includes(Number(f.id))) continue;
                    // L3 : GARDE l'époque (priorité sur la plateforme)
                    if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) continue;
                    if (store.answers.language && store.answers.language !== 'any' && langFilterSet && f.original_language && !langFilterSet.has(f.original_language)) continue;
                    if (effectiveExclusions.length > 0 && genres.some(g => effectiveExclusions.includes(g))) continue;
                    if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                    if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                }
                console.log(`📡 Pool L3 : ${safeCandidates.length} candidats`);
            }

            // Niveau 4 (nuclear) : garde uniquement le genre mood, relâche tout le reste
            if (safeCandidates.length === 0) {
                store._relaxedSearch = 'tout';
                setStep(2, isEn ? '🔄 Maximum search mode...' : '🔄 Recherche maximale en cours...');
                console.log(`🚨 Fallback NUCLEAR : genre mood conservé, époque/langue/keywords ignorés`);
                try {
                    // On garde le genre mood pour rester "dans le même esprit"
                    const nuclearPrefs = { mood: store.answers.mood, blendedGenreIds: String(moodGenresArray.join(',')), _userPlatforms: store.preferredPlatforms || [] };
                    const nuclear = await tmdbService.getAdvancedDiscovery(nuclearPrefs, {}, false, 1, []);
                    for (const f of nuclear) {
                        const genres = f.genre_ids || [];
                        if (lovedMovieIds.includes(Number(f.id))) continue;
                        if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                        if ((store.seenRatedMovieIds || []).includes(Number(f.id))) continue;
                        // Garde au moins le filtre genre requis et les exclusions
                        if (effectiveExclusions.length > 0 && genres.some(g => effectiveExclusions.includes(g))) continue;
                        if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                        if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                    }
                } catch(e) { console.error('Fallback nuclear échoué', e); }
                console.log(`📡 Pool nuclear : ${safeCandidates.length} candidats`);
            }

            // C-fix : Si pool toujours vide après nuclear ET historique chargé →
            // reset du suggestedMovieIds (mieux re-proposer un ancien film que planter)
            if (safeCandidates.length === 0 && store.suggestedMovieIds.length > 6) {
                console.warn('🔄 Pool épuisé — reset de l\'historique de session pour débloquer');
                store.suggestedMovieIds = store.suggestedMovieIds.slice(-6); // Garde seulement les 6 derniers
                store.suggestedTitles   = store.suggestedTitles.slice(-6);
                const nuclearPrefs2 = { mood: store.answers.mood, blendedGenreIds: String(moodGenresArray.join(',')), _userPlatforms: store.preferredPlatforms || [] };
                try {
                    const retryNuclear = await tmdbService.getAdvancedDiscovery(nuclearPrefs2, {}, false, 1, []);
                    for (const f of retryNuclear) {
                        const genres = f.genre_ids || [];
                        if (lovedMovieIds.includes(Number(f.id))) continue;
                        if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                        if ((store.seenRatedMovieIds || []).includes(Number(f.id))) continue;
                        if (effectiveExclusions.length > 0 && genres.some(g => effectiveExclusions.includes(g))) continue;
                        if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                        if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                    }
                } catch(e) { console.error('Reset nuclear échoué', e); }
                if (safeCandidates.length > 0) console.log(`✅ Pool débloqué après reset historique : ${safeCandidates.length} candidats`);
            }

            // Si absolument rien même après tout (vrai problème réseau ou API down)
            if (safeCandidates.length === 0) {
                stopTips();
                console.warn('🚨 Aucun candidat après tous les fallbacks — erreur réseau probable');
                const _hasPlatFilter = (store.preferredPlatforms || []).length > 0;
                const _noResultMsg = _hasPlatFilter
                    ? (getLang() === 'en' ? 'No films found on your streaming platforms for this search. Try changing your mood or platforms.' : 'Aucun film trouvé sur tes plateformes pour cette recherche. Essaie un autre mood ou change tes plateformes.')
                    : (getLang() === 'en' ? 'Network issue — please try again' : 'Problème réseau — réessaie dans un instant');
                this.renderError(_noResultMsg);
                return;
            }

            setStep(4, isEn ? '🎥 Finalising your recommendations...' : '🎥 Finalisation de tes recommandations...');
            stopTips();

            // ── Profil d'âge — injecté dans les préférences IA ──
            const ageProfile = store.userAge
                ? window.getAgeProfile?.(store.userAge) || null
                : null;

            setStep(3, isEn ? '⭐ AI selecting the best films...' : '⭐ L\'IA sélectionne les meilleurs films...');

            // ── B-fix : enrichir les 25 meilleurs candidats avec cast + réalisateur ──
            // → l'IA verra "Réal: Tim Story | Avec: Kevin Hart, Taraji P. Henson" dans le pool
            // → appels /credits en parallèle (~150ms) sur les 25 films les mieux notés
            const enrichedSafeCandidates = await tmdbService.enrichCandidatesWithCast(safeCandidates, 25);
            console.log(`🎬 Candidats enrichis avec cast : ${enrichedSafeCandidates.filter(c => c._credits).length}/25`);

            // ── Perf 11 : limiter à 40 candidats max envoyés à OpenAI ──
            // → réduit les tokens consommés, accélère la réponse, réduit le coût
            // → on garde les 40 mieux notés (qualité pondérée vote_average × log10(votes))
            const candidatesForAI = enrichedSafeCandidates.length > 40
                ? [...enrichedSafeCandidates]
                    .sort((a, b) =>
                        (b.vote_average || 0) * Math.log10((b.vote_count || 1) + 1) -
                        (a.vote_average || 0) * Math.log10((a.vote_count || 1) + 1)
                    )
                    .slice(0, 40)
                : enrichedSafeCandidates;
            console.log(`🤖 Candidats envoyés à l'IA : ${candidatesForAI.length}/${enrichedSafeCandidates.length}`);

            // ── ÉTAPE 3 : OpenAI score et classe les candidats ──
            const ranked = await openaiService.getDeepRecommendations(
                store.answers.lastLovedMovies,
                {
                    ...store.answers,
                    contextLabel, moodLabel, durationLabel, excludeLabels,
                    blendedGenreIds, adnConflictsWithMood, adnCastIds,
                    adnCastNames, adnDirectors,
                    cultural_universe: metadata.cultural_universe || '',
                    isDuoMode:        store.duoMode && store.duoMerged,
                    duoMoodLabelA,    duoMoodLabelB,
                    // Conflits duo : langue & époque
                    _duoLangA:        store.answers._duoLangA,
                    _duoLangB:        store.answers._duoLangB,
                    _duoLangConflict: store.answers._duoLangConflict,
                    _duoEraA:         store.answers._duoEraA,
                    _duoEraB:         store.answers._duoEraB,
                    _duoEraConflict:  store.answers._duoEraConflict,
                    _duoEraLabelA:    store.answers._duoEraLabelA,
                    _duoEraLabelB:    store.answers._duoEraLabelB,
                    // Plateformes préférées + préférences de reco
                    _userPlatforms:   store.preferredPlatforms || [],
                    _recoPrefs:       store.recoPrefs || {},
                    // Profil d'âge
                    _ageProfile:      ageProfile,
                },
                candidatesForAI,
                isReroll,
                [...store.suggestedMovieIds, ...lovedMovieIds],
                getLang()
            );

            if (!ranked?.length) throw new Error("Erreur de scoring IA");

            // ── Dédupliquer le ranked par tmdb_id (sécurité anti-doublon) ──
            const seenRankedIds = new Set();
            const candidateLangMap = new Map(safeCandidates.map(c => [Number(c.id), c.original_language]));
            const rankedDeduped = ranked.filter(r => {
                const id = Number(r.tmdb_id);
                if (!id || seenRankedIds.has(id)) return false;
                seenRankedIds.add(id);
                // ⛔ FILTRE LANGUE ABSOLU — dernière barrière avant affichage
                // Si l'utilisateur a choisi une langue explicite, les films d'une autre langue sont exclus du classement
                if (langFilterSet) {
                    const origLang = candidateLangMap.get(id);
                    if (origLang && !langFilterSet.has(origLang)) {
                        console.warn(`⛔ Langue filtrée (post-IA) : ${r.title || id} (${origLang}) rejeté — filtre: ${[...langFilterSet].join(',')}`);
                        return false;
                    }
                }
                return true;
            });

            // ── Mode Duo : plafond AUTO des compromis à sens unique (≤60) ──
            // Un vrai compromis doit contenir un genre de CHAQUE envie. Un film qui ne
            // couvre qu'UNE des deux personnes (ex. comédie-romance pure quand l'autre
            // veut du suspense) est plafonné à 60 et redescend → ne peut pas être #1.
            // Déterministe (basé sur les genres), pas de dépendance au jugement de l'IA.
            if (store.duoMode && store.duoMerged
                && store.answers._duoMoodA && store.answers._duoMoodA !== store.answers.mood) {
                const MOOD_COVERAGE = {
                    "35,10751": [35, 10751],
                    "28,12":    [28, 12],
                    "53":       [53, 80, 9648],   // suspense = thriller + crime + mystère
                    "27":       [27, 53],          // horreur (+ thriller)
                    "18,10749": [18, 10749],
                    "878,9648": [878, 9648]
                };
                const sideA = MOOD_COVERAGE[store.answers._duoMoodA] || [];
                const sideB = MOOD_COVERAGE[store.answers.mood] || [];
                if (sideA.length && sideB.length) {
                    const candGenreMap = new Map(safeCandidates.map(c => [
                        Number(c.id),
                        new Set([
                            ...(c.genre_ids || []).map(Number),
                            ...((c.genres || []).map(g => Number(g.id)))
                        ])
                    ]));
                    rankedDeduped.forEach(r => {
                        const g = candGenreMap.get(Number(r.tmdb_id));
                        if (!g) return;
                        const coversA = sideA.some(id => g.has(id));
                        const coversB = sideB.some(id => g.has(id));
                        r._duoOneSided = !(coversA && coversB);
                        if (r._duoOneSided) r.match_score = Math.min(r.match_score || 0, 60);
                    });
                    // Les vrais compromis (non plafonnés) remontent en tête
                    rankedDeduped.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
                    console.log(`👫 Plafond compromis Duo appliqué : ${rankedDeduped.filter(r => r._duoOneSided).length} film(s) à sens unique plafonnés à 60`);
                }
            }

            // ── Normalisation des scores avec spread contenu ──
            // Objectif : #1 affiché dans une fourchette crédible (pas un 95% figé),
            // écart max entre #1 et #3 = 15 pts. Ex : [88,74,61] → [96,90,84].
            const SPREAD_MAX = 15; // écart maximum autorisé entre #1 et le dernier affiché
            const scores = rankedDeduped.map(r => r.match_score || 0);
            const topRaw = scores[0] || 100;
            const botRaw = Math.min(...scores.slice(0, Math.min(scores.length, 5)));
            const rawRange = Math.max(topRaw - botRaw, 1);

            // Plafond décroissant selon le reroll (95, 87, 79…), MAIS le #1 reçoit
            // une petite variation déterministe (basée sur le film) → ne reste jamais
            // collé à un chiffre rond. Jamais ≥ 98 % pour rester crédible.
            const ceiling   = getMaxScore(store.rerollCount);
            const _topId    = Number(rankedDeduped[0]?.tmdb_id || rankedDeduped[0]?.id || 0);
            const _jitter   = (_topId % 7) - 4;                 // -4 … +2
            const topScore  = Math.min(97, Math.max(ceiling - 4, ceiling + _jitter));

            rankedDeduped.forEach(r => {
                const raw = r.match_score || 0;
                // Mapping linéaire compressé : topRaw → topScore, botRaw → (topScore - SPREAD_MAX)
                const normalized = topScore - ((topRaw - raw) / rawRange) * SPREAD_MAX;
                r.match_score = Math.round(Math.max(topScore - SPREAD_MAX, Math.min(topScore, normalized)));
                // Duo : un film à sens unique reste plafonné à 60 à l'affichage (la
                // normalisation ne doit pas le ré-inflater).
                if (r._duoOneSided) r.match_score = Math.min(r.match_score, 60);
            });

            // ── Récupérer les détails complets des 3 meilleurs ──
            // Deux passes : d'abord les films avec synopsis, puis on complète avec ceux sans
            const finalMovies = [];
            const noSynopsisReserve = [];

            // Construire un Set des IDs candidats valides (anti-hallucination IA)
            const validCandidateIds = new Set(safeCandidates.map(c => Number(c.id)));

            // ── Films actuellement à l'affiche (TMDB now_playing FR) — pour le filtre dispo + badge ──
            if (!store._nowPlayingIds) {
                try {
                    const _np  = await fetch(tmdbUrl('/movie/now_playing', { language: 'fr-FR', region: 'FR', page: '1' }));
                    const _npd = await _np.json();
                    store._nowPlayingIds = new Set((_npd.results || []).map(r => Number(r.id)));
                } catch (e) { store._nowPlayingIds = new Set(); }
            }

            // ── Filtre plateforme final — calculé une fois pour les deux passes ──
            const _finalPlatIds = new Set((store.preferredPlatforms || []).map(p => String(p)));
            const _checkPlatform = (details) => {
                // Pas de plateforme choisie → on garde le film (les données de dispo TMDB sont
                // trop incomplètes pour filtrer dur : ça vidait le pool et relâchait l'époque).
                // L'affichage distingue de toute façon "Au cinéma" / "Où voir ?".
                if (_finalPlatIds.size === 0) return true;
                const frFlatrate = details['watch/providers']?.results?.FR?.flatrate || [];
                if (frFlatrate.length === 0) return false; // ⛔ strict : pas de données = film rejeté
                const frAll = [
                    ...(details['watch/providers']?.results?.FR?.flatrate || []),
                    ...(details['watch/providers']?.results?.FR?.free || []),
                    ...(details['watch/providers']?.results?.FR?.ads || [])
                ].map(p => String(p.provider_id));
                const filmProvIds = new Set(frAll);
                return [..._finalPlatIds].some(id => filmProvIds.has(id));
            };

            // Réserves : no-synopsis et films rejetés par plateforme (dernier recours anti-crash)
            const platformRejected = [];

            // ── Perf 5 : précharger les détails des 8 premiers films classés en parallèle ──
            // → évite les appels séquentiels (8 × 300ms = 2.4s → ~300ms total)
            const top8Valid = rankedDeduped
                .filter(r => validCandidateIds.has(Number(r.tmdb_id)))
                .slice(0, 8);
            const preloadedDetails = await Promise.all(
                top8Valid.map(r => tmdbService.getMovieDetails(r.tmdb_id).catch(() => null))
            );
            const detailsCache = new Map(
                top8Valid.map((r, i) => [Number(r.tmdb_id), preloadedDetails[i]])
            );
            console.log(`⚡ Détails préchargés en parallèle : ${preloadedDetails.filter(Boolean).length}/${top8Valid.length}`);

            // ── PASSE 1 : sélection parmi les films classés par l'IA ──
            for (const r of rankedDeduped) {
                if (finalMovies.length >= 3) break;

                // ✅ Anti-hallucination : vérifier que l'IA n'a pas inventé un ID hors candidats
                if (!validCandidateIds.has(Number(r.tmdb_id))) {
                    console.warn(`⚠️ ID ${r.tmdb_id} absent des candidats — hallucination IA ignorée`);
                    continue;
                }

                // Perf : utiliser le cache préchargé, sinon fetch individuel pour les films hors top 8
                const details = detailsCache.get(Number(r.tmdb_id))
                    ?? await tmdbService.getMovieDetails(r.tmdb_id);
                if (!details) continue;

                // ✅ Anti-redirect TMDB
                if (Number(details.id) !== Number(r.tmdb_id)) {
                    console.warn(`⚠️ TMDB redirect : demandé ${r.tmdb_id}, reçu ${details.id} — ignoré`);
                    continue;
                }

                // ✅ Filtre langue final sur details TMDB réels (vérification ultime)
                if (langFilterSet && details.original_language && !langFilterSet.has(details.original_language)) {
                    console.warn(`⛔ Langue rejetée (details TMDB) : ${details.title} (${details.original_language}) — filtre: ${[...langFilterSet].join(',')}`);
                    continue;
                }
                // ✅ « Américain » = origine USA réelle (exclut Nollywood/UK/etc. même anglophones)
                if (!passesUSFilter(details, store.answers.language)) {
                    console.warn(`⛔ Non-US rejeté (Américain) : ${details.title} — origine: ${(details.origin_country || []).join(',') || '?'}`);
                    continue;
                }
                // ✅ Garde-fou exclusions (animation, ado…) — même en passe de secours
                if (_isExcludedGenre(details)) {
                    console.warn(`⛔ Genre exclu rejeté : ${details.title} — genres: ${(details.genres||[]).map(g=>g.id).join(',')}`);
                    continue;
                }
                // ✅ Garde-fou films futurs non regardables (pas sorti + pas en salle)
                if (_isUnwatchableFuture(details)) {
                    console.warn(`📅 Film futur non regardable rejeté : ${details.title} (${details.release_date})`);
                    continue;
                }
                // ✅ Garde-fou époque (passe principale only) : respecte la plage demandée
                if (_isOutsideEra(details)) {
                    console.warn(`🕰️ Hors époque rejeté : ${details.title} (${details.release_date}) — plage ${_activeEraRange.min}-${_activeEraRange.max}`);
                    continue;
                }
                // ✅ Garde-fou disponibilité (passe principale only) : film regardable nulle part
                if (_isWatchableNowhere(details)) {
                    console.warn(`🚫 Regardable nulle part rejeté : ${details.title} (${details.release_date})`);
                    continue;
                }
                // ✅ Double-vérification via spoken_languages pour TOUTES les langues explicites
                // Corrige les erreurs de classification TMDB (ex: film espagnol taggé 'en')
                if (langFilterSet && store.answers.language && store.answers.language !== 'any'
                    && details.spoken_languages?.length > 0) {
                    const spoken = details.spoken_languages.map(l => l.iso_639_1);
                    const hasMatch = [...langFilterSet].some(lang => spoken.includes(lang));
                    if (!hasMatch) {
                        console.warn(`⛔ spoken_languages : ${details.title} (${spoken.join(',')}) — aucune langue du filtre [${[...langFilterSet].join(',')}], rejeté`);
                        continue;
                    }
                }

                // ✅ Filtre plateforme final
                if (!_checkPlatform(details)) {
                    console.warn("⛔ Filtre final : " + details.title + " non confirmé sur tes plateformes — mis en réserve");
                    platformRejected.push({ ...details, ...r });
                    continue;
                }

                if (!details.overview || details.overview.trim().length < 10) {
                    noSynopsisReserve.push({ ...details, ...r });
                } else {
                    finalMovies.push({ ...details, ...r });
                    store.suggestedMovieIds.push(Number(r.tmdb_id));
                    store.suggestedTitles.push(details.title);
                }
            }

            // Compléter jusqu'à 3 avec les films sans synopsis si nécessaire
            while (finalMovies.length < 3 && noSynopsisReserve.length > 0) {
                const fill = noSynopsisReserve.shift();
                finalMovies.push(fill);
                store.suggestedMovieIds.push(Number(fill.tmdb_id));
                store.suggestedTitles.push(fill.title);
            }

            // ── PASSE 2 (rescue) : si encore < 3, parcourir les candidats non-classés ──
            // Filtre STRICT : pas de bénéfice du doute — un film sans data providers FR est rejeté
            if (finalMovies.length < 3) {
                console.log(`🔍 Rescue pass : ${finalMovies.length}/3 films trouvés, exploration des candidats restants...`);
                const usedIds = new Set([
                    ...rankedDeduped.map(r => Number(r.tmdb_id)),
                    ...finalMovies.map(f => Number(f.id))
                ]);
                for (const c of safeCandidates) {
                    if (finalMovies.length >= 3) break;
                    if (usedIds.has(Number(c.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(c.id))) continue;
                    if ((store.seenRatedMovieIds || []).includes(Number(c.id))) continue;
                    // ⛔ Filtre langue absolu en rescue aussi
                    if (langFilterSet && c.original_language && !langFilterSet.has(c.original_language)) continue;
                    const details = await tmdbService.getMovieDetails(c.id);
                    if (!details || Number(details.id) !== Number(c.id)) continue;
                    // Strict : même règle que passe 1 — providers vides = rejeté
                    if (!_checkPlatform(details)) continue;
                    if (!details.overview?.trim()) continue;
                    if (!passesUSFilter(details, store.answers.language)) continue;
                    if (_isExcludedGenre(details)) continue;
                    if (_isUnwatchableFuture(details)) continue;
                    finalMovies.push({ ...details, id: c.id, tmdb_id: c.id, match_score: 65 });
                    store.suggestedMovieIds.push(Number(c.id));
                    store.suggestedTitles.push(details.title);
                    usedIds.add(Number(c.id));
                }
            }

            // ── PASSE 3 (discover frais) : pool épuisé → nouveau discover plateforme ──
            // Évite d'afficher des films sans plateforme confirmée quand le pool initial est trop petit
            if (finalMovies.length < 3 && _finalPlatIds.size > 0) {
                console.log(`🔄 Pool épuisé (${finalMovies.length}/3) — nouveau discover plateforme...`);
                try {
                    const _extraPage = Math.floor(Math.random() * 5) + 2;
                    const _extraCandidates = await tmdbService.getAdvancedDiscovery(
                        { mood: store.answers.mood, blendedGenreIds, _userPlatforms: store.preferredPlatforms || [] },
                        {}, false, _extraPage, []
                    );
                    const _usedIds3 = new Set([
                        ...finalMovies.map(f => Number(f.id)),
                        ...store.suggestedMovieIds.map(Number)
                    ]);
                    for (const c of _extraCandidates) {
                        if (finalMovies.length >= 3) break;
                        if (_usedIds3.has(Number(c.id))) continue;
                        if ((store.seenRatedMovieIds || []).includes(Number(c.id))) continue;
                        // ⛔ Filtre langue absolu en passe 3 aussi
                        if (langFilterSet && c.original_language && !langFilterSet.has(c.original_language)) continue;
                        const details = await tmdbService.getMovieDetails(c.id);
                        if (!details || Number(details.id) !== Number(c.id)) continue;
                        if (!_checkPlatform(details)) continue; // strict
                        if (!details.overview?.trim()) continue;
                        if (!passesUSFilter(details, store.answers.language)) continue;
                        if (_isExcludedGenre(details)) continue;
                        if (_isUnwatchableFuture(details)) continue;
                        finalMovies.push({ ...details, id: c.id, tmdb_id: c.id, match_score: 60 });
                        store.suggestedMovieIds.push(Number(c.id));
                        store.suggestedTitles.push(details.title);
                        _usedIds3.add(Number(c.id));
                    }
                    console.log(`📡 Passe 3 : ${finalMovies.length}/3 films après discover frais`);
                } catch(_e) {
                    console.warn('Passe 3 discover échoué :', _e);
                }
            }

            // ── Affichage partiel si malgré tout < 3 confirmés sur plateforme ──
            if (finalMovies.length < 3 && _finalPlatIds.size > 0) {
                console.log("📺 " + finalMovies.length + "/3 films confirmés sur tes plateformes — affichage partiel");
            }

            // C-fix : FIFO cap — max 45 IDs gardés (≈15 rerolls × 3 films)
            // Au-delà, on retire les plus anciens pour éviter l'épuisement du pool chez les utilisateurs fidèles
            const MAX_SEEN = 45;
            if (store.suggestedMovieIds.length > MAX_SEEN) {
                store.suggestedMovieIds.splice(0, store.suggestedMovieIds.length - MAX_SEEN);
                store.suggestedTitles.splice(0, store.suggestedTitles.length - MAX_SEEN);
            }

            // Filet de sécurité : si le filtre dispo a TOUT écarté, on récupère la réserve
            // (mieux vaut afficher des films "Où voir ?" que de planter avec une erreur).
            if (!finalMovies.length && platformRejected.length) {
                console.warn('⚠️ Pool vide après filtre dispo — repli sur la réserve plateforme');
                finalMovies.push(...platformRejected.slice(0, 3));
            }
            if (!finalMovies.length) throw new Error("Impossible de récupérer les détails des films");

            // Si toujours < 3 malgré tout (pool IA trop restreint), relancer une fois max
            // Point 4 : compteur anti-boucle infinie (max 2 tentatives auto)
            if (finalMovies.length < 3 && !isReroll) {
                store._autoRetryCount = (store._autoRetryCount || 0) + 1;
                if (store._autoRetryCount <= 2) {
                    console.warn(`⚠️ Seulement ${finalMovies.length} film(s) — nouveau tirage (tentative ${store._autoRetryCount}/2)`);
                    return this.processResults(true);
                } else {
                    console.warn(`⛔ Max tentatives atteint — affichage partiel (${finalMovies.length} film(s))`);
                }
            }

            // ── Podium cohérent : trier le top affiché par score (#1 ≥ #2 ≥ #3) ──
            // Évite qu'un film plafonné (ex. compromis à sens unique à 60) se retrouve
            // affiché au-dessus d'un meilleur film (la normalisation pouvait inverser l'ordre).
            finalMovies.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

            // ── Sauvegarder les films exacts pour le partage Duo ──
            // Person A pourra afficher ces mêmes résultats sans rappeler l'IA
            if (store.duoMode && store.duoMerged) {
                try {
                    localStorage.setItem('duo_final_movies', JSON.stringify(finalMovies));
                    localStorage.setItem('duo_final_answers', JSON.stringify(store.answers));
                    // Cross-device sync : sauvegarder dans Supabase si session existe
                    if (store._duoSessionId) {
                        import('./services/supabase.js?v=12').then(({ duoSessionService }) => {
                            duoSessionService.complete(
                                store._duoSessionId,
                                store.duoNameB,
                                store.duoPersonBAnswers || {},
                                finalMovies,
                                store.answers
                            ).catch(e => console.warn('Duo session complete error:', e));
                        });
                    }
                } catch(e) {}
            }

            // ── Compléter les match_reasons manquantes (films rescue/fallback) ──
            const missingReasons = finalMovies.filter(m => !m.match_reason);
            if (missingReasons.length > 0) {
                await openaiService.generateMissingReasons(finalMovies, store.answers, getLang());
            }

            this.renderResults(finalMovies);

        } catch (e) {
            stopTips();
            console.error('CineMatch Error:', e);
            this.renderError(e.message);
        }
    },

    // ── Page d'erreur propre ──
    renderError(msg = '') {
        ui.switchView('results');
        ui._scrollTop();
        ui.dom.moviesGrid.innerHTML = `
            <div style="text-align:center;padding:3rem 1.5rem;max-width:500px;margin:0 auto;">
                <div style="font-size:3rem;margin-bottom:1rem;">😕</div>
                <h3 style="font-size:1.4rem;font-weight:800;margin-bottom:0.75rem;">
                    ${t('error.title')}
                </h3>
                <p style="color:rgba(255,255,255,0.5);font-size:0.9rem;line-height:1.6;margin-bottom:1.5rem;">
                    ${t('error.sub')}
                </p>
                ${msg ? `<p style="color:rgba(255,100,100,0.8);font-size:0.78rem;font-family:monospace;background:rgba(255,0,0,0.1);padding:8px 12px;border-radius:6px;margin-bottom:1.5rem;">🔍 ${msg}</p>` : ''}
                <button onclick="App.startFlow()" class="btn-primary" style="width:100%;margin-bottom:0.75rem;">
                    ${t('error.retry')}
                </button>
            </div>`;
    },

    // ── Rendu des cartes résultats ──
    renderResults(movies) {
        // ── Marquer la recherche anonyme consommée (résultats réellement affichés) ──
        if (!store.currentUser && !store._anonSearchCounted) {
            store._anonSearchCounted = true;
            if (localStorage.getItem('anon_trial_used') !== '1') {
                // 1er essai gratuit consommé
                localStorage.setItem('anon_trial_used', '1');
            } else if (localStorage.getItem('anon_share_unlocked') === '1'
                       && localStorage.getItem('anon_bonus_used') !== '1') {
                // Recherche bonus (débloquée par partage) consommée
                localStorage.setItem('anon_bonus_used', '1');
            }
        }
        ui.switchView('results');
        ui._scrollTop();
        // Titre adapté selon le mode
        const resultsTitle = document.querySelector('#results h2');
        if (resultsTitle) {
            if (store.duoMode && store.duoMerged) {
                const nA = store.duoNameA;
                const nB = store.duoNameB;
                resultsTitle.textContent = (nA && nB)
                    ? `${t('results.duo.title')} ${nA} & ${nB} 👫`
                    : t('results.duo.title') + ' 👫';
            } else {
                resultsTitle.textContent = t('results.title');
            }
        }

        // Badge "Recommandations personnalisées" retiré (peu utile). On conserve juste
        // la note discrète "filtré selon les plateformes" quand c'est pertinent.
        document.getElementById('personalized-badge')?.remove();
        document.getElementById('platform-note')?.remove();
        if (store.currentUser && resultsTitle) {
            const platformCount = store.preferredPlatforms?.length || 0;
            if (platformCount > 0) {
                const _pNote = document.createElement('div');
                _pNote.id = 'platform-note';
                _pNote.style.cssText = 'width:fit-content;max-width:90%;margin:0.9rem auto 0;font-size:0.72rem;color:rgba(255,255,255,0.4);text-align:center;line-height:1.4;';
                const _who = (store.duoMode && store.duoMerged) ? ` de ${store.duoNameA || 'l\'hôte'}` : '';
                _pNote.textContent = getLang() === 'en'
                    ? '🎬 Filtered to the streaming platforms on file'
                    : `🎬 Sélection filtrée selon les plateformes${_who}`;
                resultsTitle.after(_pNote);
            }
        }

        ui.dom.moviesGrid.innerHTML = '';

        // ── Bannière "conflit mood/exclusions résolu" ──
        document.getElementById('conflict-banner')?.remove();
        if (store._moodExclusionConflict) {
            const isEn = getLang() === 'en';
            const _labels = store._moodExclusionConflictLabels || [];
            const _quoted = _labels.map(l => `« ${l} »`).join(isEn ? ' & ' : ' et ');
            const conflictMsg = _labels.length > 0
                ? (isEn
                    ? `💡 Your exclusion ${_quoted} overlaps with the mood you picked. To stay true to your mood, we set it aside — your other exclusions are still applied.`
                    : `💡 Ton exclusion ${_quoted} recoupe l'humeur que tu as choisie. Pour rester fidèle à ton humeur, on l'a mise de côté — tes autres exclusions restent bien appliquées.`)
                : (isEn
                    ? '💡 We noticed a small overlap between your mood and your exclusions. Your mood took priority — your exclusions are still applied as much as possible.'
                    : '💡 Ton humeur et une de tes exclusions se chevauchaient légèrement. L\'humeur a été prioritaire — tes exclusions restent appliquées au maximum.');
            const cb = document.createElement('div');
            cb.id = 'conflict-banner';
            cb.style.cssText = `
                width:100%;max-width:860px;margin:0 auto 1rem;
                background:linear-gradient(135deg,rgba(99,179,237,0.1),rgba(49,130,206,0.07));
                border:1px solid rgba(99,179,237,0.3);border-radius:12px;
                padding:11px 18px;display:flex;align-items:center;justify-content:center;gap:10px;
                font-size:0.82rem;color:rgba(255,255,255,0.75);line-height:1.4;text-align:center;
                animation:fadeIn 0.4s ease;`;
            cb.innerHTML = `<span>${conflictMsg}</span>`;
            ui.dom.moviesGrid.before(cb);
        }

        // ── Bannière "critères relâchés" si fallback L2/L3/nuclear utilisé ──
        document.getElementById('relaxed-search-banner')?.remove();
        if (store._relaxedSearch) {
            const isEn = getLang() === 'en';
            const messages = {
                langue: isEn
                    ? '🌍 No films found in your selected language — showing similar films in other languages'
                    : '🌍 Aucun film trouvé dans la langue choisie — voici des films similaires dans d\'autres langues',
                epoque: isEn
                    ? '📅 Not enough recent films on your platforms — showing films from all eras in this style'
                    : '📅 Pas assez de films récents sur tes plateformes — voici les meilleures correspondances toutes époques',
                tout: isEn
                    ? '🎯 Your criteria were very specific — here are the closest films we found in the same spirit'
                    : '🎯 Tes critères étaient très précis — voici les films les plus proches dans le même esprit'
            };
            const msg = messages[store._relaxedSearch] || messages.tout;
            const banner = document.createElement('div');
            banner.id = 'relaxed-search-banner';
            banner.style.cssText = `
                width:100%;max-width:860px;margin:0 auto 1.5rem;
                background:linear-gradient(135deg,rgba(229,160,9,0.12),rgba(229,9,20,0.08));
                border:1px solid rgba(229,160,9,0.3);border-radius:12px;
                padding:12px 18px;display:flex;align-items:center;justify-content:center;gap:10px;
                font-size:0.82rem;color:rgba(255,255,255,0.75);line-height:1.4;text-align:center;
                animation:fadeIn 0.4s ease;`;
            banner.innerHTML = `<span>${msg}</span>`;
            ui.dom.moviesGrid.before(banner);
        }

        // Supprimer toute carte duo existante avant d'en recréer une (évite le doublon au reroll)
        document.getElementById('duo-summary-block')?.remove();

        // ── Carte résumé des deux profils (mode Duo uniquement) ──
        if (store.duoMode && store.duoMerged) {
            const moodLabels = getLang() === 'en' ? {
                "35,10751": "Light mood", "28,12":    "Adrenaline",
                "53":       "Suspense",  "27":        "Thrills",
                "18,10749": "Strong emotions", "878,9648": "Mind-bending"
            } : {
                "35,10751": "Légèreté",  "28,12":    "Adrénaline",
                "53":       "Suspense",  "27":        "Frissons",
                "18,10749": "Émotions fortes", "878,9648": "Réflexion"
            };
            const moodIcons = {
                "35,10751": "🎈", "28,12": "⚡", "53": "🕵️",
                "27": "🧟", "18,10749": "🎭", "878,9648": "👽"
            };

            const answersA = store.duoPartnerAnswers || {};
            const answersB = store.duoPersonBAnswers || {};
            const nameA    = store.duoNameA || t('duo.fallback.partner.a');
            const nameB    = store.duoNameB || t('duo.fallback.partner.b');
            const moodLabelA = moodLabels[answersA.mood] || "—";
            const moodIconA  = moodIcons[answersA.mood]  || "";
            const moodLabelB = moodLabels[answersB.mood] || "—";
            const moodIconB  = moodIcons[answersB.mood]  || "";
            const moviesA = (answersA.lastLovedMovies || []).map(m => m.title).slice(0, 2).join(' · ') || null;
            const moviesB = (answersB.lastLovedMovies || []).map(m => m.title).slice(0, 2).join(' · ') || null;

            const duoSummary = document.createElement('div');
            duoSummary.id = 'duo-summary-block';
            const isEn = getLang() === 'en';
            duoSummary.innerHTML = `
                <div class="duo-summary-card">
                    <!-- Personne A -->
                    <div class="duo-summary-person left">
                        <p class="duo-summary-label red">${nameA}</p>
                        <div class="duo-mood-pill red-pill">${moodIconA} ${moodLabelA}</div>
                        <p class="duo-summary-films">${moviesA ? `🎬 ${moviesA}` : (isEn ? 'No reference films' : 'Aucun film de référence')}</p>
                    </div>

                    <!-- Centre -->
                    <div class="duo-summary-center">
                        <div class="duo-summary-icon">🎬</div>
                        <p class="duo-vs-text">VS</p>
                    </div>

                    <!-- Personne B -->
                    <div class="duo-summary-person right">
                        <p class="duo-summary-label green">${nameB}</p>
                        <div class="duo-mood-pill green-pill">${moodIconB} ${moodLabelB}</div>
                        <p class="duo-summary-films">${moviesB ? `🎬 ${moviesB}` : (isEn ? 'No reference films' : 'Aucun film de référence')}</p>
                    </div>
                </div>`;
            ui.dom.moviesGrid.before(duoSummary);
        }

        // Stocker les films pour les fonctions rateMovie/toggleSeen
        store._lastMovies = movies;
        cacheProviderLogos(movies); // mémorise les logos colorés pour le carrousel de chargement

        movies.forEach((m, idx) => {
            // Wrapper quinconce + numéro de rang
            const wrapper = document.createElement('div');
            wrapper.className = `card-wrapper rank-${idx + 1}`;
            // Fondu professionnel — opacity seule, mouvement minimal
            wrapper.classList.add('card-bright'); // toutes les cartes démarrent lumineuses
            if (idx === 0) {
                wrapper.style.animation = 'cardReveal 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0s both';
            } else if (idx === 1) {
                wrapper.style.animation = 'cardReveal 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.15s both';
            } else {
                wrapper.style.animation = 'cardReveal 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.30s both';
            }

            const rankNum = document.createElement('div');
            rankNum.className = `card-rank-num rank-badge rank-badge-${idx + 1}`;
            const _isFr = getLang() !== 'en';
            const _isReroll = (store.rerollCount || 0) > 0;
            // 1er lot : "MATCH PARFAIT". Suggestions suivantes : "LE TOP" (plus honnête).
            const _topLabel = _isFr
                ? (_isReroll ? 'LE TOP 🔥' : 'MATCH PARFAIT 🔥')
                : (_isReroll ? 'TOP PICK 🔥' : 'PERFECT MATCH 🔥');
            const _rankLabels = [_topLabel, 'MATCH', 'MATCH'];
            rankNum.innerHTML = `
                <div class="rank-inner">
                    <div class="rank-number">${idx + 1}</div>
                    <div class="rank-label">${_rankLabels[idx]}</div>
                </div>`;
            wrapper.appendChild(rankNum);

            const card = document.createElement('div');
            card.className = 'movie-card' + (idx === 0 ? ' top-match' : '');

            // Infos providers (informatif seulement)
            const frProviders = m['watch/providers']?.results?.FR || {};
            const flatrate     = frProviders.flatrate || [];
            const rent         = frProviders.rent     || [];
            const buy          = frProviders.buy      || [];
            // Priorité d'affichage : streaming inclus > location > achat
            let rawProviders, _availKind;
            if (flatrate.length > 0)  { rawProviders = flatrate; _availKind = 'flatrate'; }
            else if (rent.length > 0) { rawProviders = rent;     _availKind = 'rent'; }
            else if (buy.length > 0)  { rawProviders = buy;      _availKind = 'buy'; }
            else                      { rawProviders = [];       _availKind = 'none'; }
            const isVOD = _availKind === 'rent' || _availKind === 'buy';
            // Trier : plateformes préférées de l'utilisateur en premier (comparaison par ID numérique)
            const _userPlatIds = new Set((store.preferredPlatforms || []).map(p => String(p)));
            const displayProviders = [...rawProviders].sort((a, b) => {
                const aOk = _userPlatIds.has(String(a.provider_id));
                const bOk = _userPlatIds.has(String(b.provider_id));
                return (bOk ? 1 : 0) - (aOk ? 1 : 0);
            });
            const jwSlug = m.title
                ? encodeURIComponent(m.title.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'-'))
                : '';
            const jwUrl = `https://www.justwatch.com/fr/recherche?q=${encodeURIComponent(m.title || '')}`;
            // "Au cinéma" = film réellement à l'affiche en ce moment (liste TMDB now_playing FR)
            const _isInTheaters = !!(store._nowPlayingIds && store._nowPlayingIds.has(Number(m.id)));
            const providersHtml = displayProviders.length > 0
                ? displayProviders.slice(0, 4).map(p => {
                    const streamUrl = STREAMING_URLS[p.provider_name]?.(m.title) || jwUrl;
                    return `<a href="${streamUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()"
                               title="Regarder sur ${escapeHtml(p.provider_name)}" class="provider-link">
                                <img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${escapeHtml(p.provider_name)}"
                                     style="width:28px;height:28px;border-radius:7px;object-fit:cover;display:block;">
                            </a>`;
                  }).join('') + (isVOD ? `<span class="vod-badge" title="${_availKind === 'buy' ? 'Disponible à l\'achat uniquement' : 'Disponible en location'}">${_availKind === 'buy' ? '💳 Achat' : 'VOD'}</span>` : '')
                : _isInTheaters
                    ? `<span class="cinema-badge" title="Encore au cinéma — pas encore disponible en streaming">🎬 Au cinéma</span>`
                    : `<a href="${jwUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()"
                          class="jw-link">📺 Où voir ?</a>`;

            // Synopsis — fallback si TMDb n'a pas de synopsis pour ce film
            const noSynopsisMsg = getLang() === 'en'
                ? 'No synopsis available for this film.'
                : 'Synopsis non disponible pour ce film.';
            const rawSynopsis   = (m.overview && m.overview.trim().length > 10) ? m.overview.trim() : noSynopsisMsg;
            const synopsis      = escapeHtml(rawSynopsis);
            const isPlaceholder = synopsis === noSynopsisMsg;
            const shortSynopsis = synopsis.length > 120 ? synopsis.substring(0, 120) + '…' : synopsis;
            const synopsisId    = `synopsis-${m.id}`;
            const synopsisHtml  = synopsis.length > 120 && !isPlaceholder
                ? `<div class="synopsis-box">
                    <p class="synopsis-text" id="${synopsisId}"
                       data-full="${synopsis.replace(/"/g,'&quot;')}"
                       data-short="${shortSynopsis.replace(/"/g,'&quot;')}">${shortSynopsis}</p>
                    <button class="synopsis-toggle" onclick="(function(btn){
                        const p=document.getElementById('${synopsisId}');
                        if(btn.textContent===t('q.readmore')){p.textContent=p.dataset.full;btn.textContent=t('q.readless');}
                        else{p.textContent=p.dataset.short+'…';btn.textContent=t('q.readmore');}
                    })(this)">${t('q.readmore')}</button>
                  </div>`
                : `<div class="synopsis-box"><p class="synopsis-text${isPlaceholder ? ' synopsis-placeholder' : ''}">${synopsis}</p></div>`;

            // Trailer — priorité VF > VOSTF > VO. Au sein de chaque groupe : officiel + récent
            // d'abord (les vidéos officielles récentes sont bien moins souvent supprimées).
            const _rank = (a, b) =>
                (Number(b.official || false) - Number(a.official || false))
                || (new Date(b.published_at || 0) - new Date(a.published_at || 0));
            const _vids = (m.videos?.results || []).filter(v => v.site === 'YouTube');
            const _isTr = v => v.type === 'Trailer' || v.type === 'Teaser';
            const _frVids  = _vids.filter(v => v.iso_639_1 === 'fr' && _isTr(v)).sort(_rank);
            const _vfVid   = _frVids.find(v => /\bvf\b|version fran|fran[çc]aise|doubl/i.test(v.name || ''));
            const _vostVid = _frVids.find(v => /vost|sous[\s-]?titr/i.test(v.name || ''));
            const _voVid   = _vids.filter(_isTr).sort(_rank)[0] || _vids[0];
            let trailerVideo, trailerVersion = '';
            if (_vfVid)            { trailerVideo = _vfVid;     trailerVersion = 'VF'; }
            else if (_vostVid)     { trailerVideo = _vostVid;   trailerVersion = 'VOSTF'; }
            else if (_frVids[0])   { trailerVideo = _frVids[0]; trailerVersion = 'VF'; }
            else if (_voVid)       { trailerVideo = _voVid;     trailerVersion = 'VO'; }
            const trailerSrc   = trailerVideo
                ? `https://www.youtube.com/embed/${trailerVideo.key}?autoplay=1`
                : null;
            const ytSearchUrl  = `https://www.youtube.com/results?search_query=${encodeURIComponent(m.title + ' ' + (m.release_date?.split('-')[0] || '') + ' ' + t('trailer.query'))}`;
            // ⚠️ Pas d'interpolation de chaîne dans onclick : les titres à apostrophe
            // (ex. "Don't Worry Darling") cassaient le handler → le clic remontait au
            // poster qui ouvrait TMDB. On passe par des data-attributes + écouteur JS.
            const trailerBtnHtml = trailerSrc
                ? `<button class="btn-trailer" data-trailer-src="${escapeHtml(trailerSrc)}" data-trailer-yt="${escapeHtml(ytSearchUrl)}">${t('trailer.play')}${trailerVersion ? ' · ' + trailerVersion : ''}</button>`
                : `<a class="btn-trailer btn-trailer-yt" href="${escapeHtml(ytSearchUrl)}" target="_blank" rel="noopener"
                    onclick="event.stopPropagation()">${t('trailer.search')}</a>`;

            // Métadonnées
            const year       = m.release_date ? m.release_date.split('-')[0] : '';
            const genres     = (m.genres || []).slice(0, 3).map(g => `<span class="genre-tag">${escapeHtml(g.name)}</span>`).join('');
            const actors     = (m.credits?.cast || []).slice(0, 3).map(a => escapeHtml(a.name)).join(' · ');

            const isInWatchlist = store.watchlist.some(w => Number(w.id) === Number(m.id));
            // Badge top-left supprimé (#2/#3 MATCH retirés)
            const _topBadge = '';
            card.innerHTML = `
                <div class="poster-container" onclick="window.open('https://www.themoviedb.org/movie/${m.id}', '_blank')">
                    <div class="poster-bg" style="background-image:url('https://image.tmdb.org/t/p/w500${m.poster_path}')"></div>
                    <div class="poster-glow"></div>
                    <img src="https://image.tmdb.org/t/p/w500${m.poster_path}" alt="${escapeHtml(m.title)}"
                         onerror="this.src='https://via.placeholder.com/500x750/1a1a1a/E50914?text=${encodeURIComponent(m.title)}'">
                    <div class="poster-overlay"></div>
                    ${trailerBtnHtml}
                    ${_topBadge}
                    <button class="watchlist-btn${isInWatchlist ? ' active' : ''}" id="wl-btn-${m.id}"
                        onclick="toggleWatchlist(event, ${m.id})" title="${isInWatchlist ? t('results.remove') : t('results.add')}">
                        <svg width="16" height="16" viewBox="0 0 24 24"
                            fill="${isInWatchlist ? 'white' : 'none'}"
                            stroke="white" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    </button>
                </div>
                <div class="movie-info">
                    <div class="movie-header">
                        <div class="title-row">
                            <h3>${escapeHtml(m.title)}</h3>
                            ${providersHtml ? `<div class="card-providers">${providersHtml}</div>` : ''}
                        </div>
                        ${genres ? `<div class="genres-row">${genres}</div>` : ''}
                        <div class="match-badge">🔥 ${m.match_score}% ${t('results.compat')}</div>
                        <div class="meta-row">
                            <span class="rating">⭐ ${(m.vote_average || 0).toFixed(1)}</span>
                            ${year ? `<span class="meta-sep">•</span><span class="year-badge">${year}</span>` : ''}
                            ${m.runtime ? `<span class="meta-sep">•</span><span class="year-badge">${m.runtime} min</span>` : ''}
                        </div>
                    </div>
                    ${actors ? `<p class="actors-row">🎬 ${actors}</p>` : ''}
                    <!-- Bouton Voir plus (mobile uniquement) -->
                    <button class="card-expand-btn" onclick="(function(btn){
                        const card=btn.closest('.movie-card');
                        const isExp=card.classList.toggle('expanded');
                        btn.innerHTML=isExp?t('btn.collapse'):t('btn.expand');
                    })(this)">${t('btn.expand')}</button>
                    <!-- Détails dépliables -->
                    <div class="card-details">
                        ${synopsisHtml}
                        <div class="ai-box">
                            <p style="font-size:0.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;
                                color:var(--primary-color);margin-bottom:5px;opacity:0.9;">
                                ${(store.duoMode && store.duoMerged)
                                    ? (getLang() === 'en' ? '✦ Why this film for you both' : '✦ Pourquoi ce film pour vous')
                                    : t('results.why')}
                            </p>
                            <p class="ai-reason">${m.match_reason ? `"${escapeHtml(m.match_reason)}"` : `"${escapeHtml(App._autoReason(m))}"`}</p>
                        </div>
                        <!-- Notation & Déjà vu (visible pour tous) -->
                        <div class="rating-row" id="rating-row-${m.id}" style="display:flex;">
                            <div class="rating-left">
                                <span class="rating-label">Notez</span>
                                <div class="rating-stars" id="stars-${m.id}">
                                    ${[1,2,3,4,5].map(n =>
                                        `<span class="star" data-val="${n}" onclick="App.rateMovie(${m.id}, ${n})">★</span>`
                                    ).join('')}
                                </div>
                            </div>
                            <button class="seen-btn" id="seen-btn-${m.id}" onclick="App.toggleSeen(${m.id})">
                                ${t('results.seen')}
                            </button>
                        </div>
                    </div>
                </div>`;

            wrapper.appendChild(card);
            ui.dom.moviesGrid.appendChild(wrapper);

            // Écouteur bande-annonce (data-attributes → pas de bug d'apostrophe dans le titre)
            const _trBtn = card.querySelector('.btn-trailer[data-trailer-src]');
            if (_trBtn) {
                _trBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    App.openTrailer(_trBtn.dataset.trailerSrc, _trBtn.dataset.trailerYt);
                });
            }

            // Sauvegarder dans l'historique si connecté
            if (store.currentUser) {
                historyService.save(store.currentUser.id, m, store.answers.mood, m.match_score);
                // Charger et afficher l'état notation existant
                this.loadMovieRating(m);
            }
        });

        // ── Spotlight #1 + assombrissement des cartes 2 et 3 après leur entrée ──
        setTimeout(() => {
            const topCard = ui.dom.moviesGrid.querySelector('.movie-card.top-match');
            const rankNum = ui.dom.moviesGrid.querySelector('.card-wrapper.rank-1 .card-rank-num');
            if (topCard) topCard.classList.add('spotlight-done');
            if (rankNum) rankNum.classList.add('rank-pulse');
        }, 1100);
        // Retirer card-bright → assombrissement très progressif
        setTimeout(() => {
            ui.dom.moviesGrid.querySelectorAll('.card-wrapper.card-bright')
                .forEach(w => w.classList.remove('card-bright'));
        }, 1700);

        // ── Bouton Partager — sous la grille, aligné à droite ──
        // Nettoyer l'ancien bouton si déjà présent (évite les duplicates au reroll)
        const _existingShare = document.getElementById('share-btn');
        if (_existingShare) _existingShare.closest('div')?.remove();
        const shareContainer = document.createElement('div');
        shareContainer.style.cssText = 'display:flex;justify-content:flex-end;width:100%;margin-top:10px;padding-right:4px;';
        const shareIcon = document.createElement('button');
        shareIcon.id = 'share-btn';
        shareIcon.title = t('results.share');
        shareIcon.style.cssText = `
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
            color:rgba(255,255,255,0.65);width:40px;height:40px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;transition:all 0.2s;backdrop-filter:blur(4px);
            -webkit-backdrop-filter:blur(4px);`;
        shareIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
        shareContainer.appendChild(shareIcon);
        ui.dom.moviesGrid.after(shareContainer);

        document.getElementById('share-btn').onclick = () => this.shareResults(movies);

        // ── Bouton reroll avec % décroissant + limite free ──
        const nextPct      = getNextScore(store.rerollCount);
        const isPremium    = store.currentUser?.user_metadata?.is_premium === true;
        const isLoggedIn   = !!store.currentUser;
        // Limites par palier : sans compte → 0, gratuit → 2, premium → 8
        const activeLimit  = isPremium ? REROLL_PREMIUM_LIMIT : (isLoggedIn ? REROLL_LOGGED_LIMIT : REROLL_FREE_LIMIT);
        const isLastRoll   = store.rerollCount >= REROLL_MAX_SCORES.length - 1;
        const rerollsLeft  = Math.max(0, activeLimit - store.rerollCount);
        const hitLimit     = store.rerollCount >= activeLimit;

        const rerollContainer = document.createElement('div');
        rerollContainer.style.cssText = 'text-align:center;width:100%;margin-top:1.5rem;margin-bottom:2.5rem;display:flex;flex-direction:column;align-items:center;gap:14px;';

        if (hitLimit) {
            // Garder le même bouton, le popup s'ouvre au clic
            rerollContainer.innerHTML = `
                <button class="btn-secondary btn-reroll-main btn-reroll-locked" id="reroll-btn" style="margin:0 auto;opacity:0.7;">
                    ${t('results.reroll')}
                </button>`;
        } else {
            // Dès le 2e reroll : on pivote vers l'intention (ajuster les critères)
            // plutôt que la loterie infinie — réduit fatigue décisionnelle / surcharge de choix.
            const nudgeAdjust  = store.rerollCount >= 2 && !isLastRoll;
            const counterHtml  = (!isLoggedIn || isPremium)
                ? ''
                : ` <span class="reroll-counter">${rerollsLeft} ${t('results.reroll.left')}${getLang() === 'fr' && rerollsLeft > 1 ? 's' : ''}</span>`;
            let actionsHtml;
            if (isLastRoll) {
                actionsHtml = `<button class="btn-secondary" style="margin:0 auto;" onclick="App.startFlow()">
                        ${t('results.redo')}
                       </button>`;
            } else if (nudgeAdjust) {
                // Bouton principal = ajuster ; reroll relégué en lien discret
                actionsHtml = `
                    <button class="btn-primary btn-reroll-main" style="margin:0 auto;" onclick="App.startFlow()">
                        ${t('results.adjust')}
                    </button>
                    <button class="reroll-more-link" id="reroll-btn" style="margin:0 auto;background:none;border:none;
                        color:#9ca3af;font-size:0.8rem;text-decoration:underline;cursor:pointer;padding:4px;">
                        ${t('results.adjust.more')}${counterHtml}
                    </button>`;
            } else {
                actionsHtml = `
                    <button class="btn-secondary btn-reroll-main" id="reroll-btn" style="margin:0 auto;">
                        ${t('results.reroll')}${counterHtml}
                    </button>
                    ${store.rerollCount === 0
                        ? `<div class="reroll-hint-badge">
                            <span class="reroll-hint-icon">✦</span>
                            <span class="reroll-hint-text">${t('results.reroll.hint')}</span>
                           </div>`
                        : ''}`;
            }
            rerollContainer.innerHTML = `
                ${store.rerollCount > 0 ? `
                    <p style="font-size:0.73rem;color:#9ca3af;margin:0;">
                        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;
                            background:#f5c518;margin-right:6px;vertical-align:middle;"></span>
                        ${isLastRoll
                            ? t('results.limit')
                            : t('results.nexttrio').replace('${pct}', nextPct)}
                    </p>` : ''}
                ${actionsHtml}`;
        }

        ui.dom.moviesGrid.appendChild(rerollContainer);

        // ── Bouton "Modifier ma recherche" toujours visible (évite de repasser par l'accueil) ──
        const modLink = document.createElement('button');
        modLink.id = 'modify-search-link';
        modLink.textContent = getLang() === 'en' ? '🔄 Edit my search' : '🔄 Modifier ma recherche';
        modLink.style.cssText = `margin:0 auto;background:none;border:1px solid rgba(255,255,255,0.15);
            color:rgba(255,255,255,0.7);font-size:0.85rem;font-weight:600;border-radius:11px;
            padding:9px 20px;cursor:pointer;display:block;transition:all 0.15s;`;
        modLink.onmouseenter = () => { modLink.style.background = 'rgba(255,255,255,0.08)'; modLink.style.color = '#fff'; };
        modLink.onmouseleave = () => { modLink.style.background = 'none'; modLink.style.color = 'rgba(255,255,255,0.7)'; };
        modLink.onclick = () => this.startFlow();
        rerollContainer.appendChild(modLink);

        const rerollBtn = document.getElementById('reroll-btn');
        if (rerollBtn) {
            if (hitLimit) {
                // « Autre suggestion » est une fonctionnalité Premium → grille de prix
                // (anonyme comme compte gratuit), avec un message dédié.
                rerollBtn.onclick = () => this.showPricingModal('reroll');
            } else if (!isLastRoll) {
                rerollBtn.onclick = () => this.processResults(true);
            }
        }

        // Force scroll top après rendu complet — triple approche pour Safari mobile
        const _forceTop = () => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            const main = document.getElementById('main-container');
            if (main) main.scrollTop = 0;
            const results = document.getElementById('results');
            if (results) results.scrollTop = 0;
        };
        requestAnimationFrame(() => requestAnimationFrame(_forceTop));
        setTimeout(_forceTop, 80);
        setTimeout(_forceTop, 250);
    },

    // ══════════════════════════════════════════
    //  MODE DUO
    // ══════════════════════════════════════════

    // Injecter le fond animé (blobs) pour les écrans duo
    injectDuoBg() {
        if (document.getElementById('duo-bg-overlay')) return; // déjà injecté
        const bg = document.createElement('div');
        bg.id = 'duo-bg-overlay';
        bg.className = 'duo-bg';
        bg.innerHTML = '<div class="duo-blob-a"></div><div class="duo-blob-b"></div><div class="duo-blob-c"></div>';
        document.body.appendChild(bg);
        document.body.classList.add('duo-active');
    },

    removeDuoBg() {
        document.getElementById('duo-bg-overlay')?.remove();
        document.body.classList.remove('duo-active');
    },

    // Démarrer le mode Duo — afficher l'écran de prénom pour Personne A
    startDuoFlow() {
        store.duoMode = true;
        store.duoRole = 'A';
        store.duoPartnerAnswers = null;
        store.duoMerged = false;
        store.duoNameA = '';
        store.duoNameB = '';
        store._duoSessionId = null; // reset session Supabase pour créer un nouveau lien

        // Nettoyer les résidus d'une session duo précédente
        localStorage.removeItem('duo_a_answers');
        localStorage.removeItem('duo_b_status');
        localStorage.removeItem('duo_final_movies');
        localStorage.removeItem('duo_final_answers');
        localStorage.removeItem('duo_b_answers');

        ui.switchView('duo-start');
        this.injectDuoBg();

        const startBtn = document.getElementById('duo-start-a-btn');
        const nameInput = document.getElementById('duo-name-a-start');

        // ── Préfill prénom — lit le nom depuis toutes les sources possibles ──
        const _getDisplayName = (user) =>
            user?.user_metadata?.name
            || user?.user_metadata?.full_name
            || document.getElementById('user-name')?.textContent?.trim()  // lu depuis la navbar
            || user?.email?.split('@')[0]
            || '';

        const _prefillName = (user) => {
            if (!nameInput || nameInput.value.trim()) return; // déjà rempli
            const n = _getDisplayName(user);
            if (n) { nameInput.value = n; nameInput.focus(); }
        };

        // Tentative immédiate (user déjà connecté)
        if (store.currentUser) _prefillName(store.currentUser);

        // Retry à 500ms et 1500ms (auth restoration async)
        const _prefillRetry1 = setTimeout(() => { if (store.currentUser) _prefillName(store.currentUser); }, 500);
        const _prefillRetry2 = setTimeout(() => { if (store.currentUser) _prefillName(store.currentUser); }, 1500);

        // Focus auto si pas encore rempli
        setTimeout(() => { if (!nameInput?.value) nameInput?.focus(); }, 300);

        // ── Si l'utilisateur se connecte / son auth se restaure pendant qu'il est sur cette page ──
        const _onLoginWhileOnDuoStart = (e) => {
            const user = e.detail?.user;
            if (!document.getElementById('duo-start')?.classList.contains('active')) return;
            document.getElementById('duo-gate-overlay')?.remove();
            _prefillName(user);
        };
        window.addEventListener('cinematch:login', _onLoginWhileOnDuoStart);
        // Nettoyage si on quitte cet écran
        document.addEventListener('cinematch:view-change', () => {
            window.removeEventListener('cinematch:login', _onLoginWhileOnDuoStart);
            clearTimeout(_prefillRetry1);
            clearTimeout(_prefillRetry2);
        }, { once: true });

        // Lancer le questionnaire au clic ou à l'appui sur Entrée
        const launch = () => {
            const isPremium = store.currentUser?.user_metadata?.is_premium === true;
            const isLoggedIn = !!store.currentUser;

            // ── Gate : Mode Duo réservé au Premium → directement la grille de prix ──
            // (couvre anonyme + compte gratuit : dans les deux cas isPremium = false ;
            //  "Choisir" lance le checkout et demande l'inscription si besoin.)
            if (!isPremium) {
                this.showPricingModal('duo');
                return;
            }

            // Validation : max 25 chars, pas de HTML/scripts
            const raw = nameInput?.value?.trim() || '';
            store.duoNameA = raw.slice(0, 25).replace(/[<>"'&]/g, '');
            this.startFlow(true);
        };
        if (startBtn) startBtn.onclick = launch;
        if (nameInput) nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') launch(); });
    },

    // Écran de partage — Personne A vient de terminer le questionnaire
    async renderDuoShare() {
        // Toujours repartir d'une session fraîche — même si _duoSessionId traîne d'une session précédente
        store._duoSessionId = null;
        localStorage.removeItem('duo_a_answers');
        localStorage.removeItem('duo_b_status');
        localStorage.removeItem('duo_final_movies');
        localStorage.removeItem('duo_final_answers');
        localStorage.removeItem('duo_b_answers');

        ui.switchView('duo-share');
        this.injectDuoBg();

        // Fonction qui génère le lien + QR (Supabase session cross-device)
        const refresh = async () => {
            const nameA = store.duoNameA || '';

            const minimalAnswers = {
                context:  store.answers.context,
                mood:     store.answers.mood,
                language: store.answers.language,
                duration: store.answers.duration,
                exclude:  store.answers.exclude,
                era:      store.answers.era,
                nameA,    // prénom inclus dans le lien
                lastLovedMovies: (store.answers.lastLovedMovies || []).map(m => ({
                    id: m.id, title: m.title,
                    release_date: m.release_date,
                    original_language: m.original_language,
                    genre_ids: m.genre_ids,
                    poster_path: m.poster_path
                }))
            };
            // URL avec session Supabase (cross-device) ou fallback base64 (même navigateur)
            let duoUrl;
            if (!store._duoSessionId) {
                try {
                    const { duoSessionService } = await import('./services/supabase.js?v=12');
                    const sessionId = await duoSessionService.create(nameA, minimalAnswers);
                    store._duoSessionId = sessionId;
                    duoUrl = `${location.origin}${location.pathname}?duo_id=${sessionId}`;
                } catch(e) {
                    console.warn('Supabase session failed, fallback base64:', e);
                    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(minimalAnswers))));
                    duoUrl = `${location.origin}${location.pathname}?duo=${encodeURIComponent(encoded)}`;
                }
            } else {
                duoUrl = `${location.origin}${location.pathname}?duo_id=${store._duoSessionId}`;
            }

            // Mettre à jour le champ lien
            const linkInput = document.getElementById('duo-share-link');
            if (linkInput) linkInput.value = duoUrl;

            // Bouton copier
            const copyBtn = document.getElementById('duo-copy-btn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(duoUrl).then(() => {
                        copyBtn.textContent = t('results.copied');
                        copyBtn.style.background = '#46d369';
                        setTimeout(() => { copyBtn.innerHTML = t('results.copylink'); copyBtn.style.background = ''; }, 2500);
                    }).catch(() => prompt('Copie ce lien :', duoUrl));
                };
            }

            // Bouton partager (Web Share API)
            const shareBtn = document.getElementById('duo-share-btn');
            if (shareBtn) {
                const nameA = store.duoNameA || t('duo.fallback.partner.name');
                if (navigator.share) {
                    shareBtn.style.display = 'inline-flex';
                    shareBtn.onclick = () => {
                        navigator.share({
                            title: 'CineMatch IA — ' + t('duo.badge'),
                            text: t('duo.invite').replace('${nameA}', nameA),
                            url: duoUrl
                        }).catch(() => {});
                    };
                } else {
                    // Fallback desktop : ouvre WhatsApp Web
                    shareBtn.style.display = 'inline-flex';
                    const waMsg = getLang() === 'en'
                        ? `🎬 CineMatch IA — ${nameA} is waiting!\nAnswer the questionnaire to find the perfect film for two:\n${duoUrl}`
                        : `🎬 CineMatch IA — ${nameA} t'attend !\nRéponds au questionnaire pour trouver le film parfait à deux :\n${duoUrl}`;
                    const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
                    shareBtn.onclick = () => window.open(waUrl, '_blank');
                }
            }
        };

        // Récupérer le prénom depuis le compte si pas encore défini
        if (!store.duoNameA && store.currentUser) {
            store.duoNameA = store.currentUser.user_metadata?.name
                || store.currentUser.email?.split('@')[0]
                || '';
        }

        // Génération initiale
        await refresh();

        // ── Bouton "Remplir ici ensemble" — même écran, même appareil ──
        const togetherBtn = document.getElementById('duo-together-btn');
        if (togetherBtn) {
            togetherBtn.onclick = () => {
                // Sauvegarder les réponses de A comme réponses du partenaire pour B
                const nameA = document.getElementById('duo-name-a')?.value?.trim() || store.duoNameA || '';
                store.duoNameA = nameA;
                store.duoPartnerAnswers = { ...store.answers, nameA };
                store.duoRole = 'B';
                // Nettoyer le flag localStorage si existant
                localStorage.removeItem('duo_b_answers');
                this.startFlow(true);
            };
        }

        // ── localStorage fallback (même appareil / "Remplir ensemble") ──
        localStorage.setItem('duo_a_answers', JSON.stringify({ ...store.answers, nameA: store.duoNameA }));
        localStorage.removeItem('duo_b_answers');
        localStorage.removeItem('duo_b_status');
        localStorage.removeItem('duo_final_movies');
        localStorage.removeItem('duo_final_answers');

        // ── Animation d'attente ──
        const waitingEl    = document.getElementById('duo-waiting-anim');
        const waitingText  = document.getElementById('duo-waiting-text');
        const nameADisplay = document.getElementById('duo-wait-name-a');
        const nameBDisplay = document.getElementById('duo-wait-name-b');
        if (nameADisplay) nameADisplay.textContent = store.duoNameA || t('duo.fallback.you');

        let _duoPollDone = false;

        // ── Callback commun : résultats reçus (Supabase OU localStorage) ──
        const onResults = ({ finalMovies, finalAnswers, bRawAnswers }) => {
            if (_duoPollDone) return;
            _duoPollDone = true;
            if (waitingEl)    waitingEl.classList.add('b-done');
            if (waitingText)  waitingText.textContent = t('duo.partner.ready');
            if (nameBDisplay) nameBDisplay.textContent = '✓';
            const readyBanner = document.getElementById('duo-partner-ready');
            if (readyBanner)  readyBanner.style.display = 'flex';
            const seeBtn = document.getElementById('duo-see-results-btn');
            if (seeBtn) {
                seeBtn.onclick = () => {
                    store.answers           = finalAnswers;
                    store.duoMode           = true;
                    store.duoMerged         = true;
                    store.duoPersonBAnswers = bRawAnswers;
                    store.duoPartnerAnswers = JSON.parse(localStorage.getItem('duo_a_answers') || '{}');
                    if (bRawAnswers.nameB)  store.duoNameB = bRawAnswers.nameB;
                    store.rerollCount       = 0;
                    store._lastMovies       = finalMovies;
                    if (finalMovies.length > 0) {
                        this.renderResults(finalMovies);
                    } else {
                        store.suggestedMovieIds = [];
                        store.suggestedTitles   = [];
                        this.processResults();
                    }
                };
            }
        };

        // ── Polling Supabase (cross-device — appareils différents) ──
        if (store._duoSessionId) {
            import('./services/supabase.js?v=12').then(({ duoSessionService }) => {
                const _supabasePoll = setInterval(async () => {
                    if (_duoPollDone) { clearInterval(_supabasePoll); return; }
                    try {
                        const session = await duoSessionService.get(store._duoSessionId);
                        if (!session) return;
                        if (session.status === 'responding' && !waitingEl?.classList.contains('b-responding')) {
                            waitingEl?.classList.add('b-responding');
                            if (waitingText)  waitingText.textContent = t('duo.partner.answering');
                            if (nameBDisplay) nameBDisplay.textContent = session.name_b
                                ? session.name_b.slice(0, 1).toUpperCase() : '✍️';
                        }
                        if (session.status === 'done' && session.final_movies?.length) {
                            clearInterval(_supabasePoll);
                            if (session.name_b) store.duoNameB = session.name_b;
                            onResults({
                                finalMovies:  session.final_movies,
                                finalAnswers: session.final_answers || {},
                                bRawAnswers:  session.b_raw_answers || {}
                            });
                        }
                    } catch(e) { console.warn('Supabase poll error:', e); }
                }, 2000);
                document.addEventListener('cinematch:view-change',
                    () => clearInterval(_supabasePoll), { once: true });
            }).catch(e => console.warn('Supabase import failed:', e));
        }

        // ── Polling localStorage (même appareil / fallback) ──
        const onStorageEvent = (e) => {
            if (_duoPollDone) return;
            if (e.key === 'duo_b_status' && e.newValue === 'responding') {
                if (!waitingEl?.classList.contains('b-responding')) {
                    waitingEl?.classList.add('b-responding');
                    if (waitingText)  waitingText.textContent = t('duo.partner.answering');
                    if (nameBDisplay) nameBDisplay.textContent = '✍️';
                }
            }
            if (e.key === 'duo_final_movies' && e.newValue) {
                try {
                    onResults({
                        finalMovies:  JSON.parse(localStorage.getItem('duo_final_movies') || '[]'),
                        finalAnswers: JSON.parse(localStorage.getItem('duo_final_answers') || '{}'),
                        bRawAnswers:  JSON.parse(localStorage.getItem('duo_b_answers') || '{}')
                    });
                } catch(err) { console.warn('duo localStorage sync error', err); }
            }
        };
        window.addEventListener('storage', onStorageEvent);

        // ── Polling de secours (Safari ne déclenche pas storage en même onglet) ──
        const _localPoll = setInterval(() => {
            if (_duoPollDone) { clearInterval(_localPoll); return; }
            const bStatus = localStorage.getItem('duo_b_status');
            if (bStatus === 'responding' && !waitingEl?.classList.contains('b-responding')) {
                waitingEl?.classList.add('b-responding');
                if (waitingText)  waitingText.textContent = t('duo.partner.answering');
                if (nameBDisplay) nameBDisplay.textContent = '✍️';
            }
            const finalMoviesRaw = localStorage.getItem('duo_final_movies');
            if (finalMoviesRaw) {
                _duoPollDone = true;
                clearInterval(_localPoll);
                onStorageEvent({ key: 'duo_final_movies', newValue: finalMoviesRaw });
            }
        }, 1500);

        // ── Timeout 15 min ──
        const DUO_TIMEOUT_MS = 15 * 60 * 1000;
        const _duoTimeout = setTimeout(() => {
            if (_duoPollDone) return;
            _duoPollDone = true;
            clearInterval(_localPoll);
            if (waitingText) waitingText.textContent = t('duo.timeout.waiting');
            const timeoutBanner = document.createElement('div');
            timeoutBanner.className = 'duo-timeout-banner';
            timeoutBanner.innerHTML = `
                <p>${t('duo.timeout.solo')}</p>
                <button class="duo-timeout-solo-btn cta-btn" onclick="location.href='/'">
                    ${t('btn.solo')}
                </button>
            `;
            const waitingContainer = document.querySelector('#duo-share .duo-card') || document.querySelector('#duo-share');
            if (waitingContainer) waitingContainer.appendChild(timeoutBanner);
        }, DUO_TIMEOUT_MS);

        // Nettoyer si on quitte cet écran
        const _stopPoll = () => { _duoPollDone = true; clearInterval(_localPoll); clearTimeout(_duoTimeout); };
        document.addEventListener('cinematch:view-change', _stopPoll, { once: true });
    },

    // Écran d'accueil — Personne B ouvre le lien
    renderDuoWelcome() {
        ui.switchView('duo-welcome');
        this.injectDuoBg();

        // Afficher le prénom de A si disponible — avec layout spécial si prénom connu
        const nameA = store.duoPartnerAnswers?.nameA || '';
        store.duoNameA = nameA;

        const welcomeCard = document.querySelector('#duo-welcome .duo-card');
        if (welcomeCard && nameA) {
            // Reconstruire le contenu de la carte pour afficher le prénom en grand
            welcomeCard.innerHTML = `
                <div class="duo-badge-pill">${t('duo.badge')}</div>
                <div class="duo-welcome-icon">🎬</div>
                <p class="duo-partner-name">${nameA}</p>
                <p class="duo-partner-waiting">${t('duo.partner.waiting.for')}</p>
                <div class="duo-divider"></div>
                <p class="duo-subtitle">${t('duo.welcome.sub')}</p>
                <div class="duo-name-field">
                    <input type="text" id="duo-name-b" placeholder="${t('duo.placeholder')}" maxlength="20" autocomplete="off">
                </div>
                <button id="duo-start-b-btn" class="btn-primary" style="margin-top:0.5rem;padding:1.1rem 3rem;font-size:1.1rem;">
                    ${t('duo.start.btn')}
                </button>
            `;
        } else {
            // Pas de prénom — garder le titre générique
            const titleEl = document.getElementById('duo-welcome-title');
            if (titleEl) titleEl.textContent = t('duo.welcome.title');
        }

        // Attacher le handler (après reconstruction éventuelle du DOM)
        setTimeout(() => {
            const startBtn = document.getElementById('duo-start-b-btn');
            const nameInputB = document.getElementById('duo-name-b');
            if (startBtn) {
                const launch = () => {
                    // Validation : prénom obligatoire
                    const raw = nameInputB?.value?.trim() || '';
                    if (!raw) {
                        if (nameInputB) {
                            nameInputB.style.borderColor = '#E50914';
                            nameInputB.placeholder = t('duo.placeholder.required') || (getLang() === 'en' ? 'Enter your name to continue' : 'Entre ton prénom pour continuer');
                            nameInputB.classList.add('shake');
                            setTimeout(() => {
                                nameInputB.style.borderColor = '';
                                nameInputB.classList.remove('shake');
                            }, 800);
                            nameInputB.focus();
                        }
                        return;
                    }
                    store.duoNameB = raw.slice(0, 25).replace(/[<>"'&]/g, '');
                    this.startFlow(true);
                };
                startBtn.onclick = launch;
                nameInputB?.addEventListener('keydown', e => { if (e.key === 'Enter') launch(); });
            }
            setTimeout(() => nameInputB?.focus(), 300);
        }, 50);
    },

    // Fusion des deux profils + lancement de processResults
    async processDuoResults() {
        // Sauvegarder les réponses B avant fusion (pour l'affichage du résumé)
        store.duoPersonBAnswers = { ...store.answers };

        const merged = this.mergeDuoProfiles(store.duoPartnerAnswers, store.answers);
        store.answers   = merged;
        store.duoMerged = true;

        // ── Signaler à Person A (autre onglet) avec le profil FUSIONNÉ ──
        // Person A utilisera ce profil exact → mêmes résultats
        try {
            // Inclure nameB dans duo_b_answers pour que Person A puisse l'afficher
            localStorage.setItem('duo_b_answers', JSON.stringify({ ...store.duoPersonBAnswers, nameB: store.duoNameB }));
            localStorage.setItem('duo_merged_answers', JSON.stringify(merged));
        } catch(e) {}

        await this.processResults();
    },

    // Fusionner intelligemment les deux profils
    mergeDuoProfiles(a, b) {

        // ── Durée : prendre la plus courte (respecter les contraintes de chacun) ──
        const durationRank = { short: 0, any: 1, long: 2 };
        const mergedDuration = (durationRank[a?.duration] ?? 1) <= (durationRank[b?.duration] ?? 1)
            ? (a?.duration || 'any')
            : (b?.duration || 'any');

        // ── Langue : logique de priorité ──
        // "any" = pas de préférence → l'autre préférence prend le dessus
        // Deux préférences différentes → any (pas de filtre TMDb), mais l'IA arbitre
        const langA = a?.language || 'any';
        const langB = b?.language || 'any';
        const aLangAny = langA === 'any';
        const bLangAny = langB === 'any';
        let mergedLanguage;
        if (aLangAny && bLangAny)       mergedLanguage = 'any';
        else if (aLangAny)               mergedLanguage = langB;   // A n'a pas de préférence → B prime
        else if (bLangAny)               mergedLanguage = langA;   // B n'a pas de préférence → A prime
        else if (langA === langB)        mergedLanguage = langA;   // même choix → garder
        else                             mergedLanguage = 'any';   // conflit réel → l'IA choisit
        const duoLangConflict = !aLangAny && !bLangAny && langA !== langB;

        // ── Époque : union des plages (compromis maximal) ──
        // Si A=récent + B=vintage → accepte 1975 à aujourd'hui. L'IA trouvera le juste milieu.
        const ERA_RANGES = {
            new:     { min: 2020, max: 9999 },
            modern:  { min: 2000, max: 2019 },
            vintage: { min: 1975, max: 1999 },
            retro:   { min: 0,    max: 1974 }
        };
        const ERA_LABELS = { new: 'récent (2020+)', modern: 'moderne (2000-2019)', vintage: 'vintage (1975-1999)', retro: 'rétro (avant 1975)', any: 'indifférent' };
        const eraA = a?.era || 'any';
        const eraB = b?.era || 'any';
        const rA = ERA_RANGES[eraA];
        const rB = ERA_RANGES[eraB];
        let mergedEra, duoEraRange;
        if (!rA && !rB)         { mergedEra = 'any'; duoEraRange = null; }
        else if (!rA)           { mergedEra = eraB;  duoEraRange = rB;   }  // A indifférent → B prime
        else if (!rB)           { mergedEra = eraA;  duoEraRange = rA;   }  // B indifférent → A prime
        else if (eraA === eraB) { mergedEra = eraA;  duoEraRange = rA;   }  // même époque
        else {
            // Conflit : union des deux plages — accepte les films des deux périodes
            mergedEra = 'any';
            duoEraRange = { min: Math.min(rA.min, rB.min), max: Math.max(rA.max, rB.max) };
        }
        const duoEraConflict = eraA !== 'any' && eraB !== 'any' && eraA !== eraB;

        // ── Exclusions : distinction entre absolues (les deux) et souples (un seul) ──
        // "none" = carte blanche → ne pas polluer les autres exclusions
        const exA = (a?.exclude || []).filter(e => e !== 'none');
        const exB = (b?.exclude || []).filter(e => e !== 'none');
        const setA = new Set(exA);
        const setB = new Set(exB);
        // Absolues : les deux personnes excluent → Score = 0 forcé dans le prompt
        const hardExclude = [...new Set([...exA.filter(e => setB.has(e))])];
        // Souples : seulement l'un des deux exclut → pénalité IA -20 pts
        const softExcludeA = exA.filter(e => !setB.has(e));
        const softExcludeB = exB.filter(e => !setA.has(e));
        // Pour compatibilité avec le reste du code (filtres TMDB, etc.) on garde l'union
        const mergedExclude = [...new Set([...exA, ...exB])];

        // ── Mood : celui de la Personne B (la "dernière" à répondre) ──
        const mergedMood = b?.mood || a?.mood;

        // ── Films de référence : interleave équitable A/B, max 3 ──
        // Ordre : A1, B1, A2 (A en premier = équitable, pas de biais vers B)
        const aMovies = a?.lastLovedMovies || [];
        const bMovies = b?.lastLovedMovies || [];
        const mergedMovies = [];
        for (let i = 0; i < Math.max(aMovies.length, bMovies.length) && mergedMovies.length < 3; i++) {
            if (aMovies[i] && mergedMovies.length < 3) mergedMovies.push(aMovies[i]);
            if (bMovies[i] && mergedMovies.length < 3) mergedMovies.push(bMovies[i]);
        }

        console.log(`👫 Fusion — Mood:${mergedMood} | Durée:${mergedDuration} | Langue:${mergedLanguage} (${langA}↔${langB}${duoLangConflict?' ⚡CONFLIT':''}) | Époque:${mergedEra}${duoEraRange?` [${duoEraRange.min}-${duoEraRange.max}]`:''} (${eraA}↔${eraB}${duoEraConflict?' ⚡CONFLIT':''})`);

        // ── Pace : inférer depuis le mood de chacun, puis chercher un compromis ──
        const PACE_FROM_MOOD = {
            "35,10751": "easy",   // comédie → facile
            "28,12":    "any",    // action → peu importe
            "53":       "any",    // thriller → peu importe
            "27":       "easy",   // horreur → facile (immersif, pas intellectuel)
            "18,10749": "any",    // émouvant → peu importe
            "878,9648": "complex" // SF/mystère → complexe
        };
        const paceA = a?.pace || PACE_FROM_MOOD[a?.mood] || "any";
        const paceB = b?.pace || PACE_FROM_MOOD[b?.mood] || "any";
        // Compromis : si conflit entre easy et complex → prendre "any" (laisser l'IA arbitrer)
        const mergedPace = paceA === paceB ? paceA : 'any';
        const duoPaceConflict = paceA !== 'any' && paceB !== 'any' && paceA !== paceB;

        return {
            context:          b?.context || a?.context || 'couple',
            mood:             mergedMood,
            language:         mergedLanguage,
            duration:         mergedDuration,
            pace:             mergedPace,
            exclude:          mergedExclude,
            era:              mergedEra,
            lastLovedMovies:  mergedMovies,
            _duoMoodA:        a?.mood,
            _duoMoodB:        b?.mood,
            // Métadonnées de conflit pour l'IA
            _duoLangA:        langA,
            _duoLangB:        langB,
            _duoLangConflict: duoLangConflict,
            _duoEraA:         eraA,
            _duoEraB:         eraB,
            _duoEraConflict:  duoEraConflict,
            _duoEraRange:     duoEraRange,
            _duoEraLabelA:    ERA_LABELS[eraA] || eraA,
            _duoEraLabelB:    ERA_LABELS[eraB] || eraB,
            // Exclusions différenciées
            _duoHardExclude:  hardExclude,   // absolues : les deux excluent → Score = 0
            _duoSoftExcludeA: softExcludeA,  // souple A : seulement A exclut → pénalité
            _duoSoftExcludeB: softExcludeB,  // souple B : seulement B exclut → pénalité
            _duoPaceA:        paceA,
            _duoPaceB:        paceB,
            _duoPaceConflict: duoPaceConflict
        };
    },

    // ── Notation d'un film (étoiles) ──
    async rateMovie(movieId, rating) {
        if (!store.currentUser) { return; }
        // Retrouver le film dans le DOM pour avoir ses infos
        const movie = store._lastMovies?.find(m => m.id === movieId);
        if (!movie) return;
        await ratingsService.rate(store.currentUser.id, movie, rating);
        // Mettre à jour visuellement
        const stars = document.querySelectorAll(`#stars-${movieId} .star`);
        stars.forEach(s => {
            const v = parseInt(s.dataset.val);
            s.classList.toggle('active', v <= rating);
        });
        // Animation micro-particles
        this._burstStars(movieId, rating);
        // Marquer comme vu automatiquement
        const seenBtn = document.getElementById(`seen-btn-${movieId}`);
        if (seenBtn) { seenBtn.classList.add('seen'); seenBtn.textContent = t('results.seen.done'); }
    },

    // ── Micro-animation burst d'étoiles ──
    _burstStars(movieId, rating) {
        const starEl = document.querySelector(`#stars-${movieId} .star[data-val="${rating}"]`);
        if (!starEl) return;
        const rect = starEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const colors = ['#f5c518', '#ffdd57', '#ff6b6b', '#ff9f43', '#fff'];
        for (let i = 0; i < 7; i++) {
            const p = document.createElement('div');
            p.className = 'star-particle';
            p.textContent = '★';
            const angle = (i / 7) * 2 * Math.PI;
            const dist  = 28 + Math.random() * 20;
            p.style.cssText = `
                position:fixed; left:${cx}px; top:${cy}px;
                color:${colors[i % colors.length]}; font-size:${11 + Math.random() * 6}px;
                pointer-events:none; z-index:99999;
                --tx:${Math.cos(angle) * dist}px; --ty:${Math.sin(angle) * dist}px;
                animation:star-burst 0.65s ease forwards;
                animation-delay:${Math.random() * 0.08}s;
            `;
            document.body.appendChild(p);
            p.addEventListener('animationend', () => p.remove());
        }
    },

    // ── Popup invitation inscription (favori / déjà vu) ──
    _showSaveGate(feature) {
        const existing = document.getElementById('save-gate-overlay');
        if (existing) existing.remove();

        const isHeart = feature === 'watchlist';
        const overlay = document.createElement('div');
        overlay.id = 'save-gate-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);
            display:flex;align-items:center;justify-content:center;padding:20px;`;
        overlay.innerHTML = `
            <div style="background:linear-gradient(160deg,#1a1a1a,#111);border-radius:20px;
                border:1px solid rgba(229,9,20,0.2);padding:32px 28px;max-width:360px;width:100%;
                text-align:center;box-shadow:0 40px 80px rgba(0,0,0,0.8);">
                <div style="font-size:2.2rem;margin-bottom:12px;">${isHeart ? '❤️' : '✅'}</div>
                <h3 style="font-size:1.15rem;font-weight:800;margin:0 0 10px;color:#fff;">
                    ${isHeart
                        ? (getLang()==='en' ? 'Save your favourites' : 'Sauvegarde tes favoris')
                        : (getLang()==='en' ? 'Track what you\'ve seen' : 'Retrouve tes films vus')
                    }
                </h3>
                <p style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin:0 0 24px;line-height:1.5;">
                    ${isHeart
                        ? (getLang()==='en' ? 'Create a free account to keep your watchlist forever across all devices.' : 'Crée un compte gratuit pour retrouver ta liste sur tous tes appareils.')
                        : (getLang()==='en' ? 'Create a free account to track films you\'ve already seen and get better recommendations.' : 'Crée un compte gratuit pour suivre les films déjà vus et affiner tes recommandations.')
                    }
                </p>
                <button id="save-gate-signup" style="width:100%;padding:14px;border-radius:50px;border:none;
                    background:linear-gradient(120deg,#e5091a 0%,#c0006e 55%,#8b00d4 100%);
                    color:#fff;font-size:0.95rem;font-weight:800;cursor:pointer;margin-bottom:10px;">
                    ${getLang()==='en' ? '🚀 Create free account' : '🚀 Créer un compte gratuit'}
                </button>
                <button id="save-gate-signin" style="width:100%;padding:12px;border-radius:50px;border:1px solid rgba(255,255,255,0.15);
                    background:transparent;color:rgba(255,255,255,0.7);font-size:0.85rem;cursor:pointer;margin-bottom:8px;">
                    ${getLang()==='en' ? 'Already have an account? Sign in' : 'Déjà un compte ? Se connecter'}
                </button>
                <button id="save-gate-close" style="background:none;border:none;color:rgba(255,255,255,0.35);
                    font-size:0.8rem;cursor:pointer;padding:4px;">
                    ${getLang()==='en' ? 'Continue without account' : 'Continuer sans compte'}
                </button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('save-gate-signup').onclick = () => {
            overlay.remove();
            import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signup'));
        };
        document.getElementById('save-gate-signin').onclick = () => {
            overlay.remove();
            import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signin'));
        };
        document.getElementById('save-gate-close').onclick = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    },

    // ── Marquer / démarquer "déjà vu" ──
    openTrailer(src, ytUrl) {
        const modal = document.getElementById('trailer-modal');
        const frame = document.getElementById('trailer-frame');
        const fb    = document.getElementById('trailer-yt-fallback');
        if (frame) frame.src = src || '';
        if (fb && ytUrl) fb.href = ytUrl;
        if (modal) modal.style.display = 'flex';
    },

    async toggleSeen(movieId) {
        if (!store.currentUser) {
            this._showSaveGate('seen');
            return;
        }
        const movie = store._lastMovies?.find(m => m.id === movieId);
        if (!movie) return;
        const btn = document.getElementById(`seen-btn-${movieId}`);
        const isSeen = btn?.classList.contains('seen');

        if (isSeen) {
            // Retirer le marquage vu
            // Si le film n'a pas de note → supprimer l'entrée entièrement
            const existing = await ratingsService.getRating(store.currentUser.id, movieId);
            if (existing?.rating) {
                await ratingsService.removeSeen(store.currentUser.id, movieId);
            } else {
                await ratingsService.removeEntry(store.currentUser.id, movieId);
            }
            if (btn) { btn.classList.remove('seen'); btn.textContent = t('results.seen'); }
        } else {
            await ratingsService.markSeen(store.currentUser.id, movie);
            if (btn) { btn.classList.add('seen'); btn.textContent = t('results.seen.done'); }
        }
    },

    // ── Charger l'état notation existant pour un film ──
    async loadMovieRating(movie) {
        if (!store.currentUser) return;
        // La row est déjà display:flex — on charge juste la note existante

        const existing = await ratingsService.getRating(store.currentUser.id, movie.id);
        if (!existing) return;

        if (existing.rating) {
            const stars = document.querySelectorAll(`#stars-${movie.id} .star`);
            stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= existing.rating));
        }
        if (existing.seen) {
            const btn = document.getElementById(`seen-btn-${movie.id}`);
            if (btn) { btn.classList.add('seen'); btn.textContent = t('results.seen.done'); }
        }
    },

    // ── Partage des résultats ──
    shareResults(movies) {
        const moodLabelsShare = getLang() === 'en' ? {
            "35,10751": "lighthearted 🎈", "28,12": "adrenaline ⚡",
            "53": "suspense 🕵️", "27": "thrills 🧟",
            "18,10749": "strong emotions 🎭", "878,9648": "mind-bending 👽"
        } : {
            "35,10751": "légèreté 🎈", "28,12": "adrénaline ⚡",
            "53": "suspense 🕵️", "27": "frissons 🧟",
            "18,10749": "émotions fortes 🎭", "878,9648": "réflexion 👽"
        };
        const mood = moodLabelsShare[store.answers.mood] || (getLang() === 'en' ? 'cinema' : 'cinéma');
        const titles = movies.map((m, i) => `${i+1}. ${m.title} (${m.release_date?.split('-')[0]||''}) — ${m.match_score}% match`).join('\n');
        const text = getLang() === 'en'
            ? `🎬 CineaMatch IA recommended tonight for a ${mood} evening:\n\n${titles}\n\n→ Find your perfect film on CineaMatch IA`
            : `🎬 CineaMatch IA m'a recommandé ce soir pour une soirée ${mood} :\n\n${titles}\n\n→ Trouve ton film parfait sur CineaMatch IA`;

        const btn = document.getElementById('share-btn');

        // Web Share API (mobile) ou fallback clipboard (desktop)
        if (navigator.share) {
            navigator.share({ title: 'CineaMatch IA — ' + (getLang() === 'en' ? 'My recommendations' : 'Mes recommandations'), text })
                .catch(() => {});
        } else {
            navigator.clipboard.writeText(text).then(() => {
                if (btn) {
                    btn.textContent = t('results.copiedclip');
                    btn.style.color = '#46d369';
                    btn.style.borderColor = '#46d369';
                    setTimeout(() => {
                        btn.innerHTML = t('results.share');
                        btn.style.color = 'rgba(255,255,255,0.6)';
                        btn.style.borderColor = 'rgba(255,255,255,0.15)';
                    }, 2500);
                }
            }).catch(() => {
                // Fallback si clipboard refusé
                prompt('Copie ce texte :', text);
            });
        }
    },

    // ── Watchlist ──
    async handleWatchlistToggle(movieId) {
        const id  = Number(movieId);
        const idx = store.watchlist.findIndex(m => m.id === id);
        if (idx > -1) {
            store.watchlist.splice(idx, 1);
            if (store.currentUser) watchlistService.remove(store.currentUser.id, id);
        } else {
            const movie = store._lastMovies?.find(m => Number(m.id) === id);
            store.watchlist.push(movie || { id });
            if (store.currentUser && movie) watchlistService.add(store.currentUser.id, movie);
            // Inviter les non-connectés à créer un compte après le premier ajout
            if (!store.currentUser) {
                setTimeout(() => this._showSaveGate('watchlist'), 400);
            }
        }
        localStorage.setItem('watchlist', JSON.stringify(store.watchlist));

        // Mettre à jour le bouton cœur sur la carte résultats
        const inList = store.watchlist.some(m => m.id === id);
        const btn = document.getElementById(`wl-btn-${id}`);
        if (btn) {
            btn.classList.toggle('active', inList);
            btn.title = inList ? t('results.remove') : t('results.add');
            const svg = btn.querySelector('svg');
            if (svg) svg.setAttribute('fill', inList ? 'white' : 'none');
        }

        // Message de confirmation (favoris) pour les connectés
        if (store.currentUser) {
            this._showToast(
                inList ? (getLang() === 'en' ? '♥ Added to favourites' : '♥ Ajouté aux favoris')
                       : (getLang() === 'en' ? 'Removed from favourites' : 'Retiré des favoris'),
                inList ? 'success' : 'info', 2200
            );
        }

        // Si on est sur la page "Ma Liste", rafraîchir la vue
        const watchlistView = document.getElementById('watchlist-view');
        if (watchlistView?.classList.contains('active')) {
            this.showWatchlist();
        }
    },

    showWatchlist() {
        // Gate Premium
        const isPremium = store.currentUser?.user_metadata?.is_premium === true;
        if (!store.currentUser || !isPremium) {
            this.showPricingModal();
            return;
        }

        ui.switchView('watchlist-view');
        const grid = ui.dom.watchlistGrid;
        if (!grid) return;

        // Mettre à jour le subtitle
        const sub = document.getElementById('watchlist-subtitle');
        if (sub) sub.textContent = store.watchlist.length > 0
            ? `${store.watchlist.length} film${store.watchlist.length > 1 ? 's' : ''} ${t('watchlist.saved')}${getLang() === 'fr' && store.watchlist.length > 1 ? 's' : ''}`
            : t('watchlist.subtitle');

        if (store.watchlist.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:rgba(255,255,255,0.35);">
                    <div style="font-size:3rem;margin-bottom:1rem;opacity:0.4">❤️</div>
                    <p style="font-size:1rem;font-weight:600;margin-bottom:0.4rem;">${t('watchlist.empty')}</p>
                    <p style="font-size:0.85rem;">${t('watchlist.hint')}</p>
                </div>`;
            return;
        }

        grid.innerHTML = '';
        store.watchlist.forEach((m, i) => {
            const card = document.createElement('div');
            card.className = 'history-item';
            card.style.animationDelay = `${i * 0.04}s`;
            const poster = m.poster_path
                ? `https://image.tmdb.org/t/p/w342${m.poster_path}`
                : `https://via.placeholder.com/300x450/1a1a1a/E50914?text=${encodeURIComponent(m.title || '')}`;

            card.innerHTML = `
                <img src="${poster}" alt="${m.title || ''}" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/300x450/1a1a1a/555?text=?'">
                <div class="history-item-overlay">
                    <p class="history-item-title">${escapeHtml(m.title) || '—'}</p>
                    ${m.release_date ? `<p class="history-item-meta">${m.release_date.split('-')[0]}</p>` : ''}
                </div>
                <button class="watchlist-btn active" onclick="toggleWatchlist(event,${m.id})" title="${t('results.remove')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2.5"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </button>`;

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.watchlist-btn')) {
                    window.open(`https://www.themoviedb.org/movie/${m.id}`, '_blank');
                }
            });
            grid.appendChild(card);
        });
    },

    // ── Profil cinéphile ──
    async showProfile() {
        const { authUI } = await import('./modules/auth.js?v=30');
        authUI.showHistory();
    },

    switchProfileTab(tab) {
        const grid    = document.getElementById('history-grid');
        const empty   = document.getElementById('history-empty');
        const wlGrid  = document.getElementById('profile-watchlist-grid');
        const wlEmpty = document.getElementById('profile-watchlist-empty');
        const tabRated = document.getElementById('ptab-rated');
        const tabList  = document.getElementById('ptab-list');

        if (tab === 'rated') {
            tabRated?.classList.add('active');
            tabList?.classList.remove('active');
            if (grid)   grid.style.display   = '';
            if (empty && window._profileFilms?.length === 0) empty.style.display = 'block';
            else if (empty) empty.style.display = 'none';
            if (wlGrid)  wlGrid.style.display  = 'none';
            if (wlEmpty) wlEmpty.style.display  = 'none';
        } else {
            tabRated?.classList.remove('active');
            tabList?.classList.add('active');
            if (grid)  grid.style.display  = 'none';
            if (empty) empty.style.display = 'none';
            const hasWl = store.watchlist?.length > 0;
            if (wlGrid)  wlGrid.style.display  = hasWl ? '' : 'none';
            if (wlEmpty) wlEmpty.style.display  = hasWl ? 'none' : 'block';
        }
    },

    // ── Préférences utilisateur (Premium uniquement) ──
    showPreferences() {
        // Gate Premium
        const isPremium = store.currentUser?.user_metadata?.is_premium === true;
        if (!store.currentUser || !isPremium) {
            this.showPricingModal();
            return;
        }

        const modal = document.getElementById('preferences-modal');
        if (!modal) return;

        // Restaurer plateformes
        const savedPlatforms = store.preferredPlatforms || [];
        modal.querySelectorAll('.platform-chip input[type=checkbox]').forEach(cb => {
            cb.checked = savedPlatforms.includes(cb.value);
        });

        // Restaurer prefs de reco
        const rp = store.recoPrefs || { vibes: [], epoques: [], origines: [], exclusions: [] };
        modal.querySelectorAll('#pref-vibe input').forEach(cb => { cb.checked = rp.vibes.includes(cb.value); });
        modal.querySelectorAll('#pref-epoque input').forEach(cb => { cb.checked = rp.epoques.includes(cb.value); });
        modal.querySelectorAll('#pref-origine input').forEach(cb => { cb.checked = rp.origines.includes(cb.value); });
        modal.querySelectorAll('#pref-exclusions input').forEach(cb => { cb.checked = rp.exclusions.includes(cb.value); });

        // ── Remplir le panneau Mon Profil ──
        this._fillProfilPanel();

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
    },

    _fillProfilPanel() {
        const user = store.currentUser;
        if (!user) return;

        const name    = user.user_metadata?.name || user.email?.split('@')[0] || '—';
        const email   = user.email || '—';
        const dob     = user.user_metadata?.birth_date || null;

        // Formatter la date de naissance en lisible
        let dobDisplay = '—';
        let ageDisplay = '—';
        if (dob) {
            const d = new Date(dob);
            dobDisplay = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
            const age = store.userAge;
            if (age) {
                const profile = window.getAgeProfile?.(age);
                ageDisplay   = profile ? profile.label : `${age} ans`;
            }
        }

        const elName  = document.getElementById('profil-name');
        const elEmail = document.getElementById('profil-email');
        const elDob   = document.getElementById('profil-dob');
        const elAge   = document.getElementById('profil-age-badge');
        if (elName)  elName.textContent  = name;
        if (elEmail) elEmail.textContent = email;
        if (elDob)   elDob.textContent   = dobDisplay;
        if (elAge)   elAge.textContent   = ageDisplay;

        // Brancher le bouton changement de mot de passe (une seule fois)
        const pwdBtn = document.getElementById('profil-pwd-btn');
        if (pwdBtn && !pwdBtn._wired) {
            pwdBtn._wired = true;
            pwdBtn.addEventListener('click', () => this._changePassword());
        }
    },

    async _changePassword() {
        const newPwd  = document.getElementById('profil-pwd-new')?.value;
        const confirm = document.getElementById('profil-pwd-confirm')?.value;
        const msgEl   = document.getElementById('profil-pwd-msg');
        const btn     = document.getElementById('profil-pwd-btn');

        const showMsg = (text, color) => {
            if (msgEl) { msgEl.textContent = text; msgEl.style.color = color; msgEl.style.display = 'block'; }
        };

        if (!newPwd || newPwd.length < 6) return showMsg(t('profile.pwd.min'), '#E50914');
        if (newPwd !== confirm) return showMsg(t('profile.pwd.mismatch'), '#E50914');

        btn.disabled    = true;
        btn.textContent = t('profile.pwd.updating');

        try {
            const { authService } = await import('./services/supabase.js?v=12');
            await authService.updatePassword(newPwd);
            showMsg(t('profile.pwd.success'), '#46d369');
            document.getElementById('profil-pwd-new').value     = '';
            document.getElementById('profil-pwd-confirm').value = '';
        } catch(err) {
            showMsg(t('profile.pwd.error') + err.message, '#E50914');
        } finally {
            btn.disabled    = false;
            btn.textContent = t('profile.pwd.btn');
        }
    },

    async savePreferences() {
        const modal = document.getElementById('preferences-modal');
        if (!modal) return;

        // Plateformes
        const platforms = [...modal.querySelectorAll('.platform-chip input:checked')].map(cb => cb.value);
        store.preferredPlatforms = platforms;
        localStorage.setItem('preferred_platforms', JSON.stringify(platforms));

        // Prefs de reco
        const recoPrefs = {
            vibes:      [...modal.querySelectorAll('#pref-vibe input:checked')].map(cb => cb.value),
            epoques:    [...modal.querySelectorAll('#pref-epoque input:checked')].map(cb => cb.value),
            origines:   [...modal.querySelectorAll('#pref-origine input:checked')].map(cb => cb.value),
            exclusions: [...modal.querySelectorAll('#pref-exclusions input:checked')].map(cb => cb.value),
        };
        store.recoPrefs = recoPrefs;

        if (store.currentUser) {
            await preferencesService.savePlatforms(platforms);
            await preferencesService.saveRecoPrefs(recoPrefs);
        } else {
            localStorage.setItem('reco_prefs', JSON.stringify(recoPrefs));
        }

        // Feedback visuel
        const btn = document.getElementById('prefs-save-btn');
        if (btn) { btn.textContent = t('results.save'); btn.style.background = '#46d369'; }
        setTimeout(() => {
            modal.classList.remove('visible');
            setTimeout(() => { modal.style.display = 'none'; }, 320);
            if (btn) { btn.textContent = t('results.savebtn'); btn.style.background = ''; }
        }, 1200);
    },

    goHome() {
        // Retirer le fond Mode Duo s'il est actif
        this.removeDuoBg();
        store.duoMode   = false;
        store.duoRole   = null;
        store.duoMerged = false;

        ui.switchView('hero');
        // Double scroll — couvre window ET body (Safari mobile)
        requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            const main = document.getElementById('main-container');
            if (main) main.scrollTop = 0;
        });
    },

    // ══════════════════════════════════════════
    //  PAYWALL — Modale limite rerolls
    // ══════════════════════════════════════════
    // ── Popup gate reroll (signup ou premium) ──
    _showRerollGate(type) {
        // Supprimer un éventuel popup existant
        document.getElementById('reroll-gate-overlay')?.remove();

        const isSignup = type === 'signup';
        const overlay  = document.createElement('div');
        overlay.id     = 'reroll-gate-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
            display:flex;align-items:center;justify-content:center;
            padding:1rem;animation:fadeIn 0.2s ease;`;

        overlay.innerHTML = `
            <div style="
                background:#111;border:1px solid rgba(255,255,255,0.1);
                border-radius:20px;padding:2.5rem 2rem;max-width:420px;width:100%;
                text-align:center;position:relative;
                box-shadow:0 25px 60px rgba(0,0,0,0.6);">
                <button id="reroll-gate-close" style="
                    position:absolute;top:1rem;right:1rem;background:none;
                    border:none;color:rgba(255,255,255,0.4);font-size:1.3rem;
                    cursor:pointer;line-height:1;">✕</button>

                <div style="font-size:2.8rem;margin-bottom:1rem;">
                    ${isSignup ? '🎬' : '⚡'}
                </div>

                <h3 style="font-size:1.35rem;font-weight:800;color:#fff;margin:0 0 0.6rem;">
                    ${isSignup
                        ? 'Tu veux voir plus de films ?'
                        : 'Tu as atteint ta limite'}
                </h3>

                <p style="color:rgba(255,255,255,0.5);font-size:0.9rem;line-height:1.6;margin:0 0 2rem;">
                    ${isSignup
                        ? 'Crée un compte gratuit en 30 secondes et obtiens <strong style="color:#fff">2 suggestions supplémentaires</strong> par jour.'
                        : 'Les membres Premium ont accès à <strong style="color:#fff">des suggestions illimitées</strong>, l\'historique complet et bien plus.'}
                </p>

                ${isSignup ? `
                <button id="reroll-gate-cta" style="
                    width:100%;padding:0.9rem;background:#E50914;color:#fff;
                    border:none;border-radius:12px;font-size:1rem;font-weight:800;
                    cursor:pointer;margin-bottom:0.75rem;letter-spacing:0.02em;">
                    Créer un compte gratuit
                </button>
                <button id="reroll-gate-login" style="
                    width:100%;padding:0.75rem;background:transparent;
                    color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);
                    border-radius:12px;font-size:0.9rem;cursor:pointer;">
                    J'ai déjà un compte
                </button>` : `
                <button id="reroll-gate-cta" style="
                    width:100%;padding:0.9rem;background:#E50914;color:#fff;
                    border:none;border-radius:12px;font-size:1rem;font-weight:800;
                    cursor:pointer;margin-bottom:0.75rem;">
                    Passer Premium — 2,99€/mois
                </button>
                <button id="reroll-gate-login" style="
                    width:100%;padding:0.75rem;background:transparent;
                    color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);
                    border-radius:12px;font-size:0.9rem;cursor:pointer;">
                    Voir les offres
                </button>`}
            </div>`;

        document.body.appendChild(overlay);

        // Fermeture
        const close = () => overlay.remove();
        document.getElementById('reroll-gate-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        // CTA principal
        document.getElementById('reroll-gate-cta').onclick = () => {
            close();
            if (isSignup) {
                import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signup'));
            } else {
                this.showPricingModal();
            }
        };

        // Lien secondaire
        document.getElementById('reroll-gate-login').onclick = () => {
            close();
            if (isSignup) {
                import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signin'));
            } else {
                this.showPricingModal();
            }
        };
    },

    // ── Popup gate nouvelle recherche (anonyme) ──
    // ── Popup PARTAGE : débloque 1 recherche bonus après l'essai gratuit ──
    _showShareGate() {
        document.getElementById('share-unlock-overlay')?.remove();

        const SHARE_URL = 'https://cineamatch.com';
        const SHARE_MSG = "🎬 J'ai trouvé un truc génial : CineaMatch, une IA qui te trouve LE film parfait à regarder en 30 secondes. Teste, c'est bluffant 👉 ";

        const overlay = document.createElement('div');
        overlay.id    = 'share-unlock-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);
            display:flex;align-items:center;justify-content:center;
            padding:1rem;animation:fadeIn 0.2s ease;`;

        overlay.innerHTML = `
            <div style="
                background:linear-gradient(180deg,#1b1722 0%,#100d16 100%);
                border:1px solid rgba(255,255,255,0.09);
                border-radius:24px;padding:2.6rem 2rem 2rem;max-width:410px;width:100%;
                text-align:center;position:relative;
                box-shadow:0 30px 80px rgba(0,0,0,0.7);">
                <button id="shg-close" style="
                    position:absolute;top:1.1rem;right:1.1rem;background:rgba(255,255,255,0.06);
                    border:none;color:rgba(255,255,255,0.5);font-size:1rem;width:30px;height:30px;
                    border-radius:50%;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>

                <div style="
                    width:64px;height:64px;margin:0 auto 1.2rem;border-radius:50%;
                    background:linear-gradient(135deg,rgba(229,9,20,0.22),rgba(139,92,246,0.18));
                    display:flex;align-items:center;justify-content:center;font-size:2rem;
                    border:1px solid rgba(255,255,255,0.08);">🎁</div>

                <h3 style="font-size:1.4rem;font-weight:800;color:#fff;margin:0 0 0.6rem;letter-spacing:-0.02em;">
                    Une reco offerte t'attend
                </h3>

                <p style="color:rgba(255,255,255,0.55);font-size:0.92rem;line-height:1.65;margin:0 0 1.8rem;">
                    Partage CineaMatch à un proche et débloque
                    <strong style="color:#fff">une recherche de plus</strong>, gratuitement.
                </p>

                <button id="shg-share" style="
                    width:100%;padding:1rem;background:linear-gradient(135deg,#E50914,#b30710);
                    color:#fff;border:none;border-radius:14px;font-size:1.02rem;font-weight:800;
                    cursor:pointer;margin-bottom:0.7rem;letter-spacing:0.01em;
                    box-shadow:0 8px 24px rgba(229,9,20,0.35);transition:transform 0.12s;">
                    Partager &amp; débloquer
                </button>
                <button id="shg-premium" style="
                    width:100%;padding:0.8rem;background:transparent;
                    color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.12);
                    border-radius:13px;font-size:0.88rem;font-weight:600;cursor:pointer;">
                    Ou passe Premium — 2,99€/mois
                </button>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('shg-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        // Débloque la recherche bonus puis relance le questionnaire
        const unlock = () => {
            localStorage.setItem('anon_share_unlocked', '1');
            close();
            this.startFlow();
        };

        document.getElementById('shg-share').onclick = () => {
            if (navigator.share) {
                // Mobile : ne débloque QUE si le partage natif aboutit (plus sûr)
                navigator.share({ title: 'CineaMatch', text: SHARE_MSG, url: SHARE_URL })
                    .then(unlock)
                    .catch(() => { /* partage annulé → popup laissé ouvert */ });
            } else {
                // Pas de partage natif (desktop) → WhatsApp pré-rempli, puis déblocage
                window.open('https://wa.me/?text=' + encodeURIComponent(SHARE_MSG + SHARE_URL), '_blank');
                unlock();
            }
        };
        document.getElementById('shg-premium').onclick = () => {
            close();
            this.showPricingModal();
        };
    },

    _showSearchGate() {
        document.getElementById('search-gate-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id    = 'search-gate-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);
            display:flex;align-items:center;justify-content:center;
            padding:1rem;animation:fadeIn 0.2s ease;`;

        overlay.innerHTML = `
            <div style="
                background:#111;border:1px solid rgba(255,255,255,0.1);
                border-radius:20px;padding:2.5rem 2rem;max-width:420px;width:100%;
                text-align:center;position:relative;
                box-shadow:0 25px 60px rgba(0,0,0,0.6);">
                <button id="sg-close" style="
                    position:absolute;top:1rem;right:1rem;background:none;
                    border:none;color:rgba(255,255,255,0.4);font-size:1.3rem;
                    cursor:pointer;line-height:1;">✕</button>

                <div style="font-size:2.8rem;margin-bottom:1rem;">🎬</div>

                <h3 style="font-size:1.35rem;font-weight:800;color:#fff;margin:0 0 0.6rem;">
                    Ton essai gratuit est terminé
                </h3>

                <p style="color:rgba(255,255,255,0.5);font-size:0.9rem;line-height:1.6;margin:0 0 2rem;">
                    Tu as vu ce que l'IA sait faire. Pour continuer à trouver
                    <strong style="color:#fff">ton film en 30 secondes</strong> —
                    recherches illimitées, historique &amp; watchlist —
                    passe Premium dès <strong style="color:#fff">2,99€/mois</strong>.
                </p>

                <button id="sg-signup" style="
                    width:100%;padding:0.9rem;background:#E50914;color:#fff;
                    border:none;border-radius:12px;font-size:1rem;font-weight:800;
                    cursor:pointer;margin-bottom:0.75rem;letter-spacing:0.02em;">
                    Débloquer Premium — 2,99€/mois
                </button>
                <button id="sg-login" style="
                    width:100%;padding:0.75rem;background:transparent;
                    color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);
                    border-radius:12px;font-size:0.9rem;cursor:pointer;">
                    J'ai déjà un compte
                </button>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('sg-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        document.getElementById('sg-signup').onclick = () => {
            close();
            // Montre directement l'offre Premium (les plans 2,99€/19,99€).
            // « Choisir » lance le checkout Stripe et demande l'inscription si besoin.
            this.showPricingModal();
        };
        document.getElementById('sg-login').onclick = () => {
            close();
            import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signin'));
        };
    },

    // ── Popup gate Mode Duo ──
    _showDuoGate(type) {
        document.getElementById('duo-gate-overlay')?.remove();

        const isSignup = type === 'signup';
        const overlay  = document.createElement('div');
        overlay.id     = 'duo-gate-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);
            display:flex;align-items:center;justify-content:center;
            padding:1rem;animation:fadeIn 0.2s ease;`;

        overlay.innerHTML = `
            <div style="
                background:#111;border:1px solid rgba(255,255,255,0.1);
                border-radius:20px;padding:2.5rem 2rem;max-width:420px;width:100%;
                text-align:center;position:relative;
                box-shadow:0 25px 60px rgba(0,0,0,0.6);">
                <button id="duo-gate-close" style="
                    position:absolute;top:1rem;right:1rem;background:none;
                    border:none;color:rgba(255,255,255,0.4);font-size:1.3rem;
                    cursor:pointer;line-height:1;">✕</button>

                <div style="font-size:2.8rem;margin-bottom:1rem;">💑</div>

                <h3 style="font-size:1.35rem;font-weight:800;color:#fff;margin:0 0 0.6rem;">
                    ${isSignup ? t('duo.gate.signup.title') : t('duo.gate.premium.title')}
                </h3>

                <p style="color:rgba(255,255,255,0.5);font-size:0.9rem;line-height:1.6;margin:0 0 2rem;">
                    ${isSignup ? t('duo.gate.signup.sub') : t('duo.gate.premium.sub')}
                </p>

                <button id="duo-gate-cta" style="
                    width:100%;padding:0.9rem;background:#E50914;color:#fff;
                    border:none;border-radius:12px;font-size:1rem;font-weight:800;
                    cursor:pointer;margin-bottom:0.75rem;letter-spacing:0.02em;">
                    ${isSignup ? t('duo.gate.signup.cta') : t('paywall.premium')}
                </button>
                <button id="duo-gate-secondary" style="
                    width:100%;padding:0.75rem;background:transparent;
                    color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);
                    border-radius:12px;font-size:0.9rem;cursor:pointer;">
                    ${isSignup ? t('paywall.signin.btn') : t('duo.gate.premium.sec')}
                </button>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('duo-gate-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        document.getElementById('duo-gate-cta').onclick = () => {
            close();
            if (isSignup) {
                import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signup'));
            } else {
                this.showPricingModal();
            }
        };

        document.getElementById('duo-gate-secondary').onclick = () => {
            close();
            if (isSignup) {
                import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signin'));
            } else {
                this.showPricingModal();
            }
        };
    },

    showPaywallModal() {
        const modal = document.getElementById('paywall-modal-overlay');
        if (!modal) return;
        const isLoggedIn = !!store.currentUser;

        // Adapter le contenu selon l'état de connexion
        const icon    = document.getElementById('paywall-icon');
        const title   = document.getElementById('paywall-title');
        const sub     = document.getElementById('paywall-sub');
        const ctaPrim = document.getElementById('paywall-cta-primary');
        const ctaSec  = document.getElementById('paywall-cta-secondary');

        // Helper : ouvrir auth modal sur un onglet précis
        const openAuthTab = (tabId) => {
            this.hidePaywallModal();
            // Ouvrir la modale auth
            const authOverlay = document.getElementById('auth-modal-overlay');
            if (authOverlay) {
                authOverlay.style.display = 'flex';
                setTimeout(() => authOverlay.classList.add('visible'), 10);
            }
            // Activer le bon onglet
            const tab = document.getElementById(tabId);
            if (tab) tab.click();
        };

        if (!isLoggedIn) {
            if (icon)    icon.textContent    = '🎬';
            if (title)   title.textContent   = t('paywall.more.title');
            if (sub)     sub.textContent     = t('paywall.sub');
            if (ctaPrim) { ctaPrim.textContent = t('paywall.cta'); ctaPrim.onclick = () => openAuthTab('tab-signup'); }
            if (ctaSec)  { ctaSec.style.display = 'block'; ctaSec.textContent = t('paywall.signin.btn'); ctaSec.onclick = () => openAuthTab('tab-signin'); }
        } else {
            if (icon)    icon.textContent    = '⚡';
            if (title)   title.textContent   = t('paywall.reroll.title');
            if (sub)     sub.textContent     = t('paywall.reroll.sub');
            if (ctaPrim) { ctaPrim.textContent = t('paywall.premium'); ctaPrim.onclick = () => { this.hidePaywallModal(); this.showPricingModal(); }; }
            if (ctaSec)  ctaSec.style.display = 'none';
        }

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
    },

    hidePaywallModal() {
        const modal = document.getElementById('paywall-modal-overlay');
        if (!modal) return;
        modal.classList.remove('visible');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    },

    // ══════════════════════════════════════════
    //  PRICING — Modale plans Premium
    // ══════════════════════════════════════════
    showPricingModal(context) {
        const modal = document.getElementById('pricing-modal-overlay');
        if (!modal) return;
        // Phrase de contexte selon l'origine (fin des essais OU Mode Duo)
        const banner = document.getElementById('pricing-context-banner');
        if (banner) {
            if (context === 'trial_ended') {
                banner.innerHTML = '🎬 Tu as utilisé tes recherches gratuites — passe Premium pour continuer sans limite.';
                banner.style.display = 'block';
            } else if (context === 'duo') {
                banner.innerHTML = '💑 Le Mode Duo est réservé aux abonnés Premium — trouve le film parfait à deux.';
                banner.style.display = 'block';
            } else if (context === 'signup') {
                banner.innerHTML = '🎬 Bienvenue ! Passe Premium pour débloquer CineaMatch sans limite.';
                banner.style.display = 'block';
            } else if (context === 'reroll') {
                banner.innerHTML = '🔄 « Autre suggestion » est réservé aux abonnés Premium — relance autant que tu veux.';
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
        }
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
    },

    hidePricingModal() {
        const modal = document.getElementById('pricing-modal-overlay');
        if (!modal) return;
        modal.classList.remove('visible');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    },

    // ══════════════════════════════════════════
    //  STRIPE — Lancer le checkout
    // ══════════════════════════════════════════
    async startCheckout(plan, clickedBtn) {
        if (!store.currentUser) {
            // Utilisateur non connecté → mémoriser le plan choisi et ouvrir directement
            // l'INSCRIPTION. Après connexion (onLogin), le checkout Stripe reprend tout seul.
            localStorage.setItem('cm_pending_plan', plan);
            this.hidePricingModal();
            import('./modules/auth.js?v=30').then(m => m.authUI.showModal('signup'));
            return;
        }

        // Désactiver uniquement le bouton cliqué pendant la redirection
        if (clickedBtn) {
            clickedBtn.disabled = true;
            clickedBtn.innerHTML = `<span class="btn-spinner"></span><span>${t('stripe.redirecting')}</span>`;
            clickedBtn.classList.add('pricing-cta--loading');
        }

        try {
            const res = await fetch('/api/stripe-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan,
                    userId: store.currentUser.id,
                    email:  store.currentUser.email,
                })
            });

            const data = await res.json();

            if (!res.ok || !data.url) {
                throw new Error(data.error || t('stripe.error.create'));
            }

            // Rediriger vers Stripe Checkout
            window.location.href = data.url;

        } catch (err) {
            console.error('Checkout error:', err);
            // Réactiver le bouton cliqué en cas d'erreur
            if (clickedBtn) {
                clickedBtn.disabled = false;
                clickedBtn.innerHTML = t('stripe.choose');
                clickedBtn.classList.remove('pricing-cta--loading');
            }
            // Afficher un message d'erreur simple
            const footer = document.querySelector('.pricing-footer');
            if (footer) {
                footer.textContent = t('stripe.error.prefix') + err.message;
                footer.style.color = '#E50914';
            }
        }
    },

    // ══════════════════════════════════════════
    //  STRIPE — Gérer le retour après paiement
    // ══════════════════════════════════════════
    async handleStripeReturn(status) {
        // Nettoyer l'URL sans recharger la page
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        if (status === 'success') {
            // Toast immédiat
            this._showToast(t('stripe.toast.confirmed'), 'success', 4000);

            // Attendre que le webhook Stripe ait mis à jour Supabase (jusqu'à 5s)
            let attempts = 0;
            const pollPremium = async () => {
                attempts++;
                try {
                    const { authService } = await import('./services/supabase.js?v=12');
                    // getUser() force une lecture fraîche depuis le serveur
                    const freshUser = await authService.getUser();
                    if (freshUser?.user_metadata?.is_premium === true) {
                        store.currentUser = freshUser;
                        const { authUI } = await import('./modules/auth.js?v=30');
                        await authUI.onLogin(freshUser);
                        this._showToast(t('stripe.toast.activated'), 'success', 5000);
                    } else if (attempts < 5) {
                        // Réessayer dans 2 secondes
                        setTimeout(pollPremium, 2000);
                    } else {
                        // Après 10s, recharger la page pour forcer
                        window.location.reload();
                    }
                } catch (e) { console.warn('Premium poll error:', e); }
            };
            setTimeout(pollPremium, 2000);
        } else if (status === 'cancel') {
            this._showToast(t('stripe.toast.cancelled'), 'info', 4000);
        }
    },

    // Helper toast simple
    _showToast(message, type = 'success', duration = 4000) {
        const existing = document.getElementById('stripe-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'stripe-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: ${type === 'success' ? '#16a34a' : type === 'info' ? '#1d4ed8' : '#E50914'};
            color: #fff; padding: 12px 24px; border-radius: 10px;
            font-size: 0.9rem; font-weight: 600; z-index: 9999;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            animation: fadeInUp 0.3s ease both;
            max-width: 90vw; text-align: center;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.4s';
            setTimeout(() => toast.remove(), 400);
        }, duration);
    },

    // ── Génère une raison unique par film, ancrée dans les données TMDB spécifiques ──
    _autoReason(m) {
        const isEn = getLang() === 'en';
        const GENRE_FR = { 28:'Action', 12:'Aventure', 16:'Animation', 35:'Comédie', 80:'Crime', 99:'Documentaire',
            18:'Drame', 10751:'Famille', 14:'Fantaisie', 36:'Histoire', 27:'Horreur', 10402:'Musique',
            9648:'Mystère', 10749:'Romance', 878:'Science-Fiction', 10770:'Téléfilm', 53:'Thriller',
            10752:'Guerre', 37:'Western' };
        const GENRE_EN = { 28:'action', 12:'adventure', 16:'animation', 35:'comedy', 80:'crime', 99:'documentary',
            18:'drama', 10751:'family', 14:'fantasy', 36:'history', 27:'horror', 10402:'music',
            9648:'mystery', 10749:'romance', 878:'sci-fi', 53:'thriller', 10752:'war', 37:'western' };
        const GENRE_MAP = isEn ? GENRE_EN : GENRE_FR;

        const genres = (m.genres || []).map(g => GENRE_MAP[g.id] || g.name).filter(Boolean);
        const genre  = genres[0] || '';
        const genre2 = genres[1] || '';
        const cast   = m.credits?.cast?.slice(0, 2).map(a => a.name) || [];
        const director = m.credits?.crew?.find(p => p.job === 'Director')?.name || '';
        const year   = m.release_date?.split('-')[0] || '';
        const score  = m.vote_average ? m.vote_average.toFixed(1) : '';
        const runtime = m.runtime ? `${m.runtime} min` : '';
        const tagline = m.tagline?.trim() || '';
        const mood   = store.answers?.moodLabel || store.answers?.mood || '';

        // ── Phrase 1 : UNIQUE à ce film (tagline > réalisateur > combo genre+année+note) ──
        let sentence1 = '';
        if (tagline && tagline.length > 8 && tagline.length < 120) {
            // Tagline intégrée naturellement dans une phrase
            sentence1 = isEn
                ? `"${tagline}" — a ${genre ? genre.toLowerCase() : 'film'}${score ? ` rated ${score}/10` : ''}.`
                : `"${tagline}" — un ${genre ? genre.toLowerCase() : 'film'}${score ? ` noté ${score}/10` : ''}.`;
        } else if (director && genre) {
            sentence1 = isEn
                ? `Directed by ${director}, a ${genre.toLowerCase()}${genre2 ? `/${genre2.toLowerCase()}` : ''} from ${year || 'recent years'}${score ? ` rated ${score}/10` : ''}.`
                : `Réalisé par ${director}, un ${genre.toLowerCase()}${genre2 ? `/${genre2.toLowerCase()}` : ''} de ${year || 'ces dernières années'}${score ? ` noté ${score}/10` : ''}.`;
        } else if (genre && year && score) {
            sentence1 = isEn
                ? `A ${genre.toLowerCase()}${genre2 ? `/${genre2.toLowerCase()}` : ''} from ${year}, rated ${score}/10 on TMDb.`
                : `Un ${genre.toLowerCase()}${genre2 ? `/${genre2.toLowerCase()}` : ''} de ${year}, noté ${score}/10 sur TMDb.`;
        }

        // ── Phrase 2 : casting + durée, ancrée dans le mood ──
        let sentence2 = '';
        const castStr = cast.join(isEn ? ' and ' : ' et ');
        const moodHint = mood
            ? (isEn ? `matches your mood for ${mood.toLowerCase()}` : `colle à ton envie de ${mood.toLowerCase()}`)
            : '';
        if (castStr && runtime) {
            sentence2 = isEn
                ? `Starring ${castStr} · ${runtime}${moodHint ? ` — ${moodHint}` : ''}.`
                : `Avec ${castStr} · ${runtime}${moodHint ? ` — ${moodHint}` : ''}.`;
        } else if (castStr) {
            sentence2 = isEn
                ? `Starring ${castStr}${moodHint ? ` — ${moodHint}` : ''}.`
                : `Avec ${castStr}${moodHint ? ` — ${moodHint}` : ''}.`;
        } else if (moodHint) {
            sentence2 = isEn ? `This pick ${moodHint}.` : `Ce choix ${moodHint}.`;
        }

        if (sentence1 && sentence2) return `${sentence1} ${sentence2}`;
        if (sentence1) return sentence1;
        if (sentence2) return sentence2;

        return isEn
            ? `A well-rated ${genre || 'film'} ${year ? `(${year})` : ''} selected for your taste.`
            : `Un ${genre ? genre.toLowerCase() : 'film'} bien noté ${year ? `(${year})` : ''} sélectionné pour toi.`;
    },

    _showStripeToast(message, type = 'success', duration = 4000) {
        const toast = document.createElement('div');
        toast.id = 'stripe-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: ${type === 'success' ? '#16a34a' : type === 'info' ? '#1d4ed8' : '#E50914'};
            color: #fff; padding: 12px 24px; border-radius: 10px;
            font-size: 0.9rem; font-weight: 600; z-index: 9999;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            animation: fadeInUp 0.3s ease both;
            max-width: 90vw; text-align: center;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.4s';
            setTimeout(() => toast.remove(), 400);
        }, duration);
    }
};

// Exposer App globalement pour les onclick inline
window.App = App;

document.addEventListener('DOMContentLoaded', () => App.init());

// Réinitialiser les boutons de checkout si l'utilisateur revient en arrière (bfcache)
window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
        document.querySelectorAll('.pricing-cta').forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = t('stripe.choose');
            btn.classList.remove('pricing-cta--loading');
        });
    }
});
