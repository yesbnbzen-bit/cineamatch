// Simple auth module - localStorage-based for demo/MVP
// In production, replace with a real backend (Supabase, Firebase, etc.)

const USERS_KEY = 'cinematch_users';
const SESSION_KEY = 'cinematch_session';

function getUsers() {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export const auth = {
    getCurrentUser() {
        const session = localStorage.getItem(SESSION_KEY);
        if (!session) return null;
        try {
            return JSON.parse(session);
        } catch {
            return null;
        }
    },

    isLoggedIn() {
        return this.getCurrentUser() !== null;
    },

    isPremium() {
        const user = this.getCurrentUser();
        return user && user.plan === 'premium';
    },

    register(email, password, plan = 'free') {
        const users = getUsers();
        if (users[email]) {
            throw new Error('Un compte avec cet email existe déjà.');
        }
        const user = { email, password: btoa(password), plan, createdAt: Date.now() };
        users[email] = user;
        saveUsers(users);
        const session = { email, plan };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    },

    login(email, password) {
        const users = getUsers();
        const user = users[email];
        if (!user || user.password !== btoa(password)) {
            throw new Error('Email ou mot de passe incorrect.');
        }
        const session = { email, plan: user.plan };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    },

    logout() {
        localStorage.removeItem(SESSION_KEY);
    },

    // For dev/demo: create a premium user quickly
    upgradeToPremium(email) {
        const users = getUsers();
        if (users[email]) {
            users[email].plan = 'premium';
            saveUsers(users);
            const session = { email, plan: 'premium' };
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
    }
};
