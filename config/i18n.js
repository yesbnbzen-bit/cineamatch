// ─────────────────────────────────────────────────────────────────
//  CINEMATCH IA — Système de traduction FR / EN
// ─────────────────────────────────────────────────────────────────

export const TRANSLATIONS = {
    fr: {
        // Navbar
        'nav.myfilms':       'Mes Films',
        'nav.mylist':        'Mes Favoris',
        'nav.prefs':         'MON ESPACE',
        'prefs.title':       'Mon Espace',
        'prefs.settings.label': 'Préférences IA',
        'prefs.tab.platforms':  'Plateformes',
        'prefs.tab.gouts':      'Mes goûts',
        'prefs.tab.exclusions': 'Exclusions',
        'nav.config':        'CONFIG',
        'nav.connect':       'Se connecter',
        'nav.signout':       '↩ Se déconnecter',

        // Hero
        'hero.badge':        '✦ RECOMMANDATIONS PERSONNALISÉES PAR IA',
        'hero.line0':        'Assis-toi,',
        'hero.line1':        'L\'IA trouve ton film',
        'hero.line2':        'en 30 secondes',
        'hero.title':        'L\'IA trouve ton film en 30 secondes',
        'hero.subtitle':     'Marre de chercher pendant 1h ? Quelques questions et l\'IA te propose 3 films parfaits pour ce soir.',
        'hero.start':        'COMMENCER →',
        'hero.duo':          '👥 Mode Duo',
        'hero.feat1':        'Rapide',
        'hero.feat2':        '100% personnalisé',
        'hero.feat3':        'Recommandé par l\'IA',

        // Trending
        'trending.title':    'Top Match du moment',
        'trending.sublabel': 'Les plus populaires en streaming cette semaine',
        'trending.more':     'VOIR PLUS →',

        // Auth modal
        'auth.google':       'Continuer avec Google',
        'auth.or':           'ou',
        'auth.tab.login':    'Connexion',
        'auth.tab.signup':   'Inscription',
        'auth.email':        'Email',
        'auth.password':     'Mot de passe',
        'auth.password.new': 'Mot de passe (6 car. min)',
        'auth.firstname':    'Ton prénom',
        'auth.dob.label':    '🎂 Date de naissance',
        'auth.dob.hint':     'Pour personnaliser tes recommandations selon ton âge. Doit avoir 13 ans minimum.',
        'auth.dob.error.min':'Tu dois avoir au moins 13 ans pour utiliser CineMatch IA.',
        'auth.dob.error.req':'Ta date de naissance est requise.',
        'auth.login.btn':    'Se connecter',
        'auth.forgot':       'Mot de passe oublié ?',
        'auth.forgot.title': 'Réinitialiser le mot de passe',
        'auth.forgot.sub':   'Saisis ton email pour recevoir un lien de réinitialisation.',
        'auth.forgot.btn':   'Envoyer le lien',
        'auth.forgot.sent':  '✅ Email envoyé ! Vérifie ta boîte mail.',
        'auth.forgot.back':  '← Retour à la connexion',
        'auth.reset.title':  'Nouveau mot de passe',
        'auth.reset.sub':    'Choisis un nouveau mot de passe pour ton compte.',
        'auth.reset.btn':    'Mettre à jour',
        'auth.reset.ok':     '✅ Mot de passe mis à jour ! Tu peux te connecter.',
        'auth.signup.btn':   'Créer mon compte',

        // Boutons génériques
        'btn.save':          'Enregistrer',
        'btn.save.continue': 'Enregistrer et Continuer',
        'btn.close':         'Fermer',
        'btn.skip':          'Passer',
        'btn.expand':        'Voir plus ▼',
        'btn.collapse':      'Voir moins ▲',
        'btn.solo':          '🎬 Continuer en solo',

        // Paywall
        'paywall.sub':       'Crée un compte gratuit pour débloquer des suggestions illimitées et garder ton historique.',
        'paywall.cta':       'Créer un compte gratuit',
        'paywall.footnote':  '100% gratuit · Sans carte bancaire',
        'paywall.premium':   'Passer Premium — 2,99€/mois',

        // Session resume
        'resume.text':       '🎬 Tu avais une session en cours — reprendre là où tu t\'es arrêté ?',
        'resume.yes':        'Reprendre →',
        'resume.no':         'Nouvelle session',

        // Greetings
        'greet.night':       'Bonne nuit',
        'greet.morning':     'Bonjour',
        'greet.afternoon':   'Bon après-midi',
        'greet.evening':     'Bonsoir',

        // Results
        'results.title':     'Tes recommandations personnalisées',
        'results.duo.title': 'Le film parfait pour',
        'results.share':     '↗ Partager ces recommandations',
        'results.reroll':    '⟳ Autre suggestion',
        'results.adjust':    '🎯 Ajuster mes critères',
        'results.adjust.more':'Voir quand même d\'autres films',
        'results.reroll.hint':'On va chercher au-delà de tes goûts principaux.',
        'results.match':     'MATCH',
        'results.compat':    'de compatibilité',
        'results.trailer':   '● CHERCHER LA BANDE-ANNONCE',
        'results.where':     '📺 Où voir ?',
        'results.reason':    '+ POURQUOI CE FILM POUR TOI',
        'results.back':      '← Retour',

        // Questionnaire navigation
        'q.prev':            '← Précédent',
        'q.next':            'Suivant →',
        'q.letsgo':          'C\'est parti !',
        'q.skip':            'Passer',
        'q.validate':        'Continuer →',
        'q.platforms.label': 'Tes recos seront dispo sur',
        'q.platforms.more':  '+ et plus',
        'q.search.placeholder': 'Tape le titre d\'un film...',
        'q.search.limit':    '✓ Limite atteinte — 3 films max',
        'q.search.skip':     'Passer →',
        'q.search.submit':   '🎬 Lancer ma recherche',
        'q.readmore':        'Lire la suite',
        'q.readless':        'Réduire',

        // Loading
        'loading.text':      'L\'IA analyse tes goûts...',
        'loading.tmdb':      'Recherche des meilleurs films (TMDb)...',
        'loading.ai':        'L\'IA analyse ton profil...',
        'loading.select':    'L\'IA sélectionne ton top 3...',
        'loading.trivia':    'Le savais-tu ?',
        'loading.movie':     'Chargement du film…',
        'loading.profil':    'Analyse de ton profil en cours...',
        'loading.perso':     '🎯 L\'IA apprend de tes ${n} films notés...',
        'loading.mode':      '✨ Mode Personnalisé activé...',

        // Results
        'results.why':       '✦ Pourquoi ce film pour toi',
        'results.seen':      '👁 J\'ai vu ce film',
        'results.seen.done': '✓ Vu',
        'results.add':       'Ajouter à Mes Favoris',
        'results.remove':    'Retirer de Mes Favoris',
        'results.copied':    '✓ Copié !',
        'results.copylink':  '📋 Copier le lien',
        'results.copiedclip':'✓ Copié dans le presse-papier !',
        'results.limit':             'Tu as atteint la limite de suggestions pour ce profil.',
        'results.nexttrio':          'Prochain trio : ~${pct}% match — on fouille plus loin de ton profil idéal',
        'results.reroll.limit.msg':  'Tu as utilisé tes 3 suggestions gratuites.',
        'results.reroll.unlock':     'Débloquer des suggestions illimitées',
        'results.redo':              '🔄 Refaire le questionnaire',
        'results.save':      '✓ Enregistré !',
        'results.savebtn':   'Enregistrer',
        'results.perso':     '🎯 Adapté à tes goûts · ${n} genres analysés',
        'results.perso2':    '🎯 Recommandations personnalisées — note des films pour affiner encore plus',

        // Trailer
        'trailer.search':   '● CHERCHER LA BANDE-ANNONCE',
        'trailer.play':     '▶ Bande-annonce',
        'trailer.query':    'bande annonce',

        // History / Watchlist
        'history.title':     'Mes Films',
        'history.subtitle':  'Films notés et déjà vus',
        'watchlist.title':   'Mes Favoris',
        'watchlist.subtitle':'Tes films à regarder',
        'watchlist.empty':   'Ta liste est vide',
        'watchlist.hint':    'Clique sur le cœur ❤ d\'un film pour l\'ajouter ici',
        'back':              '← Retour',

        // Duo
        'duo.badge':         '👫 MODE DUO',
        'duo.start.title':   'C\'est parti à deux !',
        'duo.start.sub':     'Entre ton prénom pour personnaliser l\'expérience, puis réponds au questionnaire.',
        'duo.start.btn':     'Mon questionnaire →',
        'duo.share.title':   'Ton profil est prêt !',
        'duo.share.sub':     'Envoie le lien à ton partenaire.',
        'duo.copy':          '📋 Copier',
        'duo.share.via':     'Partager via…',
        'duo.sep':           'ou',
        'duo.together':      '🖥 Vous êtes ensemble ? Remplir ici →',

        // Duo start — titres et étapes (avec HTML)
        'duo.start.title.html':  'C\'est parti à <span style="-webkit-text-fill-color:#E50914;color:#E50914">deux</span> !',
        'duo.share.title.html':  'Ton profil est <span style="-webkit-text-fill-color:#E50914;color:#E50914">prêt</span> !',
        'duo.start.sub.html':    'Répondez ensemble pour trouver les films que vous allez <span style="color:#E50914;font-weight:700">adorer</span>.',
        'duo.start.label':       'Entre ton prénom pour commencer :',
        'duo.step1':             '<strong>Toi</strong> tu réponds<br>au questionnaire',
        'duo.step2':             'Tu envoies le lien<br>à ton <strong>partenaire</strong>',
        'duo.step3':             'L\'IA trouve les films<br>que <strong style="color:#E50914">vous deux</strong> adorerez',
        'duo.wait.you':          'Toi',

        // Profile — niveaux cinéphile
        'profile.badge.legend':     'Légende',
        'profile.badge.expert':     'Expert',
        'profile.badge.passionate': 'Passionné',
        'profile.badge.cinephile':  'Cinéphile',
        'profile.badge.amateur':    'Amateur',
        'profile.badge.beginner':   'Débutant',
        'profile.badge.sub':        'Plus tu notes de films, plus CineaMatch apprend tes goûts et te conseille mieux 🎯',
        'profile.badge.next':       'Note encore <strong>{n}</strong> film{s} pour devenir <strong style="color:{color}">{label} {emoji}</strong>',
        'profile.badge.max':        '🎉 Tu as atteint le niveau maximum !',

        // Profile — stats
        'profile.stats.films':       'Films dans mon profil',
        'profile.stats.films.hint':  'Films que tu as vus ou notés',
        'profile.stats.loved':       'Films adorés',
        'profile.stats.loved.hint':  'Que tu as noté 4★ ou 5★',
        'profile.stats.avg':         'Ta note moyenne',
        'profile.stats.avg.hint':    'Sur tous tes films notés',
        'profile.stats.genre':       'Ton genre préféré',
        'profile.stats.genre.hint':  'Le genre que tu regardes le plus',

        // Profile — tabs et états vides
        'profile.tab.rated':         '⭐ Films notés & vus',
        'profile.tab.favorites':     '❤️ Mes Favoris',
        'profile.rated.empty':       'Aucun film noté pour l\'instant.',
        'profile.rated.hint':        'Lance une recommandation, puis note ★ les films regardés pour les retrouver ici.',
        'profile.favorites.empty':   'Ta liste de favoris est vide.',
        'profile.favorites.hint':    'Clique sur ❤️ sur un film recommandé pour le sauvegarder ici.',
        'profile.films.label':       'Tes films — {n} au total',
        'profile.subtitle':          '{rated} film{s} noté{s} · {seen} vu{sv}',
        'profile.loading':           'Chargement de tes films...',
        'profile.empty.title':       'Aucun film dans ton profil pour l\'instant.',
        'profile.empty.hint':        'Lance une recommandation, puis clique ★ sur les films regardés.',

        // Paywall features
        'paywall.feature.1':     'Recommandations illimitées',
        'paywall.feature.2':     'Plus tu l\'utilises, mieux l\'IA te connaît',
        'paywall.feature.3':     'Filtre par plateformes (Netflix, Prime…)',
        'paywall.signin.btn':    'J\'ai déjà un compte',

        // Reroll paywall
        'paywall.reroll.title':  'Recommandations illimitées',
        'paywall.reroll.sub':    'Tu as utilisé tes 3 recos gratuites. Passe Premium pour en trouver autant que tu veux.',

        // Bouton suppression historique
        'history.delete':        'Retirer de mes films',
        'watchlist.remove.btn':  'Retirer de ma liste',
        'duo.partner.ready':  '🎉 Ton partenaire a terminé !',
        'duo.see.results':    'Voir les résultats →',
        'duo.welcome.title':  'Ton partenaire t\'attend !',
        'duo.welcome.sub':    'Il a déjà répondu à ses questions. Réponds à ton tour pour trouver le film parfait pour vous deux.',
        'duo.placeholder':          'Ton prénom...',
        'duo.placeholder.required': 'Entre ton prénom pour continuer',
        'duo.invite':         '${nameA} t\'invite à trouver le film parfait pour ce soir 🎬 Réponds au questionnaire !',
        'duo.wait.partner':   'Partenaire',
        'duo.wait.text':      'En attente de ton partenaire…',

        // Duo — statuts partenaire en temps réel
        'duo.partner.waiting.for':  't\'attend pour ce soir !',
        'duo.partner.answering':    '🎬 Ton partenaire répond en ce moment...',
        'duo.timeout.waiting':      '⏱️ Ton partenaire n\'a pas encore répondu...',
        'duo.timeout.solo':         'Tu veux continuer en solo en attendant ?',

        // Duo — fallbacks noms
        'duo.fallback.you':         'Toi',
        'duo.fallback.partner.name':'ton partenaire',
        'duo.fallback.partner.a':   'Partenaire A',
        'duo.fallback.partner.b':   'Partenaire B',

        // Duo gate (popup accès)
        'duo.gate.signup.title':    'Le Mode Duo t\'attend',
        'duo.gate.premium.title':   'Mode Duo — Fonctionnalité Premium',
        'duo.gate.signup.sub':      'Crée un compte gratuit pour tester le Mode Duo <strong style="color:#fff">une fois</strong>. Trouve le film parfait pour deux en quelques secondes.',
        'duo.gate.premium.sub':     'Tu as utilisé ton essai gratuit. Passe Premium pour utiliser le Mode Duo <strong style="color:#fff">sans limite</strong> et accéder à toutes les fonctionnalités.',
        'duo.gate.premium.sec':     'Voir toutes les offres',

        // Onboarding steps
        'onboard.0.title':   'Ta recommandation en 30s',
        'onboard.0.text':    'Réponds à quelques questions et l\'IA te suggère 3 films parfaits pour toi ce soir.',
        'onboard.1.title':   'Sauvegarde tes films',
        'onboard.1.text':    'Clique ❤️ sur une carte pour ajouter un film à ta liste personnelle.',
        'onboard.2.title':   'L\'IA apprend tes goûts',
        'onboard.2.text':    'Connecte-toi et note les films — l\'algo s\'améliore à chaque reco.',

        // Stats / badges
        'badge.ai':          '✨ Note ★ ou marque 👁 tes films — l\'IA s\'en souviendra',
        'stats.welcome':     '✨ Bienvenue sur CineMatch IA !',
        'subtitle.return':   'Content de te revoir ! Qu\'est-ce qu\'on regarde ce soir ?',

        // Errors
        'error.title':       'Oups, quelque chose a mal tourné',
        'error.sub':         'L\'IA n\'a pas pu terminer ton analyse.',
        'error.retry':       '↺ Recommencer',

        // Multi-sélection hints
        'q.hint.empty':      'Choisis jusqu\'à ${max} · ou passe directement',
        'q.hint.select':     'Sélectionne tes choix',
        'q.hint.complete':   '✓ Sélection complète — appuie sur Continuer',

        // Reroll counter
        'results.reroll.left': 'restant',

        // Watchlist subtitle
        'watchlist.saved':   'sauvegardé',

        // Platform badge
        'results.platform':  'plateforme',

        // Profil — changement de mot de passe
        'profile.pwd.min':      'Le mot de passe doit faire au moins 6 caractères.',
        'profile.pwd.mismatch': 'Les deux mots de passe ne correspondent pas.',
        'profile.pwd.updating': '⏳ Mise à jour...',
        'profile.pwd.success':  '✅ Mot de passe mis à jour avec succès !',
        'profile.pwd.btn':      '🔒 Mettre à jour le mot de passe',
        'profile.pwd.error':    'Erreur : ',

        // Paywall
        'paywall.more.title':   'Encore plus de films !',

        // Stripe
        'stripe.redirecting':     'Redirection...',
        'stripe.choose':          'Choisir',
        'stripe.error.create':    'Erreur lors de la création du paiement',
        'stripe.error.prefix':    'Erreur : ',
        'stripe.toast.confirmed': '🎉 Paiement confirmé ! Activation du Premium en cours...',
        'stripe.toast.activated': '⚡ Premium activé ! Bienvenue dans CineaMatch Premium.',
        'stripe.toast.cancelled': 'Paiement annulé. Tu peux reprendre quand tu veux !',
    },

    en: {
        // Navbar
        'nav.myfilms':       'My Films',
        'nav.mylist':        'My List',
        'nav.prefs':         'MY SPACE',
        'nav.config':        'CONFIG',
        'prefs.title':       'My Space',
        'prefs.settings.label': 'AI Preferences',
        'prefs.tab.platforms':  'Platforms',
        'prefs.tab.gouts':      'My Taste',
        'prefs.tab.exclusions': 'Exclusions',
        'nav.connect':       'Log in',
        'nav.signout':       '↩ Sign out',

        // Hero
        'hero.badge':        '✦ PERSONALISED RECOMMENDATIONS BY AI',
        'hero.line0':        'Sit back,',
        'hero.line1':        'our AI finds you',
        'hero.line2':        'the perfect film in 30 seconds',
        'hero.title':        'Sit back, our AI finds you the perfect film in 30 seconds',
        'hero.subtitle':     'A few questions, a deep taste analysis, and our AI picks 3 films perfectly crafted for your evening.',
        'hero.start':        'START →',
        'hero.duo':          '👥 Duo Mode',
        'hero.feat1':        'Fast',
        'hero.feat2':        '100% personalised',
        'hero.feat3':        'AI-powered',

        // Trending
        'trending.title':    'Top Match right now',
        'trending.sublabel': 'Most liked films on streaming this week',
        'trending.more':     'SEE MORE →',

        // Auth modal
        'auth.google':       'Continue with Google',
        'auth.or':           'or',
        'auth.tab.login':    'Log in',
        'auth.tab.signup':   'Sign up',
        'auth.email':        'Email',
        'auth.password':     'Password',
        'auth.password.new': 'Password (6 chars min)',
        'auth.firstname':    'Your first name',
        'auth.dob.label':    '🎂 Date of birth',
        'auth.dob.hint':     'To personalise recommendations by age. Must be 13 or older.',
        'auth.dob.error.min':'You must be at least 13 years old to use CineMatch IA.',
        'auth.dob.error.req':'Your date of birth is required.',
        'auth.login.btn':    'Log in',
        'auth.forgot':       'Forgot password?',
        'auth.forgot.title': 'Reset your password',
        'auth.forgot.sub':   'Enter your email to receive a reset link.',
        'auth.forgot.btn':   'Send link',
        'auth.forgot.sent':  '✅ Email sent! Check your inbox.',
        'auth.forgot.back':  '← Back to login',
        'auth.reset.title':  'New password',
        'auth.reset.sub':    'Choose a new password for your account.',
        'auth.reset.btn':    'Update password',
        'auth.reset.ok':     '✅ Password updated! You can now log in.',
        'auth.signup.btn':   'Create my account',

        // Generic buttons
        'btn.save':          'Save',
        'btn.save.continue': 'Save and Continue',
        'btn.close':         'Close',
        'btn.skip':          'Skip',
        'btn.expand':        'See more ▼',
        'btn.collapse':      'See less ▲',
        'btn.solo':          '🎬 Continue solo',

        // Paywall
        'paywall.sub':       'Create a free account to unlock unlimited suggestions and keep your history.',
        'paywall.cta':       'Create a free account',
        'paywall.footnote':  '100% free · No credit card required',
        'paywall.premium':   'Go Premium — €2.99/month',

        // Session resume
        'resume.text':       '🎬 You had a session in progress — pick up where you left off?',
        'resume.yes':        'Resume →',
        'resume.no':         'New session',

        // Greetings
        'greet.night':       'Good night',
        'greet.morning':     'Good morning',
        'greet.afternoon':   'Good afternoon',
        'greet.evening':     'Good evening',

        // Results
        'results.title':     'Your personalised recommendations',
        'results.duo.title': 'The perfect film for',
        'results.share':     '↗ Share these recommendations',
        'results.reroll':    '⟳ Another suggestion',
        'results.adjust':    '🎯 Adjust my criteria',
        'results.adjust.more':'See other films anyway',
        'results.reroll.hint':'We\'ll explore beyond your main preferences.',
        'results.match':     'MATCH',
        'results.compat':    'match',
        'results.trailer':   '● SEARCH TRAILER',
        'results.where':     '📺 Where to watch?',
        'results.reason':    '+ WHY THIS FILM FOR YOU',
        'results.back':      '← Back',

        // Questionnaire navigation
        'q.prev':            '← Previous',
        'q.next':            'Next →',
        'q.letsgo':          'Let\'s go!',
        'q.skip':            'Skip',
        'q.validate':        'Continue →',
        'q.platforms.label': 'Your picks will be available on',
        'q.platforms.more':  '+ more',
        'q.search.placeholder': 'Type a film title...',
        'q.search.limit':    '✓ Limit reached — 3 films max',
        'q.search.skip':     'Skip →',
        'q.search.submit':   '🎬 Start my search',
        'q.readmore':        'Read more',
        'q.readless':        'Collapse',

        // Loading
        'loading.text':      'The AI is analysing your taste...',
        'loading.tmdb':      'Searching for the best films (TMDb)...',
        'loading.ai':        'The AI is analysing your profile...',
        'loading.select':    'The AI is selecting your top 3...',
        'loading.trivia':    'Did you know?',
        'loading.movie':     'Loading film…',
        'loading.profil':    'Analysing your profile...',
        'loading.perso':     '🎯 The AI is learning from your ${n} rated films...',
        'loading.mode':      '✨ Personalised Mode activated...',

        // Results
        'results.why':       '✦ Why this film for you',
        'results.seen':      '👁 I\'ve seen this film',
        'results.seen.done': '✓ Seen',
        'results.add':       'Add to My List',
        'results.remove':    'Remove from My List',
        'results.copied':    '✓ Copied!',
        'results.copylink':  '📋 Copy link',
        'results.copiedclip':'✓ Copied to clipboard!',
        'results.limit':             'You\'ve reached the suggestion limit for this profile.',
        'results.nexttrio':          'Next trio: ~${pct}% match — searching deeper in your ideal profile',
        'results.reroll.limit.msg':  'You\'ve used your 3 free suggestions.',
        'results.reroll.unlock':     'Unlock unlimited suggestions',
        'results.redo':              '🔄 Redo the questionnaire',
        'results.save':      '✓ Saved!',
        'results.savebtn':   'Save',
        'results.perso':     '🎯 Tailored to your taste · ${n} genres analysed',
        'results.perso2':    '🎯 Personalised recommendations — rate films to refine further',

        // Trailer
        'trailer.search':   '● SEARCH TRAILER',
        'trailer.play':     '▶ Trailer',
        'trailer.query':    'trailer',

        // History / Watchlist
        'history.title':     'My Films',
        'history.subtitle':  'Rated & watched films',
        'watchlist.title':   'My List',
        'watchlist.subtitle':'Films to watch',
        'watchlist.empty':   'Your list is empty',
        'watchlist.hint':    'Click the ❤ heart on a film to add it here',
        'back':              '← Back',

        // Duo
        'duo.badge':         '👫 DUO MODE',
        'duo.start.title':   'Let\'s go, duo!',
        'duo.start.sub':     'Enter your first name to personalise the experience, then answer the questionnaire.',
        'duo.start.btn':     'My questionnaire →',
        'duo.share.title':   'Your profile is ready!',
        'duo.share.sub':     'Send the link to your partner.',
        'duo.copy':          '📋 Copy',
        'duo.share.via':     'Share via…',
        'duo.sep':           'or',
        'duo.together':      '🖥 Are you together? Fill in here →',

        // Duo start — titles and steps (with HTML)
        'duo.start.title.html':  'Let\'s go, <span style="-webkit-text-fill-color:#E50914;color:#E50914">duo</span>!',
        'duo.share.title.html':  'Your profile is <span style="-webkit-text-fill-color:#E50914;color:#E50914">ready</span>!',
        'duo.start.sub.html':    'Answer together and find films you\'ll both <span style="color:#E50914;font-weight:700">love</span>.',
        'duo.start.label':       'Enter your first name to get started:',
        'duo.step1':             '<strong>You</strong> answer<br>the questionnaire',
        'duo.step2':             'You send the link<br>to your <strong>partner</strong>',
        'duo.step3':             'The AI finds films you <strong style="color:#E50914">both</strong> will love',
        'duo.wait.you':          'You',

        // Profile — badge levels
        'profile.badge.legend':     'Legend',
        'profile.badge.expert':     'Expert',
        'profile.badge.passionate': 'Passionate',
        'profile.badge.cinephile':  'Cinephile',
        'profile.badge.amateur':    'Amateur',
        'profile.badge.beginner':   'Beginner',
        'profile.badge.sub':        'The more films you rate, the better CineaMatch learns your taste 🎯',
        'profile.badge.next':       'Rate <strong>{n}</strong> more film{s} to become <strong style="color:{color}">{label} {emoji}</strong>',
        'profile.badge.max':        '🎉 You\'ve reached the maximum level!',

        // Profile — stats
        'profile.stats.films':       'Films in my profile',
        'profile.stats.films.hint':  'Films you\'ve watched or rated',
        'profile.stats.loved':       'Loved films',
        'profile.stats.loved.hint':  'That you rated 4★ or 5★',
        'profile.stats.avg':         'Your average rating',
        'profile.stats.avg.hint':    'On all your rated films',
        'profile.stats.genre':       'Your favourite genre',
        'profile.stats.genre.hint':  'The genre you watch the most',

        // Profile — tabs and empty states
        'profile.tab.rated':         '⭐ Rated & watched',
        'profile.tab.favorites':     '❤️ My Favourites',
        'profile.rated.empty':       'No rated films yet.',
        'profile.rated.hint':        'Start a recommendation, then rate ★ watched films to find them here.',
        'profile.favorites.empty':   'Your favourites list is empty.',
        'profile.favorites.hint':    'Click ❤️ on a recommended film to save it here.',
        'profile.films.label':       'Your films — {n} total',
        'profile.subtitle':          '{rated} film{s} rated · {seen} watched',
        'profile.loading':           'Loading your films...',
        'profile.empty.title':       'No films in your profile yet.',
        'profile.empty.hint':        'Start a recommendation, then click ★ on watched films.',

        // Paywall features
        'paywall.feature.1':     'Unlimited recommendations',
        'paywall.feature.2':     'The more you use it, the better the AI knows you',
        'paywall.feature.3':     'Filter by platform (Netflix, Prime…)',
        'paywall.signin.btn':    'I already have an account',

        // Reroll paywall
        'paywall.reroll.title':  'Unlimited recommendations',
        'paywall.reroll.sub':    'You\'ve used your 3 free recos. Go Premium to find as many as you want.',

        // History/watchlist buttons
        'history.delete':        'Remove from my films',
        'watchlist.remove.btn':  'Remove from my list',
        'duo.partner.ready':  '🎉 Your partner is done!',
        'duo.see.results':    'See results →',
        'duo.welcome.title':  'Your partner is waiting!',
        'duo.welcome.sub':    'They\'ve already answered their questions. It\'s your turn to find the perfect film for both of you.',
        'duo.placeholder':          'Your first name...',
        'duo.placeholder.required': 'Enter your name to continue',
        'duo.invite':         '${nameA} invites you to find the perfect film for tonight 🎬 Answer the questionnaire!',
        'duo.wait.partner':   'Partner',
        'duo.wait.text':      'Waiting for your partner…',

        // Duo — partner status (real-time)
        'duo.partner.waiting.for':  'is waiting for tonight!',
        'duo.partner.answering':    '🎬 Your partner is answering right now...',
        'duo.timeout.waiting':      '⏱️ Your partner hasn\'t responded yet...',
        'duo.timeout.solo':         'Want to continue solo in the meantime?',

        // Duo — name fallbacks
        'duo.fallback.you':         'You',
        'duo.fallback.partner.name':'your partner',
        'duo.fallback.partner.a':   'Partner A',
        'duo.fallback.partner.b':   'Partner B',

        // Duo gate (access popup)
        'duo.gate.signup.title':    'Duo Mode is waiting for you',
        'duo.gate.premium.title':   'Duo Mode — Premium Feature',
        'duo.gate.signup.sub':      'Create a free account to try Duo Mode <strong style="color:#fff">once</strong>. Find the perfect film for two in seconds.',
        'duo.gate.premium.sub':     'You\'ve used your free trial. Go Premium for <strong style="color:#fff">unlimited</strong> Duo Mode and all features.',
        'duo.gate.premium.sec':     'See all plans',

        // Onboarding steps
        'onboard.0.title':   'Your recommendation in 30s',
        'onboard.0.text':    'Answer a few questions and the AI suggests 3 perfect films for you tonight.',
        'onboard.1.title':   'Save your films',
        'onboard.1.text':    'Click ❤️ on a card to add a film to your personal list.',
        'onboard.2.title':   'The AI learns your taste',
        'onboard.2.text':    'Log in and rate films — the algorithm improves with each recommendation.',

        // Stats / badges
        'badge.ai':          '✨ Rate ★ or mark 👁 your films — the AI will remember',
        'stats.welcome':     '✨ Welcome to CineMatch IA!',
        'subtitle.return':   'Great to see you back! What are we watching tonight?',

        // Errors
        'error.title':       'Oops, something went wrong',
        'error.sub':         'The AI couldn\'t complete your analysis.',
        'error.retry':       '↺ Try again',

        // Multi-selection hints
        'q.hint.empty':      'Pick up to ${max} · or skip',
        'q.hint.select':     'Select your choices',
        'q.hint.complete':   '✓ Complete — press Continue',

        // Reroll counter
        'results.reroll.left': 'left',

        // Watchlist subtitle
        'watchlist.saved':   'saved',

        // Platform badge
        'results.platform':  'platform',

        // Profile — password update
        'profile.pwd.min':      'Password must be at least 6 characters.',
        'profile.pwd.mismatch': 'Passwords don\'t match.',
        'profile.pwd.updating': '⏳ Updating...',
        'profile.pwd.success':  '✅ Password updated successfully!',
        'profile.pwd.btn':      '🔒 Update password',
        'profile.pwd.error':    'Error: ',

        // Paywall
        'paywall.more.title':   'More films for you!',

        // Stripe
        'stripe.redirecting':     'Redirecting...',
        'stripe.choose':          'Choose',
        'stripe.error.create':    'Error creating payment',
        'stripe.error.prefix':    'Error: ',
        'stripe.toast.confirmed': '🎉 Payment confirmed! Activating Premium...',
        'stripe.toast.activated': '⚡ Premium activated! Welcome to CineaMatch Premium.',
        'stripe.toast.cancelled': 'Payment cancelled. Come back whenever you\'re ready!',
    }
};

