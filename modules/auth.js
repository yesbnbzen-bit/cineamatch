// ─────────────────────────────────────────────────────────────────
//  CineaMatch IA — Module Auth
//  Gère l'affichage de la modale et l'état de connexion
// ─────────────────────────────────────────────────────────────────

import { authService, watchlistService, historyService, ratingsService, preferencesService } from '../services/supabase.js?v=8';
import { store } from '../state/store.js?v=43';
import { t, applyTranslations } from '../config/i18n.js?v=342';

// ── Calcule l'âge en années à partir d'une date "YYYY-MM-DD" ──
function _calcAge(birthDateStr) {
    if (!birthDateStr) return null;
    const today = new Date();
    const birth = new Date(birthDateStr);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

// ── Retourne le profil d'âge pour l'IA ──
export function getAgeProfile(age) {
    if (!age || age < 13) return null;
    if (age < 18) return {
        label: 'Adolescent (13-17 ans)',
        hint: 'Priorise les films coming-of-age, aventure, animation, comédie adolescente. Évite strictement les contenus adultes explicites, la violence extrême, et les thèmes très lourds.',
        excludeAdult: true
    };
    if (age < 26) return {
        label: 'Jeune adulte (18-25 ans)',
        hint: 'Profil ouvert : action, humour, horreur, thriller, feel-good, films de fac et d\'émancipation bien reçus. Pas de restrictions particulières.',
        excludeAdult: false
    };
    if (age < 36) return {
        label: 'Adulte (26-35 ans)',
        hint: 'Apprécie les drames construits, les thrillers psychologiques, les films à ambition narrative. Légèreté toujours bienvenue mais privilégie la substance.',
        excludeAdult: false
    };
    return {
        label: 'Adulte confirmé (36 ans et +)',
        hint: 'Sensible aux grands classiques, aux œuvres à rythme posé, aux films à portée philosophique ou émotionnelle profonde. Évite de recommander des films typiquement "ados" sauf si le mood le demande explicitement.',
        excludeAdult: false
    };
}

export const authUI = {

    currentUser: null,

    // ── Initialisation ──
    async init() {
        // Vérifier si une session existe déjà
        const session = await authService.getSession();
        if (session?.user) {
            await this.onLogin(session.user);
        }

        // Écouter les changements d'état auth
        authService.onAuthChange(async (user) => {
            if (user) {
                await this.onLogin(user);
            } else {
                this.onLogout();
            }
        });

        // Bouton "Se connecter" dans la navbar
        const loginBtn = document.getElementById('auth-btn');
        if (loginBtn) loginBtn.addEventListener('click', () => this.showModal());

        // Fermeture de la modale
        document.getElementById('auth-modal-close')?.addEventListener('click', () => this.hideModal());
        document.getElementById('auth-modal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'auth-modal-overlay') this.hideModal();
        });

        // Tabs inscription / connexion
        document.getElementById('tab-signin')?.addEventListener('click', () => this.showTab('signin'));
        document.getElementById('tab-signup')?.addEventListener('click', () => this.showTab('signup'));

        // Formulaires
        document.getElementById('form-signin')?.addEventListener('submit', (e) => this.handleSignIn(e));
        document.getElementById('form-signup')?.addEventListener('submit', (e) => this.handleSignUp(e));

        // Google
        document.getElementById('btn-google')?.addEventListener('click', () => this.handleGoogle());
    },

    // ── Connexion réussie ──
    async onLogin(user) {
        this.currentUser = user;
        store.currentUser = user;

        // Calculer et stocker l'âge depuis les métadonnées
        const birthDate = user.user_metadata?.birth_date || null;
        store.userAge = birthDate ? _calcAge(birthDate) : null;

        // Charger les préférences (plateformes + prefs de reco)
        store.preferredPlatforms = preferencesService.loadPlatforms(user);
        store.recoPrefs = preferencesService.loadRecoPrefs(user);

        const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Toi';
        const initials = name.slice(0, 2).toUpperCase();

        // Mettre à jour la navbar
        const authBtn = document.getElementById('auth-btn');
        const userMenu = document.getElementById('user-menu');
        if (authBtn) authBtn.style.display = 'none';
        if (userMenu) userMenu.style.display = 'flex';
        const userAvatar = document.getElementById('user-avatar');
        const userName   = document.getElementById('user-name');
        if (userAvatar) userAvatar.textContent = initials;
        if (userName)   userName.textContent   = name;

        // Afficher bouton "Mon Espace" (remplace MES FILMS + MA LISTE + PERSONNALISATION)
        const prefsBtn = document.getElementById('prefs-nav-btn');
        if (prefsBtn) prefsBtn.style.display = 'flex';

        // Afficher bouton "Mes Films" (profil cinéphile)
        const profileNavBtn = document.getElementById('profile-nav-btn');
        if (profileNavBtn) profileNavBtn.style.display = 'flex';


        // Onboarding uniquement au premier login de cet utilisateur
        const onbKey = `cineamatch_onboarded_${user.id}`;
        if (!localStorage.getItem(onbKey)) {
            localStorage.setItem(onbKey, '1');
            // Supprimer l'ancienne clé générique si elle existe
            localStorage.removeItem('cineamatch_onboarded');
            // Déclencher l'onboarding après un court délai
            setTimeout(() => {
                if (window.cineamatchApp?._initOnboarding) {
                    window.cineamatchApp._initOnboarding(true);
                }
            }, 800);
        }

        // Charger la watchlist depuis Supabase
        const items = await watchlistService.getAll(user.id);
        store.watchlist = items.map(i => ({
            id: i.movie_id, title: i.title,
            poster_path: i.poster_path, release_date: i.year ? `${i.year}-01-01` : ''
        }));

        // Personnaliser le hero
        await this.updateHero(user, name);

        // ── Si les résultats sont déjà affichés, révéler les lignes de notation ──
        // (cas où auth se restaure après que les cartes ont été rendues)
        const resultsView = document.getElementById('results');
        if (resultsView?.classList.contains('active')) {
            document.querySelectorAll('.rating-row').forEach(row => {
                row.style.display = 'flex';
            });
            // Afficher le badge Mode Personnalisé si pas encore là
            if (!document.getElementById('personalized-badge')) {
                const h2 = document.querySelector('#results h2');
                const badge = document.createElement('div');
                badge.id = 'personalized-badge';
                badge.style.cssText = `
                    display:inline-flex;align-items:center;gap:6px;
                    background:linear-gradient(135deg,rgba(229,9,20,0.15),rgba(139,92,246,0.12));
                    border:1px solid rgba(229,9,20,0.3);border-radius:100px;
                    padding:5px 14px;font-size:0.75rem;font-weight:700;
                    color:rgba(255,255,255,0.8);letter-spacing:0.5px;
                    margin-bottom:1.5rem;animation:fadeIn 0.5s ease;`;
                badge.innerHTML = t('badge.ai');
                if (h2) h2.after(badge);
            }
        }

        this.hideModal();
        console.log(`✅ Connecté : ${name}`);
    },

    // ── Personnaliser le hero avec stats ──
    async updateHero(user, name) {
        const greeting  = document.getElementById('hero-greeting');
        const greetName = document.getElementById('greeting-name');
        const greetWave = document.getElementById('greeting-wave');
        const statsEl   = document.getElementById('hero-stats');
        const subtitle  = document.getElementById('hero-subtitle');

        if (greetName) greetName.textContent = name;

        // Heure → salutation adaptée (traduite)
        const hour = new Date().getHours();
        const salutKey = hour < 6 ? 'greet.night' : hour < 12 ? 'greet.morning' : hour < 18 ? 'greet.afternoon' : 'greet.evening';
        if (greetWave) greetWave.textContent = hour < 6 ? '🌙' : hour < 12 ? '☀️' : hour < 18 ? '👋' : '🌙';
        const greetSalut = document.getElementById('greeting-salut');
        if (greetSalut) greetSalut.textContent = t(salutKey);

        if (greeting) greeting.style.display = 'flex';

        // Charger stats depuis historique + profil d'apprentissage
        const [history, topRated, ratingProfile] = await Promise.all([
            historyService.getAll(user.id, 100),
            ratingsService.getTopRated(user.id),
            ratingsService.getRatingProfile(user.id)
        ]);

        // ── Indicateur d'apprentissage IA ──
        // Aparaît sous la salutation quand ≥3 films sont notés
        const existingBadge = document.getElementById('ai-learning-badge');
        if (existingBadge) existingBadge.remove();

        if (ratingProfile && ratingProfile.totalRated >= 3) {
            const badge = document.createElement('div');
            badge.id = 'ai-learning-badge';

            // Niveau d'apprentissage selon le nombre de notes
            const level = ratingProfile.totalRated >= 20 ? { icon: '🧠', label: 'Expert', color: 'rgba(139,92,246,0.25)', border: 'rgba(139,92,246,0.5)' }
                        : ratingProfile.totalRated >= 10 ? { icon: '🎯', label: 'Avancé',  color: 'rgba(70,211,105,0.15)',  border: 'rgba(70,211,105,0.45)' }
                        : { icon: '✨', label: 'Actif',    color: 'rgba(229,9,20,0.12)',    border: 'rgba(229,9,20,0.35)' };

            badge.style.cssText = `
                display:inline-flex; align-items:center; gap:7px;
                background:${level.color}; border:1px solid ${level.border};
                border-radius:100px; padding:5px 14px 5px 10px;
                font-size:0.78rem; font-weight:700; color:rgba(255,255,255,0.85);
                letter-spacing:0.3px; margin-top:0.9rem; cursor:default;
                animation:fadeIn 0.6s ease both; animation-delay:0.3s; opacity:0;
            `;
            badge.innerHTML = `
                ${level.icon}
                <span>L'IA connaît tes goûts</span>
                <span style="opacity:0.55;font-size:0.72rem;font-weight:500">${ratingProfile.totalRated} film${ratingProfile.totalRated > 1 ? 's' : ''} notés · niveau ${level.label}</span>
            `;
            badge.title = `Films adorés : ${ratingProfile.loved.map(r => r.title).join(', ') || '—'}`;

            // Insérer après la greeting
            const heroGreeting = document.getElementById('hero-greeting');
            if (heroGreeting) heroGreeting.after(badge);
        }

        if (history.length > 0 && statsEl) {
            const GENRE_NAMES = {
                35:'Comédie', 28:'Action', 10751:'Famille', 12:'Aventure',
                53:'Thriller', 27:'Horreur', 18:'Drame', 10749:'Romance',
                878:'SF', 9648:'Mystère', 80:'Crime', 16:'Animation'
            };
            // Genre favori
            const freq = {};
            history.forEach(h => (h.genre_ids||[]).forEach(g => freq[g] = (freq[g]||0)+1));
            const topGenreId = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0];
            const topGenre   = GENRE_NAMES[topGenreId] || null;
            // Match moyen
            const avgMatch = Math.round(history.reduce((s,h) => s+(h.match_score||80),0) / history.length);

            statsEl.innerHTML = `
                <span class="stat-chip">🎬 ${history.length} film${history.length>1?'s':''} recommandé${history.length>1?'s':''}</span>
                ${topGenre ? `<span class="stat-chip red">❤️ ${topGenre}</span>` : ''}
                ${avgMatch ? `<span class="stat-chip green">⭐ ${avgMatch}% de match moyen</span>` : ''}
                ${topRated.length > 0 ? `<span class="stat-chip">✨ ${topRated.length} film${topRated.length>1?'s':''} bien noté${topRated.length>1?'s':''}</span>` : ''}
            `;
            statsEl.style.display = 'flex';

            if (subtitle) subtitle.textContent = t('subtitle.return');
        } else if (statsEl) {
            statsEl.innerHTML = `<span class="stat-chip">${t('stats.welcome')}</span>`;
            statsEl.style.display = 'flex';
        }
    },

    // ── Afficher la page "Mes Films" (notés + déjà vus uniquement) ──
    async showHistory() {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const histView = document.getElementById('history-view');
        if (histView) histView.classList.add('active');

        const grid      = document.getElementById('history-grid');
        const empty     = document.getElementById('history-empty');
        const subtitle  = document.getElementById('history-subtitle');
        const badgeWrap = document.getElementById('profile-badge-wrap');
        const badgeCard = document.getElementById('profile-badge-card');
        const statsRow  = document.getElementById('profile-stats-row');
        const tabs      = document.getElementById('profile-tabs');

        if (!grid || !store.currentUser) return;

        // État de chargement
        grid.innerHTML = `<p style="color:rgba(255,255,255,0.3);text-align:center;padding:3rem;grid-column:1/-1">${t('profile.loading')}</p>`;
        if (empty)     empty.style.display    = 'none';
        if (badgeWrap) badgeWrap.style.display = 'none';
        if (statsRow)  statsRow.style.display  = 'none';
        if (tabs)      tabs.style.display      = 'none';

        // ── Charger films notés/vus ──
        const films = await ratingsService.getAllRatedOrSeen(store.currentUser.id);
        const total = films.length;

        // ── Niveaux cinéphile ──
        const BADGES = [
            { min: 100, emoji: '🎖', labelKey: 'profile.badge.legend',     color: '#9b59b6', next: null },
            { min: 50,  emoji: '🏆', labelKey: 'profile.badge.expert',     color: '#E50914', next: 100  },
            { min: 25,  emoji: '🎭', labelKey: 'profile.badge.passionate', color: '#f39c12', next: 50   },
            { min: 10,  emoji: '⭐', labelKey: 'profile.badge.cinephile',  color: '#46d369', next: 25   },
            { min: 3,   emoji: '🍿', labelKey: 'profile.badge.amateur',    color: '#3498db', next: 10   },
            { min: 0,   emoji: '🎬', labelKey: 'profile.badge.beginner',   color: '#95a5a6', next: 3    },
        ];
        BADGES.forEach(b => { b.label = t(b.labelKey); });
        const badge = BADGES.find(b => total >= b.min);
        const nextBadge = badge.next ? BADGES[BADGES.indexOf(badge) - 1] : null;
        const progressPct = badge.next
            ? Math.round(((total - badge.min) / (badge.next - badge.min)) * 100)
            : 100;
        const remaining = badge.next ? badge.next - total : 0;

        // ── Rendu badge ──
        if (badgeCard && badgeWrap) {
            const userName = store.currentUser.user_metadata?.name
                || store.currentUser.email?.split('@')[0] || '';
            badgeCard.innerHTML = `
                <div class="pbadge-emoji">${badge.emoji}</div>
                <div class="pbadge-info">
                    <div class="pbadge-name">${userName ? userName + ' · ' : ''}<span style="color:${badge.color}">${badge.label}</span></div>
                    <div class="pbadge-sub">${t('profile.badge.sub')}</div>
                    ${badge.next ? `
                    <div class="pbadge-progress-wrap">
                        <div class="pbadge-progress-bar" style="width:${progressPct}%;background:${badge.color}"></div>
                    </div>
                    <div class="pbadge-progress-label">
                        ${t('profile.badge.next')
                            .replace('{n}', `<strong>${remaining}</strong>`)
                            .replace('{s}', remaining > 1 ? 's' : '')
                            .replace('{color}', nextBadge?.color || '')
                            .replace('{label}', nextBadge?.label || '')
                            .replace('{emoji}', nextBadge?.emoji || '')}
                    </div>
                    ` : `<div class="pbadge-progress-label" style="color:${badge.color}">${t('profile.badge.max')}</div>`}
                </div>
            `;
            badgeWrap.style.display = 'block';
        }

        // ── Sous-titre ──
        const ratedCount = films.filter(f => f.rating).length;
        const seenCount  = films.filter(f => f.seen).length;
        if (subtitle) subtitle.textContent = ratedCount > 0
            ? `${ratedCount} film${ratedCount>1?'s':''} ${t('profile.tab.rated').includes('Rated') ? 'rated' : 'noté'+((ratedCount>1)?'s':'')} · ${seenCount} ${t('profile.tab.rated').includes('Rated') ? 'watched' : 'vu'+((seenCount>1)?'s':'')}`
            : (t('profile.loading').includes('Loading') ? 'Start rating films to see your stats!' : 'Commence à noter des films pour voir tes stats !');

        // ── Cas : aucun film ──
        if (total === 0) {
            grid.innerHTML = '';
            if (empty) {
                empty.style.display = 'block';
                empty.innerHTML = `
                    <div class="history-empty-icon">🎬</div>
                    <p>${t('profile.empty.title')}</p>
                    <p style="color:rgba(255,255,255,0.3);font-size:0.9rem;margin-top:0.5rem;">${t('profile.empty.hint')}</p>`;
            }
            this._renderWatchlistTab(store.watchlist);
            if (tabs) tabs.style.display = 'flex';
            return;
        }

        // ── Stats ──
        const lovedCount = films.filter(f => f.rating >= 4).length;
        const avgRating  = ratedCount > 0
            ? (films.filter(f => f.rating).reduce((s, f) => s + f.rating, 0) / ratedCount)
            : null;
        const avgStars = avgRating ? Math.round(avgRating) : null;

        // Genre favori (seulement si données disponibles)
        const GENRE_NAMES_H = {
            35:'Comédie', 28:'Action', 10751:'Famille', 12:'Aventure', 53:'Thriller',
            27:'Horreur', 18:'Drame', 10749:'Romance', 878:'SF', 9648:'Mystère',
            80:'Crime', 16:'Animation', 99:'Documentaire', 14:'Fantastique', 37:'Western'
        };
        const genreFreq = {};
        films.forEach(f => (f.genre_ids || []).forEach(g => genreFreq[g] = (genreFreq[g]||0) + 1));
        const topGenreEntries = Object.entries(genreFreq).sort((a,b) => b[1]-a[1]);
        const topGenreName = topGenreEntries.length
            ? (GENRE_NAMES_H[topGenreEntries[0][0]] || null) : null;

        if (statsRow) {
            const avgStarsHtml = avgStars
                ? [1,2,3,4,5].map(n => `<span style="color:${n<=avgStars?'#f5c518':'rgba(255,255,255,0.2)'}">★</span>`).join('')
                : null;
            statsRow.innerHTML = `
                <div class="pstat-card">
                    <div class="pstat-icon">🎬</div>
                    <div class="pstat-value">${total}</div>
                    <div class="pstat-label">${t('profile.stats.films')}</div>
                    <div class="pstat-hint">${t('profile.stats.films.hint')}</div>
                </div>
                <div class="pstat-card">
                    <div class="pstat-icon">❤️</div>
                    <div class="pstat-value">${lovedCount}</div>
                    <div class="pstat-label">${t('profile.stats.loved')}</div>
                    <div class="pstat-hint">${t('profile.stats.loved.hint')}</div>
                </div>
                ${avgStarsHtml ? `
                <div class="pstat-card">
                    <div class="pstat-stars">${avgStarsHtml}</div>
                    <div class="pstat-value">${avgRating.toFixed(1)}<span style="font-size:0.9rem;opacity:0.5">/5</span></div>
                    <div class="pstat-label">${t('profile.stats.avg')}</div>
                    <div class="pstat-hint">${t('profile.stats.avg.hint')}</div>
                </div>` : ''}
                ${topGenreName ? `
                <div class="pstat-card">
                    <div class="pstat-icon">🎭</div>
                    <div class="pstat-value pstat-genre-val">${topGenreName}</div>
                    <div class="pstat-label">${t('profile.stats.genre')}</div>
                    <div class="pstat-hint">${t('profile.stats.genre.hint')}</div>
                </div>` : ''}
            `;
            statsRow.style.display = 'flex';
        }

        // ── Onglets ──
        if (tabs) tabs.style.display = 'flex';
        window._profileFilms = films; // stocker pour re-render sans recharger

        // ── Grille films notés (onglet par défaut) ──
        this._renderRatedTab(films);
        this._renderWatchlistTab(store.watchlist);

        // Activer l'onglet "Films notés" par défaut
        document.getElementById('ptab-rated')?.classList.add('active');
        document.getElementById('ptab-list')?.classList.remove('active');
        grid.style.display = '';
        const wlGrid = document.getElementById('profile-watchlist-grid');
        const wlEmpty = document.getElementById('profile-watchlist-empty');
        if (wlGrid) wlGrid.style.display = 'none';
        if (wlEmpty) wlEmpty.style.display = 'none';
    },

    _renderRatedTab(films) {
        const grid  = document.getElementById('history-grid');
        const empty = document.getElementById('history-empty');
        if (!grid) return;
        grid.innerHTML = '';
        if (films.length === 0) {
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';
        films.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style.animationDelay = `${i * 0.04}s`;
            const poster = f.poster_path
                ? `https://image.tmdb.org/t/p/w342${f.poster_path}`
                : `https://via.placeholder.com/300x450/1a1a1a/E50914?text=${encodeURIComponent(f.title||'')}`;
            const starsHtml = f.rating
                ? `<div class="history-item-rating">${[1,2,3,4,5].map(n=>`<span class="hstar${n<=f.rating?' on':''}">★</span>`).join('')}</div>`
                : '';
            const seenBadge = (f.seen && !f.rating) ? `<div class="history-item-seen">✓ Vu</div>` : '';
            item.innerHTML = `
                <img src="${poster}" alt="${f.title||''}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450/1a1a1a/555?text=?'">
                <div class="history-item-overlay">
                    <p class="history-item-title">${f.title||'—'}</p>
                    ${starsHtml}
                </div>
                ${seenBadge}
                <button class="history-item-delete" title="${t('history.delete')}">✕</button>
            `;
            item.onclick = () => window.open(`https://www.themoviedb.org/movie/${f.movie_id}`, '_blank');
            item.querySelector('.history-item-delete').onclick = async (e) => {
                e.stopPropagation();
                if (!store.currentUser) return;
                item.style.transition = 'opacity 0.25s,transform 0.25s';
                item.style.opacity = '0'; item.style.transform = 'scale(0.85)';
                await ratingsService.removeEntry(store.currentUser.id, f.movie_id);
                setTimeout(() => item.remove(), 260);
            };
            grid.appendChild(item);
        });
    },

    _renderWatchlistTab(watchlist) {
        const wlGrid  = document.getElementById('profile-watchlist-grid');
        const wlEmpty = document.getElementById('profile-watchlist-empty');
        if (!wlGrid) return;
        wlGrid.innerHTML = '';
        wlGrid.style.display = 'none';
        if (wlEmpty) wlEmpty.style.display = 'none';
        if (!watchlist || watchlist.length === 0) return;
        watchlist.forEach((m, i) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style.animationDelay = `${i * 0.04}s`;
            const poster = m.poster_path
                ? `https://image.tmdb.org/t/p/w342${m.poster_path}`
                : `https://via.placeholder.com/300x450/1a1a1a/E50914?text=${encodeURIComponent(m.title||'')}`;
            item.innerHTML = `
                <img src="${poster}" alt="${m.title||''}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450/1a1a1a/555?text=?'">
                <div class="history-item-overlay">
                    <p class="history-item-title">${m.title||'—'}</p>
                    ${m.release_date ? `<p class="history-item-meta">${m.release_date.split('-')[0]}</p>` : ''}
                </div>
                <button class="watchlist-btn active" onclick="toggleWatchlist(event,${m.id})" title="${t('watchlist.remove.btn')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
            `;
            item.onclick = (e) => { if (!e.target.closest('.watchlist-btn')) window.open(`https://www.themoviedb.org/movie/${m.id}`, '_blank'); };
            wlGrid.appendChild(item);
        });
    },

    // ── Déconnexion ──
    onLogout() {
        this.currentUser = null;
        store.currentUser = null;

        const authBtn = document.getElementById('auth-btn');
        const userMenu = document.getElementById('user-menu');
        if (authBtn) authBtn.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';

        // Masquer les boutons connecté-only
        const prefsBtn = document.getElementById('prefs-nav-btn');
        if (prefsBtn) prefsBtn.style.display = 'none';
        const profileNavBtn = document.getElementById('profile-nav-btn');
        if (profileNavBtn) profileNavBtn.style.display = 'none';

        // Vider la watchlist en mémoire (repassage en localStorage)
        store.watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
        console.log('👋 Déconnecté');
    },

    // ── Afficher la modale ──
    showModal(tab = 'signin') {
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('visible'), 10);
        }
        this.showTab(tab);
        this.clearErrors();
    },

    hideModal() {
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => { overlay.style.display = 'none'; }, 300);
        }
    },

    // ── Changer l'onglet Connexion / Inscription ──
    showTab(tab) {
        document.getElementById('tab-signin')?.classList.toggle('active', tab === 'signin');
        document.getElementById('tab-signup')?.classList.toggle('active', tab === 'signup');
        document.getElementById('form-signin')?.classList.toggle('hidden', tab !== 'signin');
        document.getElementById('form-signup')?.classList.toggle('hidden', tab !== 'signup');
    },

    // ── Connexion email ──
    async handleSignIn(e) {
        e.preventDefault();
        const email    = document.getElementById('signin-email')?.value?.trim();
        const password = document.getElementById('signin-password')?.value;
        const btn      = document.getElementById('btn-signin');

        this.setLoading(btn, true);
        this.clearErrors();

        try {
            await authService.signIn(email, password);
            // onLogin sera déclenché par onAuthChange
        } catch (err) {
            this.showError('signin-error', this.friendlyError(err.message));
        } finally {
            this.setLoading(btn, false);
        }
    },

    // ── Inscription email ──
    async handleSignUp(e) {
        e.preventDefault();
        const name     = document.getElementById('signup-name')?.value?.trim();
        const email    = document.getElementById('signup-email')?.value?.trim();
        const password = document.getElementById('signup-password')?.value;
        const dobInput = document.getElementById('signup-dob')?.value;
        const btn      = document.getElementById('btn-signup');

        if (password.length < 6) {
            this.showError('signup-error', 'Le mot de passe doit faire au moins 6 caractères.');
            return;
        }

        // Validation date de naissance
        if (!dobInput) {
            this.showError('signup-error', t('auth.dob.error.req'));
            return;
        }
        const age = _calcAge(dobInput);
        if (age < 13) {
            this.showError('signup-error', t('auth.dob.error.min'));
            return;
        }

        this.setLoading(btn, true);
        this.clearErrors();

        try {
            await authService.signUp(email, password, name, dobInput);
            this.showSuccess('signup-error', '✅ Vérifie tes emails pour confirmer ton compte !');
        } catch (err) {
            this.showError('signup-error', this.friendlyError(err.message));
        } finally {
            this.setLoading(btn, false);
        }
    },

    // ── Connexion Google ──
    async handleGoogle() {
        try {
            await authService.signInWithGoogle();
            // La page sera redirigée, onAuthChange prendra le relais au retour
        } catch (err) {
            this.showError('signin-error', 'Erreur Google : ' + err.message);
        }
    },

    // ── Déconnexion ──
    async handleSignOut() {
        await authService.signOut();
        window.location.reload();
    },

    // ── Helpers UI ──
    setLoading(btn, loading) {
        if (!btn) return;
        btn.disabled = loading;
        btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
        btn.textContent = loading ? t('loading.profil') : btn.dataset.originalText;
    },

    showError(id, msg) {
        const el = document.getElementById(id);
        if (el) { el.textContent = msg; el.style.color = '#E50914'; el.style.display = 'block'; }
    },

    showSuccess(id, msg) {
        const el = document.getElementById(id);
        if (el) { el.textContent = msg; el.style.color = '#46d369'; el.style.display = 'block'; }
    },

    clearErrors() {
        ['signin-error', 'signup-error'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = ''; el.style.display = 'none'; }
        });
    },

    friendlyError(msg) {
        if (msg.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
        if (msg.includes('Email not confirmed'))       return 'Confirme d\'abord ton email.';
        if (msg.includes('already registered'))        return 'Cet email est déjà utilisé. Connecte-toi !';
        if (msg.includes('Password should be'))        return 'Mot de passe trop court (6 caractères min).';
        return msg;
    }
};
