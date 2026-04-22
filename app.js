import { tmdbService, openaiService } from './services/api.js?v=59';
import { store, getters } from './state/store.js?v=43';
import { ui } from './modules/ui.js?v=42';
import { QUESTIONS, QUESTIONS_EN } from './config/questions.js?v=48';
import { historyService, ratingsService, watchlistService, preferencesService } from './services/supabase.js?v=7';
import { t, getLang, setLang, applyTranslations } from './config/i18n.js?v=340';

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
const REROLL_MAX_SCORES  = [95, 87, 79, 71, 64, 58];
const REROLL_FREE_LIMIT  = 2;   // 1ère reco + 2 rerolls = 3 suggestions au total, ensuite paywall

function getMaxScore(rerollCount) {
    return REROLL_MAX_SCORES[Math.min(rerollCount, REROLL_MAX_SCORES.length - 1)];
}

function getNextScore(rerollCount) {
    return REROLL_MAX_SCORES[Math.min(rerollCount + 1, REROLL_MAX_SCORES.length - 1)];
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

        const prefsBtn = document.getElementById('prefs-nav-btn');
        if (prefsBtn) prefsBtn.addEventListener('click', () => this.showPreferences());

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

        // ── Détection URL Personne B (?duo=BASE64) ──
        const duoParam = new URLSearchParams(location.search).get('duo');
        if (duoParam) {
            try {
                // URLSearchParams.get() décode %XX mais transforme + en espace
                // On re-encode les espaces en + avant le atob pour corriger ça
                const cleanParam = duoParam.replace(/ /g, '+');
                const answersA = JSON.parse(decodeURIComponent(escape(atob(cleanParam))));
                store.duoMode = true;
                store.duoRole = 'B';
                store.duoPartnerAnswers = answersA;
                store.duoMerged = false;
                // Signaler à Person A (autre onglet/appareil) que B a commencé
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
        const key = store.apiKeys.tmdb;
        if (!key) return;

        const section = document.getElementById('trending-section');
        if (!section) return;

        try {
            const lang = tmdbService.lang;
            // Deux pages pour avoir 40 films disponibles → on prend les 20 avec poster
            const [r1, r2] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${key}&language=${lang}&sort_by=popularity.desc&with_watch_monetization_types=flatrate&watch_region=FR&vote_count.gte=200&page=1`),
                fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${key}&language=${lang}&sort_by=popularity.desc&with_watch_monetization_types=flatrate&watch_region=FR&vote_count.gte=200&page=2`)
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

        // Positionner au début du set B (milieu) dès le rendu
        requestAnimationFrame(() => {
            const setWidth = row.scrollWidth / 3;
            row.scrollLeft = setWidth;

            // Après chaque fin de scroll : si on est hors du set B, on saute silencieusement
            let scrollTimer = null;
            row.addEventListener('scroll', () => {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    const sl = row.scrollLeft;
                    const sw = row.scrollWidth / 3;
                    if (sl < sw * 0.5) {
                        row.style.scrollBehavior = 'auto';
                        row.scrollLeft = sl + sw;
                        row.style.scrollBehavior = '';
                    } else if (sl > sw * 1.5) {
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
        const key = store.apiKeys.tmdb;
        if (!key) return;
        try {
            // Afficher un écran de chargement rapide
            ui.switchView('loading');
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = t('loading.movie');

            const res = await fetch(
                `https://api.themoviedb.org/3/movie/${movieId}?api_key=${key}&language=${tmdbService.lang}&append_to_response=watch/providers`
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
        store.suggestedMovieIds = [];
        store.suggestedTitles   = [];
        store.rerollCount       = 0;

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
        grid.className = 'options-grid';
        const isMulti = q.type === 'options-multi';

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

            // Compteur de sélections (affiché seulement si maxSelect défini)
            if (maxSelect) {
                const counter = document.createElement('p');
                counter.id = 'multi-counter';
                counter.style.cssText = 'text-align:center;font-size:0.78rem;color:rgba(255,255,255,0.4);margin-top:0.75rem;margin-bottom:0;';
                const current = (store.answers[q.key] || []).filter(id => id !== 'none' && id !== 'any').length;
                counter.textContent = `${current} / ${maxSelect} sélectionné${current > 1 ? 's' : ''}`;
                ui.dom.questionContainer.appendChild(counter);
            }

            const nextWrap = document.createElement('div');
            nextWrap.style.cssText = 'width:100%;display:flex;justify-content:center;margin-top:1rem;';
            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn-primary';
            nextBtn.style.cssText = 'width:auto;min-width:160px;max-width:260px;';
            nextBtn.textContent = t('q.validate');
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
                if (store.answers.lastLovedMovies.length < 3 &&
                    !store.answers.lastLovedMovies.find(m => m.id === movie.id)) {
                    store.answers.lastLovedMovies.push(movie);
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
    },

    // ── Traitement des résultats ──
    async processResults(isReroll = false) {
        this._clearSession();
        ui.switchView('loading');
        const loadingText = document.getElementById('loading-text');

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
                        await Promise.allSettled(
                            refMovies.map(m => ratingsService.rate(store.currentUser.id, m, 5, true))
                        );
                        console.log(`⭐ ${refMovies.length} film(s) de référence sauvegardés avec 5★ dans l'historique`);
                    }

                    const [seenHistory, seenRatings, favGenres, ratingProfile] = await Promise.all([
                        historyService.getSeenMovieIds(store.currentUser.id),
                        ratingsService.getSeenMovieIds(store.currentUser.id),
                        historyService.getFavoriteGenres(store.currentUser.id),
                        ratingsService.getRatingProfile(store.currentUser.id)
                    ]);
                    // Exclure tous les films déjà recommandés ou marqués vus
                    const allSeenIds = [...new Set([...seenHistory, ...seenRatings])];
                    store.suggestedMovieIds = [...new Set([...store.suggestedMovieIds, ...allSeenIds])];
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

            loadingText.innerHTML = `${t('loading.ai')}<br><span style="font-size:0.8rem;opacity:0.7">Humeur : ${moodLabel}</span>`;

            // ── ÉTAPE 1 : OpenAI traduit les réponses en filtres TMDb ──
            const metadata = await openaiService.extractMetadata(
                { ...store.answers, contextLabel, moodLabel, durationLabel, excludeLabels, detectedLanguage, blendedGenreIds },
                isReroll,
                store.suggestedTitles
            );
            store.aiAnalysis = metadata;

            if (isReroll) store.rerollCount++;

            loadingText.textContent = t('loading.tmdb');

            // ── Collecter les keywords des films de référence ──
            // Objectif : trouver les mots-clés de style communs (ex: "psychological-horror", "social-commentary")
            // et les injecter dans la requête Discovery pour cibler le bon type de film
            let adnKeywordIds = [];
            if (store.answers.lastLovedMovies?.length > 0) {
                const keywordMaps = await Promise.all(
                    store.answers.lastLovedMovies.map(m => tmdbService.getMovieKeywords(m.id))
                );
                // Compter la fréquence de chaque keyword sur tous les films de référence
                const freq = {};
                keywordMaps.flat().forEach(k => {
                    freq[k.id] = (freq[k.id] || 0) + 1;
                });
                // Garder les keywords qui apparaissent dans ≥1 film de référence, triés par fréquence
                // On prend max 4 keywords pour ne pas trop restreindre
                adnKeywordIds = Object.entries(freq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([id]) => id);
                console.log(`🔑 Keywords ADN collectés :`, adnKeywordIds);
            }

            // ── ÉTAPE 2 : TMDb — 3 sources à poids égal ──
            // Toutes les sources contribuent au même pool, le scorer IA décide ensuite.
            // Pas de priorité entre sources — évite que les suggestions IA dominent toujours.

            let candidates = [];
            const addUnique = (films) => {
                for (const f of films) {
                    if (f && !candidates.some(c => Number(c.id) === Number(f.id))) {
                        candidates.push(f);
                    }
                }
            };

            // SOURCE 1 : Recommendations TMDb depuis les films de référence
            // "Les gens qui ont aimé Get Out aiment aussi Nope, Barbarian, etc."
            if (store.answers.lastLovedMovies?.length > 0) {
                const refIds = store.answers.lastLovedMovies.map(m => m.id);
                const tmdbRecs = await tmdbService.getRecommendations(refIds);
                addUnique(tmdbRecs);
                console.log(`🎯 ${tmdbRecs.length} candidats via ADN TMDb`);
            }

            // SOURCE 2 : Discovery générale (genre blend + époque + langue + keywords)
            const discovered = await tmdbService.getAdvancedDiscovery(
                { ...store.answers, detectedLanguage, adnKeywordIds, blendedGenreIds },
                metadata,
                isReroll,
                store.rerollCount + 1,
                []
            );
            addUnique(discovered);

            // SOURCE 3 : Suggestions précises de l'IA (enrichissement du pool)
            if (metadata.specific_suggestions?.length > 0) {
                const searches = await Promise.all(
                    metadata.specific_suggestions.map(t => tmdbService.searchMovies(t).catch(() => null))
                );
                addUnique(searches.map(d => d?.results?.[0]).filter(Boolean));
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
                'Récent (2010+)':           { min: 2010, max: 9999 },
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
                'Horreur':          [27],
                'Violence extrême': [27, 53],
                'Documentaires':    [99],
                'Contenu adulte':   [],   // pas de genre TMDb direct
                'Sous-titres':      [],   // géré via langue
                'Films trop longs (>2h30)': [],  // runtime non disponible dans les candidats
            };
            const prefExcludedGenreIds = (savedPrefs.exclusions || [])
                .flatMap(ex => PREF_EXCLUDE_GENRE_MAP[ex] || []);

            // Genres à exclure (session + préférences sauvegardées)
            const EXCLUDE_GENRE_MAP = {
                horror:    [27],        // Trop de violence → horreur
                sad:       [18],        // Trop triste → drame lourd
                scary:     [27, 53],    // Films qui font peur → horreur + thriller
                adult:     [],          // Contenu adulte → géré via le prompt IA (pas de genre TMDb direct)
                slow:      [],          // Trop lent → géré via prompt IA
                complex:   [],          // Trop complexe → géré via prompt IA
                animation: [16],        // Films d'animation
                none:      []           // Rien ne me dérange
            };
            const excludedGenreIds = (store.answers.exclude || [])
                .flatMap(ex => EXCLUDE_GENRE_MAP[ex] || []);

            // Genres supplémentaires exclus pour le contexte famille
            const familyExcludedGenres = store.answers.context === 'family' ? [27, 53, 10749] : [];
            const allExcludedGenres = [...new Set([...excludedGenreIds, ...familyExcludedGenres, ...prefExcludedGenreIds])];

            if (prefExcludedGenreIds.length > 0) console.log(`🚫 Exclusions préfs permanentes : ${(savedPrefs.exclusions||[]).join(', ')} → genres [${prefExcludedGenreIds.join(',')}]`);

            // Genres requis (mood de l'utilisateur) — utilisé dans tous les niveaux de filtre
            const moodGenresArray = [...moodGenres];

            let safeCandidates = candidates.filter(c => {
                const year = parseInt(c.release_date?.split('-')[0]) || 0;
                const genres = c.genre_ids || [];

                // Films cités en référence → jamais recommandés
                if (lovedMovieIds.includes(Number(c.id))) return false;
                // Films déjà suggérés → pas de répétition
                if (store.suggestedMovieIds.includes(Number(c.id))) return false;
                // Filtre époque → s'applique à toutes les sources
                if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) return false;
                // Filtre exclusions genres → s'applique à toutes les sources (animation, horreur, etc.)
                if (allExcludedGenres.length > 0 && genres.some(g => allExcludedGenres.includes(g))) return false;
                // Filtre origine — s'applique à TOUTES les sources (TMDb recs, Discovery, IA)
                // "Américain" → only en | "Français" → only fr | "Asiatique" → ko/ja/zh/cn/th/hi
                if (langFilterSet && c.original_language && !langFilterSet.has(c.original_language)) return false;
                // Filtre genre requis — le film doit avoir au moins un genre du mood demandé
                // Évite les documentaires, drames, etc. qui viennent de SOURCE 1 (recs TMDb) ou SOURCE 3 (IA)
                if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) return false;

                return true;
            });
            console.log(`✅ ${safeCandidates.length} candidats après filtrage | époque:${store.answers.era || 'any'} | langue:${detectedLanguage || 'any'} | exclusions:${allExcludedGenres.join(',') || 'aucune'}`);

            // Tracker les contraintes relâchées pour l'affichage utilisateur
            store._relaxedSearch = null; // null = recherche normale

            // ── FALLBACK PROGRESSIF : relâche les contraintes une par une jusqu'à toujours trouver ──

            // Niveau 1 : Discovery large sans keywords (filtres époque + langue + exclusions conservés)
            if (safeCandidates.length < 6) {
                console.log(`⚠️ Pool trop petit (${safeCandidates.length}), fallback L1 Discovery large`);
                const fb1 = await tmdbService.getAdvancedDiscovery({ ...store.answers, detectedLanguage }, {}, false, 1, []);
                for (const f of fb1) {
                    const year = parseInt(f.release_date?.split('-')[0]) || 0;
                    const genres = f.genre_ids || [];
                    if (lovedMovieIds.includes(Number(f.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                    if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) continue;
                    if (allExcludedGenres.length > 0 && genres.some(g => allExcludedGenres.includes(g))) continue;
                    if (langFilterSet && f.original_language && !langFilterSet.has(f.original_language)) continue;
                    if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                    if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                }
                console.log(`📡 Pool L1 : ${safeCandidates.length} candidats`);
            }

            // Niveau 2 : lâche le genre mais GARDE la langue — respecte l'intention utilisateur
            if (safeCandidates.length < 6) {
                store._relaxedSearch = 'langue';
                console.log(`⚠️ Pool toujours petit, fallback L2 — langue conservée, genre élargi`);
                // On garde detectedLanguage pour respecter le choix langue de l'utilisateur
                const fb2 = await tmdbService.getAdvancedDiscovery({ ...store.answers, detectedLanguage }, {}, false, 1, []);
                for (const f of fb2) {
                    const year = parseInt(f.release_date?.split('-')[0]) || 0;
                    const genres = f.genre_ids || [];
                    if (lovedMovieIds.includes(Number(f.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                    if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) continue;
                    if (allExcludedGenres.length > 0 && genres.some(g => allExcludedGenres.includes(g))) continue;
                    if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                    if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                }
                console.log(`📡 Pool L2 : ${safeCandidates.length} candidats`);
            }

            // Niveau 3 : on lâche aussi le filtre époque (garde seulement exclusions genres critiques)
            if (safeCandidates.length < 6) {
                store._relaxedSearch = 'epoque';
                console.log(`⚠️ Pool toujours petit, fallback L3 sans filtre époque ni langue`);
                const fb3 = await tmdbService.getAdvancedDiscovery({}, {}, false, 1, []);
                for (const f of fb3) {
                    const year = parseInt(f.release_date?.split('-')[0]) || 0;
                    const genres = f.genre_ids || [];
                    if (lovedMovieIds.includes(Number(f.id))) continue;
                    if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                    // L3 garde les filtres époque et langue (seuls les keywords sont relâchés)
                    if (eraRange && year > 0 && (year < eraRange.min || year > eraRange.max)) continue;
                    if (langFilterSet && f.original_language && !langFilterSet.has(f.original_language)) continue;
                    if (allExcludedGenres.length > 0 && genres.some(g => allExcludedGenres.includes(g))) continue;
                    if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                    if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                }
                console.log(`📡 Pool L3 : ${safeCandidates.length} candidats`);
            }

            // Niveau 4 (nuclear) : garde uniquement le genre mood, relâche tout le reste
            if (safeCandidates.length === 0) {
                store._relaxedSearch = 'tout';
                console.log(`🚨 Fallback NUCLEAR : genre mood conservé, époque/langue/keywords ignorés`);
                try {
                    // On garde le genre mood pour rester "dans le même esprit"
                    const nuclearPrefs = { mood: store.answers.mood, blendedGenreIds: String(moodGenresArray.join(',')) };
                    const nuclear = await tmdbService.getAdvancedDiscovery(nuclearPrefs, {}, false, 1, []);
                    for (const f of nuclear) {
                        const genres = f.genre_ids || [];
                        if (lovedMovieIds.includes(Number(f.id))) continue;
                        if (store.suggestedMovieIds.includes(Number(f.id))) continue;
                        // Garde au moins le filtre genre requis et les exclusions
                        if (allExcludedGenres.length > 0 && genres.some(g => allExcludedGenres.includes(g))) continue;
                        if (moodGenresArray.length > 0 && genres.length > 0 && !moodGenresArray.some(g => genres.includes(g))) continue;
                        if (!safeCandidates.some(c => Number(c.id) === Number(f.id))) safeCandidates.push(f);
                    }
                } catch(e) { console.error('Fallback nuclear échoué', e); }
                console.log(`📡 Pool nuclear : ${safeCandidates.length} candidats`);
            }

            // Si absolument rien même après nuclear (coupure réseau totale)
            if (safeCandidates.length === 0) {
                console.warn('🚨 Aucun candidat après tous les fallbacks — erreur réseau probable');
                this.renderError(getLang() === 'en' ? 'Network issue — please try again' : 'Problème réseau — réessaie dans un instant');
                return;
            }

            loadingText.textContent = t('loading.select');

            // ── Profil d'âge — injecté dans les préférences IA ──
            const ageProfile = store.userAge
                ? window.getAgeProfile?.(store.userAge) || null
                : null;

            // ── ÉTAPE 3 : OpenAI score et classe les candidats ──
            const ranked = await openaiService.getDeepRecommendations(
                store.answers.lastLovedMovies,
                {
                    ...store.answers,
                    contextLabel, moodLabel, durationLabel, excludeLabels,
                    blendedGenreIds, adnConflictsWithMood,
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
                safeCandidates,
                isReroll,
                [...store.suggestedMovieIds, ...lovedMovieIds],
                getLang()
            );

            if (!ranked?.length) throw new Error("Erreur de scoring IA");

            // ── Dédupliquer le ranked par tmdb_id (sécurité anti-doublon) ──
            const seenRankedIds = new Set();
            const rankedDeduped = ranked.filter(r => {
                const id = Number(r.tmdb_id);
                if (!id || seenRankedIds.has(id)) return false;
                seenRankedIds.add(id);
                return true;
            });

            // ── Normalisation des scores avec spread contenu ──
            // Objectif : #1 = maxAllowed, écart max entre #1 et #3 = 15 pts
            // Ex : scores IA [88, 74, 61] → normalisés [95, 89, 83] — pas de 67% qui fait peur
            const maxAllowed = getMaxScore(store.rerollCount);
            const SPREAD_MAX = 15; // écart maximum autorisé entre #1 et le dernier affiché
            const scores = rankedDeduped.map(r => r.match_score || 0);
            const topRaw = scores[0] || 100;
            const botRaw = Math.min(...scores.slice(0, Math.min(scores.length, 5)));
            const rawRange = Math.max(topRaw - botRaw, 1);

            rankedDeduped.forEach(r => {
                const raw = r.match_score || 0;
                // Mapping linéaire compressé : topRaw → maxAllowed, botRaw → (maxAllowed - SPREAD_MAX)
                const normalized = maxAllowed - ((topRaw - raw) / rawRange) * SPREAD_MAX;
                r.match_score = Math.round(Math.max(maxAllowed - SPREAD_MAX, Math.min(maxAllowed, normalized)));
            });

            // ── Récupérer les détails complets des 3 meilleurs ──
            // Deux passes : d'abord les films avec synopsis, puis on complète avec ceux sans
            const finalMovies = [];
            const noSynopsisReserve = [];

            for (const r of rankedDeduped) {
                if (finalMovies.length >= 3) break;
                const details = await tmdbService.getMovieDetails(r.tmdb_id);
                if (!details) continue;
                if (!details.overview || details.overview.trim().length < 10) {
                    // Pas de synopsis : mettre en réserve, on les utilisera si besoin
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

            if (!finalMovies.length) throw new Error("Impossible de récupérer les détails des films");

            // Si toujours < 3 malgré tout (pool IA trop restreint), relancer une fois
            if (finalMovies.length < 3 && !isReroll) {
                console.warn(`⚠️ Seulement ${finalMovies.length} film(s) — nouveau tirage`);
                return this.processResults(true);
            }

            // ── Sauvegarder les films exacts pour le partage Duo ──
            // Person A pourra afficher ces mêmes résultats sans rappeler l'IA
            if (store.duoMode && store.duoMerged) {
                try {
                    localStorage.setItem('duo_final_movies', JSON.stringify(finalMovies));
                    localStorage.setItem('duo_final_answers', JSON.stringify(store.answers));
                } catch(e) {}
            }

            this.renderResults(finalMovies);

        } catch (e) {
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

        // ── Badge "Mode Personnalisé" si connecté ──
        document.getElementById('personalized-badge')?.remove();
        if (store.currentUser) {
            const hasFavGenres = store.answers._userFavGenres?.length > 0;
            const badge = document.createElement('div');
            badge.id = 'personalized-badge';
            badge.style.cssText = `
                display:flex;align-items:center;justify-content:center;gap:6px;
                width:fit-content;margin:0 auto 1.5rem;
                background:linear-gradient(135deg,rgba(229,9,20,0.15),rgba(139,92,246,0.12));
                border:1px solid rgba(229,9,20,0.3);border-radius:100px;
                padding:5px 14px;font-size:0.75rem;font-weight:700;
                color:rgba(255,255,255,0.8);letter-spacing:0.5px;
                animation:fadeIn 0.5s ease;text-align:center;`;
            const platformCount = store.preferredPlatforms?.length || 0;
            badge.innerHTML = hasFavGenres
                ? t('results.perso').replace('${n}', store.answers._userFavGenres.length) + (platformCount > 0 ? ` · ${platformCount} plateforme${platformCount > 1 ? 's' : ''}` : '')
                : t('results.perso2');
            if (resultsTitle) resultsTitle.after(badge);
        }

        ui.dom.moviesGrid.innerHTML = '';

        // ── Bannière "critères relâchés" si fallback L2/L3/nuclear utilisé ──
        document.getElementById('relaxed-search-banner')?.remove();
        if (store._relaxedSearch) {
            const isEn = getLang() === 'en';
            const messages = {
                langue: isEn
                    ? '🌍 We broadened the search slightly to find the best matches for you'
                    : '🌍 On a élargi légèrement la sélection pour te trouver les meilleures correspondances',
                epoque: isEn
                    ? '📅 Not enough recent films found — showing the best matches from all eras'
                    : '📅 Pas assez de films récents trouvés — voici les meilleures correspondances toutes époques confondues',
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
                padding:12px 18px;display:flex;align-items:center;gap:10px;
                font-size:0.82rem;color:rgba(255,255,255,0.75);line-height:1.4;
                animation:fadeIn 0.4s ease;`;
            banner.innerHTML = `<span style="flex:1">${msg}</span>`;
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
            const nameA    = store.duoNameA || 'Partenaire A';
            const nameB    = store.duoNameB || 'Partenaire B';
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

        movies.forEach((m, idx) => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.style.animation = `fadeInUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.18}s both`;

            // Infos providers (informatif seulement)
            const frProviders = m['watch/providers']?.results?.FR || {};
            const flatrate     = frProviders.flatrate || [];
            const rent         = frProviders.rent     || [];
            const isVOD        = flatrate.length === 0 && rent.length > 0;
            const displayProviders = flatrate.length > 0 ? flatrate : rent;
            const jwSlug = m.title
                ? encodeURIComponent(m.title.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'-'))
                : '';
            const jwUrl = `https://www.justwatch.com/fr/recherche?q=${encodeURIComponent(m.title || '')}`;
            const providersHtml = displayProviders.length > 0
                ? displayProviders.slice(0, 4).map(p => {
                    const streamUrl = STREAMING_URLS[p.provider_name]?.(m.title) || jwUrl;
                    return `<a href="${streamUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()"
                               title="Regarder sur ${p.provider_name}" class="provider-link">
                                <img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}"
                                     style="width:28px;height:28px;border-radius:7px;object-fit:cover;display:block;">
                            </a>`;
                  }).join('') + (isVOD ? `<span class="vod-badge" title="Disponible en location/achat">VOD</span>` : '')
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

            // Trailer
            const trailerVideo = m.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                || m.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Teaser')
                || m.videos?.results?.find(v => v.site === 'YouTube');
            const trailerSrc   = trailerVideo
                ? `https://www.youtube.com/embed/${trailerVideo.key}?autoplay=1`
                : null;
            const ytSearchUrl  = `https://www.youtube.com/results?search_query=${encodeURIComponent(m.title + ' ' + (m.release_date?.split('-')[0] || '') + ' ' + t('trailer.query'))}`;
            const trailerBtnHtml = trailerSrc
                ? `<button class="btn-trailer" onclick="event.stopPropagation();
                    document.getElementById('trailer-modal').style.display='flex';
                    document.getElementById('trailer-frame').src='${trailerSrc}'">${t('trailer.play')}</button>`
                : `<a class="btn-trailer btn-trailer-yt" href="${ytSearchUrl}" target="_blank" rel="noopener"
                    onclick="event.stopPropagation()">${t('trailer.search')}</a>`;

            // Métadonnées
            const rankLabels = ['#1 Match', '#2 Match', '#3 Match'];
            const rankColors = ['rgba(229,9,20,0.6)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.15)'];
            const year       = m.release_date ? m.release_date.split('-')[0] : '';
            const genres     = (m.genres || []).slice(0, 3).map(g => `<span class="genre-tag">${escapeHtml(g.name)}</span>`).join('');
            const actors     = (m.credits?.cast || []).slice(0, 3).map(a => escapeHtml(a.name)).join(' · ');

            const isInWatchlist = store.watchlist.some(w => Number(w.id) === Number(m.id));
            card.innerHTML = `
                <div class="poster-container" onclick="window.open('https://www.themoviedb.org/movie/${m.id}', '_blank')">
                    <div class="poster-bg" style="background-image:url('https://image.tmdb.org/t/p/w500${m.poster_path}')"></div>
                    <div class="poster-glow"></div>
                    <img src="https://image.tmdb.org/t/p/w500${m.poster_path}" alt="${m.title}"
                         onerror="this.src='https://via.placeholder.com/500x750/1a1a1a/E50914?text=${encodeURIComponent(m.title)}'">
                    <div class="poster-overlay"></div>
                    ${trailerBtnHtml}
                    <div style="position:absolute;top:14px;left:14px;z-index:10;
                        background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);
                        border:1px solid ${rankColors[idx]};border-radius:100px;
                        padding:4px 12px;font-size:0.62rem;font-weight:800;letter-spacing:1px;
                        color:${idx === 0 ? '#E50914' : 'rgba(255,255,255,0.8)'};text-transform:uppercase;">
                        ${rankLabels[idx]}
                    </div>
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
                        btn.innerHTML=isExp?'Voir moins &#9650;':'Voir plus &#9660;';
                    })(this)">Voir plus &#9660;</button>
                    <!-- Détails dépliables -->
                    <div class="card-details">
                        ${synopsisHtml}
                        <div class="ai-box">
                            <p style="font-size:0.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;
                                color:var(--primary-color);margin-bottom:5px;opacity:0.9;">
                                ${t('results.why')}
                            </p>
                            <p class="ai-reason">"${escapeHtml(m.match_reason)}"</p>
                        </div>
                        <!-- Notation & Déjà vu (si connecté) -->
                        <div class="rating-row" id="rating-row-${m.id}" style="display:none;">
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

            ui.dom.moviesGrid.appendChild(card);

            // Sauvegarder dans l'historique si connecté
            if (store.currentUser) {
                historyService.save(store.currentUser.id, m, store.answers.mood, m.match_score);
                // Charger et afficher l'état notation existant
                this.loadMovieRating(m);
            }
        });

        // ── Bouton Partager — sous la grille, aligné à droite ──
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
        const isLastRoll   = store.rerollCount >= REROLL_MAX_SCORES.length - 1;
        const isPremium    = store.currentUser?.user_metadata?.is_premium === true;
        const rerollsLeft  = isPremium ? Infinity : Math.max(0, REROLL_FREE_LIMIT - store.rerollCount);
        const hitLimit     = !isPremium && store.rerollCount >= REROLL_FREE_LIMIT;

        const rerollContainer = document.createElement('div');
        rerollContainer.style.cssText = 'text-align:center;width:100%;margin-top:1.5rem;margin-bottom:2.5rem;display:flex;flex-direction:column;align-items:center;gap:14px;';

        if (hitLimit) {
            // Montrer un bouton "verrouillé" qui ouvre le paywall
            rerollContainer.innerHTML = `
                <p style="font-size:0.73rem;color:#9ca3af;margin:0;">
                    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;
                        background:#E50914;margin-right:6px;vertical-align:middle;"></span>
                    ${t('results.reroll.limit.msg')}
                </p>
                <button class="btn-secondary btn-reroll-main btn-reroll-locked" id="reroll-btn" style="margin:0 auto;">
                    🔒 ${t('results.reroll.unlock')}
                </button>`;
        } else {
            rerollContainer.innerHTML = `
                ${store.rerollCount > 0 ? `
                    <p style="font-size:0.73rem;color:#9ca3af;margin:0;">
                        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;
                            background:#f5c518;margin-right:6px;vertical-align:middle;"></span>
                        ${isLastRoll
                            ? t('results.limit')
                            : t('results.nexttrio').replace('${pct}', nextPct)}
                    </p>` : ''}
                ${!isLastRoll
                    ? `<button class="btn-secondary btn-reroll-main" id="reroll-btn" style="margin:0 auto;">
                        ${t('results.reroll')}${!isPremium && rerollsLeft <= REROLL_FREE_LIMIT
                            ? ` <span class="reroll-counter">${rerollsLeft} restant${rerollsLeft > 1 ? 's' : ''}</span>`
                            : (store.rerollCount > 0 ? ` (${store.rerollCount}×)` : '')}
                       </button>
                       ${store.rerollCount === 0
                        ? `<div class="reroll-hint-badge">
                            <span class="reroll-hint-icon">✦</span>
                            <span class="reroll-hint-text">${t('results.reroll.hint')}</span>
                           </div>`
                        : ''}`
                    : `<button class="btn-secondary" style="margin:0 auto;" onclick="App.startFlow()">
                        ${t('results.redo')}
                       </button>`
                }`;
        }

        ui.dom.moviesGrid.appendChild(rerollContainer);

        const rerollBtn = document.getElementById('reroll-btn');
        if (rerollBtn) {
            if (hitLimit) {
                rerollBtn.onclick = () => App.showPaywallModal();
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

        ui.switchView('duo-start');
        this.injectDuoBg();

        const startBtn = document.getElementById('duo-start-a-btn');
        const nameInput = document.getElementById('duo-name-a-start');

        // Pré-remplir le prénom si l'utilisateur est connecté
        if (nameInput && store.currentUser) {
            const userDisplayName = store.currentUser.user_metadata?.name
                || store.currentUser.email?.split('@')[0]
                || '';
            if (userDisplayName) nameInput.value = userDisplayName;
        }

        // Focus auto sur le champ
        setTimeout(() => nameInput?.focus(), 300);

        // Lancer le questionnaire au clic ou à l'appui sur Entrée
        const launch = () => {
            // Validation : max 25 chars, pas de HTML/scripts
            const raw = nameInput?.value?.trim() || '';
            store.duoNameA = raw.slice(0, 25).replace(/[<>"'&]/g, '');
            this.startFlow(true);
        };
        if (startBtn) startBtn.onclick = launch;
        if (nameInput) nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') launch(); });
    },

    // Écran de partage — Personne A vient de terminer le questionnaire
    renderDuoShare() {
        ui.switchView('duo-share');
        this.injectDuoBg();

        // Fonction qui (re)génère le lien + QR
        const refresh = () => {
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
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(minimalAnswers))));
            const duoUrl  = `${location.origin}${location.pathname}?duo=${encodeURIComponent(encoded)}`;

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
                const nameA = store.duoNameA || 'ton partenaire';
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
        refresh();

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

        // ── Synchro localStorage : écouter si Person B termine dans un autre onglet ──
        // Stocker les réponses A pour que Person A puisse calculer les résultats
        localStorage.setItem('duo_a_answers', JSON.stringify({ ...store.answers, nameA: store.duoNameA }));
        // Purger les données des sessions précédentes pour garantir que l'event storage se déclenche
        localStorage.removeItem('duo_b_answers');
        localStorage.removeItem('duo_b_status');
        localStorage.removeItem('duo_final_movies');
        localStorage.removeItem('duo_final_answers');

        // ── Initialiser l'animation d'attente ──
        const waitingEl = document.getElementById('duo-waiting-anim');
        const waitingText = document.getElementById('duo-waiting-text');
        const nameADisplay = document.getElementById('duo-wait-name-a');
        const nameBDisplay = document.getElementById('duo-wait-name-b');
        if (nameADisplay) nameADisplay.textContent = store.duoNameA || 'Toi';

        const onStorageEvent = (e) => {
            // B vient d'ouvrir le lien — montrer l'animation "en train de répondre"
            if (e.key === 'duo_b_status' && e.newValue === 'responding') {
                if (waitingEl) waitingEl.classList.add('b-responding');
                if (waitingText) waitingText.textContent = getLang() === 'en'
                    ? '🎬 Your partner is answering right now...'
                    : '🎬 Ton partenaire répond en ce moment...';
                if (nameBDisplay) nameBDisplay.textContent = '✍️';
            }

            // Attendre que les films finaux soient disponibles (après réponse IA)
            if (e.key !== 'duo_final_movies' || !e.newValue) return;
            try {
                if (waitingEl) waitingEl.classList.add('b-done');
                if (waitingText) waitingText.textContent = getLang() === 'en' ? '✅ Your partner finished!' : '✅ Ton partenaire a terminé !';
                if (nameBDisplay) nameBDisplay.textContent = '✓';
                const readyBanner = document.getElementById('duo-partner-ready');
                if (readyBanner) readyBanner.style.display = 'flex';
                const seeBtn = document.getElementById('duo-see-results-btn');
                if (seeBtn) {
                    seeBtn.onclick = () => {
                        window.removeEventListener('storage', onStorageEvent);

                        // Charger les films EXACTS de Person B — zéro appel IA, résultats identiques
                        const finalMovies   = JSON.parse(localStorage.getItem('duo_final_movies') || '[]');
                        const finalAnswers  = JSON.parse(localStorage.getItem('duo_final_answers') || '{}');
                        const bRawAnswers   = JSON.parse(localStorage.getItem('duo_b_answers') || '{}');

                        store.answers            = finalAnswers;
                        store.duoMode            = true;
                        store.duoMerged          = true;
                        store.duoPersonBAnswers  = bRawAnswers;
                        store.duoPartnerAnswers  = JSON.parse(localStorage.getItem('duo_a_answers') || '{}');
                        // Restaurer le prénom de B pour Person A
                        if (bRawAnswers.nameB) store.duoNameB = bRawAnswers.nameB;
                        store.rerollCount        = 0;
                        store._lastMovies        = finalMovies;

                        if (finalMovies.length > 0) {
                            // Afficher directement les films sans rappeler l'IA
                            this.renderResults(finalMovies);
                        } else {
                            // Fallback : recalculer si les films n'ont pas encore été sauvegardés
                            store.suggestedMovieIds = [];
                            store.suggestedTitles   = [];
                            this.processResults();
                        }
                    };
                }
            } catch(err) { console.warn('duo sync error', err); }
        };
        window.addEventListener('storage', onStorageEvent);

        // ── Polling de secours (même onglet ou Safari qui ne déclenche pas storage) ──
        let _duoPollDone = false;
        const _duoPoll = setInterval(() => {
            if (_duoPollDone) { clearInterval(_duoPoll); return; }
            // Vérifier si B est en train de répondre
            const bStatus = localStorage.getItem('duo_b_status');
            if (bStatus === 'responding' && waitingEl && !waitingEl.classList.contains('b-responding')) {
                waitingEl.classList.add('b-responding');
                if (waitingText) waitingText.textContent = getLang() === 'en'
                    ? '🎬 Your partner is answering right now...'
                    : '🎬 Ton partenaire répond en ce moment...';
                if (nameBDisplay) nameBDisplay.textContent = '✍️';
            }
            // Vérifier si les films finaux sont disponibles
            const finalMoviesRaw = localStorage.getItem('duo_final_movies');
            if (!finalMoviesRaw) return;
            _duoPollDone = true;
            clearInterval(_duoPoll);
            // Même logique que l'event storage
            onStorageEvent({ key: 'duo_final_movies', newValue: finalMoviesRaw });
        }, 1500);

        // ── Timeout 10 min : si B ne répond pas, proposer de continuer en solo ──
        const DUO_TIMEOUT_MS = 10 * 60 * 1000;
        const _duoTimeout = setTimeout(() => {
            if (_duoPollDone) return; // B a déjà répondu, pas besoin
            _duoPollDone = true;
            clearInterval(_duoPoll);
            // Afficher bannière de timeout
            if (waitingText) waitingText.textContent = getLang() === 'en'
                ? '⏱️ Your partner hasn\'t responded yet...'
                : '⏱️ Ton partenaire n\'a pas encore répondu...';
            const timeoutBanner = document.createElement('div');
            timeoutBanner.className = 'duo-timeout-banner';
            timeoutBanner.innerHTML = `
                <p>${getLang() === 'en' ? 'Want to continue solo in the meantime?' : 'Tu veux continuer en solo en attendant ?'}</p>
                <button class="duo-timeout-solo-btn cta-btn" onclick="location.href='/'">
                    ${getLang() === 'en' ? '🎬 Continue solo' : '🎬 Continuer en solo'}
                </button>
            `;
            const waitingContainer = document.querySelector('#duo-share .duo-card') || document.querySelector('#duo-share');
            if (waitingContainer) waitingContainer.appendChild(timeoutBanner);
        }, DUO_TIMEOUT_MS);

        // Nettoyer le polling et le timeout si on quitte cet écran
        const _stopPoll = () => { _duoPollDone = true; clearInterval(_duoPoll); clearTimeout(_duoTimeout); };
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
                <p class="duo-partner-waiting">${getLang() === 'en' ? 'is waiting for tonight!' : 't\u2019attend pour ce soir !'}</p>
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
                    // Validation : max 25 chars, pas de HTML/scripts
                    const raw = nameInputB?.value?.trim() || '';
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
            context:          a?.context || 'couple',
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

    // ── Marquer / démarquer "déjà vu" ──
    async toggleSeen(movieId) {
        if (!store.currentUser) return;
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
        const row = document.getElementById(`rating-row-${movie.id}`);
        if (row) row.style.display = 'flex';

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
            ? `🎬 CineMatch IA recommended tonight for a ${mood} evening:\n\n${titles}\n\n→ Find your perfect film on CineMatch IA`
            : `🎬 CineMatch IA m'a recommandé ce soir pour une soirée ${mood} :\n\n${titles}\n\n→ Trouve ton film parfait sur CineMatch IA`;

        const btn = document.getElementById('share-btn');

        // Web Share API (mobile) ou fallback clipboard (desktop)
        if (navigator.share) {
            navigator.share({ title: 'CineMatch IA — ' + (getLang() === 'en' ? 'My recommendations' : 'Mes recommandations'), text })
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

        // Si on est sur la page "Ma Liste", rafraîchir la vue
        const watchlistView = document.getElementById('watchlist-view');
        if (watchlistView?.classList.contains('active')) {
            this.showWatchlist();
        }
    },

    showWatchlist() {
        ui.switchView('watchlist-view');
        const grid = ui.dom.watchlistGrid;
        if (!grid) return;

        // Mettre à jour le subtitle
        const sub = document.getElementById('watchlist-subtitle');
        if (sub) sub.textContent = store.watchlist.length > 0
            ? `${store.watchlist.length} film${store.watchlist.length > 1 ? 's' : ''} sauvegardé${store.watchlist.length > 1 ? 's' : ''}`
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

    // ── Préférences utilisateur ──
    showPreferences() {
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

        if (!newPwd || newPwd.length < 6) return showMsg('Le mot de passe doit faire au moins 6 caractères.', '#E50914');
        if (newPwd !== confirm) return showMsg('Les deux mots de passe ne correspondent pas.', '#E50914');

        btn.disabled    = true;
        btn.textContent = '⏳ Mise à jour...';

        try {
            const { authService } = await import('./services/supabase.js?v=7');
            await authService.updatePassword(newPwd);
            showMsg('✅ Mot de passe mis à jour avec succès !', '#46d369');
            document.getElementById('profil-pwd-new').value     = '';
            document.getElementById('profil-pwd-confirm').value = '';
        } catch(err) {
            showMsg('Erreur : ' + err.message, '#E50914');
        } finally {
            btn.disabled    = false;
            btn.textContent = '🔒 Mettre à jour le mot de passe';
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
            if (title)   title.textContent   = 'Encore plus de films !';
            if (sub)     sub.textContent     = 'Crée un compte gratuit pour débloquer des suggestions illimitées et garder ton historique.';
            if (ctaPrim) { ctaPrim.textContent = 'Créer un compte gratuit'; ctaPrim.onclick = () => openAuthTab('tab-signup'); }
            if (ctaSec)  { ctaSec.style.display = 'block'; ctaSec.textContent = 'J\'ai déjà un compte'; ctaSec.onclick = () => openAuthTab('tab-signin'); }
        } else {
            if (icon)    icon.textContent    = '⚡';
            if (title)   title.textContent   = 'Rerolls illimités';
            if (sub)     sub.textContent     = 'Tu as utilisé tes 3 suggestions gratuites. Passe Premium pour des recommandations sans limite.';
            if (ctaPrim) { ctaPrim.textContent = 'Passer Premium — 4,99€/mois'; ctaPrim.onclick = () => { this.hidePaywallModal(); /* TODO: open pricing page */ }; }
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
    }
};

// Exposer App globalement pour les onclick inline
window.App = App;

document.addEventListener('DOMContentLoaded', () => App.init());
