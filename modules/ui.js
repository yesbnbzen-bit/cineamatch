import { store } from '../state/store.js';

export const ui = {
    views: {
        hero: document.getElementById('hero'),
        questionnaire: document.getElementById('questionnaire'),
        loading: document.getElementById('loading'),
        results: document.getElementById('results'),
        'watchlist-view': document.getElementById('watchlist-view'),
        'history-view': document.getElementById('history-view'),
        'duo-start': document.getElementById('duo-start'),
        'duo-share': document.getElementById('duo-share'),
        'duo-welcome': document.getElementById('duo-welcome')
    },
    dom: {
        startBtn: document.getElementById('start-btn'),
        questionContainer: document.getElementById('question-container'),
        progress: document.getElementById('progress'),
        moviesGrid: document.getElementById('movies-grid'),
        watchlistGrid: document.getElementById('watchlist-grid'),
        restartBtn: document.getElementById('restart-btn'),
        apiModal: document.getElementById('api-modal'),
        saveApiBtn: document.getElementById('save-api-btn'),
        tmdbInput: document.getElementById('tmdb-key'),
        openaiInput: document.getElementById('openai-key'),
        configBtn: document.getElementById('config-btn'),
        watchlistNavBtn: document.getElementById('watchlist-nav-btn'),
        profileNavBtn:   document.getElementById('profile-nav-btn')
    },

    switchView(viewName) {
        Object.values(this.views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        if (this.views[viewName]) this.views[viewName].classList.add('active');
        // Scroll top — couvre window + conteneur scrollable + vue elle-même
        this._scrollTop();
        document.dispatchEvent(new CustomEvent('cinematch:view-change', { detail: viewName }));
    },

    _scrollTop() {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const main = document.getElementById('main-container');
        if (main) main.scrollTop = 0;
        const active = document.querySelector('.view.active');
        if (active) active.scrollTop = 0;
        // Reset scroll interne du questionnaire (position:fixed sur mobile)
        const q = document.getElementById('questionnaire');
        if (q) q.scrollTop = 0;
    },

    updateProgress(totalSteps) {
        const bar = document.getElementById('progress');
        if (!bar) return;
        const pct = Math.round((store.step / totalSteps) * 100);
        // setProperty avec 'important' pour forcer l'override du CSS statique
        bar.style.setProperty('width', `${pct}%`, 'important');
        console.log(`📊 Progress: step ${store.step}/${totalSteps} → ${pct}%`);
    },

    clearQuestionnaire() {
        this.dom.questionContainer.innerHTML = '';
    }
};