// ── Langue active (FR par défaut) ──────────────────────────────
let _lang = localStorage.getItem('cinematch_lang') || 'fr';

export function getLang() { return _lang; }

export function t(key) {
    return TRANSLATIONS[_lang]?.[key] ?? TRANSLATIONS['fr']?.[key] ?? key;
}

export function setLang(lang) {
    if (!TRANSLATIONS[lang]) return;
    _lang = lang;
    localStorage.setItem('cinematch_lang', lang);
    applyTranslations();
    // Notifier l'app pour re-rendre les composants dynamiques
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// ── Applique les traductions sur tous les éléments data-i18n ──
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const attr = el.getAttribute('data-i18n-attr'); // ex: "placeholder"
        const isHtml = el.hasAttribute('data-i18n-html'); // innerHTML (pour spans colorés)
        const val = t(key);
        // Ne pas écraser le contenu si la clé n'est pas trouvée
        if (val === key) return;
        if (attr) {
            el.setAttribute(attr, val);
        } else if (isHtml) {
            el.innerHTML = val; // pour les éléments avec HTML formaté (spans, strong, etc.)
        } else {
            el.textContent = val;
        }
    });

    // Mettre à jour le switcher dropdown
    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === _lang);
    });
    const pillLabel = document.getElementById('lang-pill-label');
    if (pillLabel) pillLabel.textContent = _lang === 'en' ? 'English' : 'Français';

    // Fermer le dropdown si ouvert
    document.getElementById('lang-switcher')?.classList.remove('open');
}
