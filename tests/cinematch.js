// ─────────────────────────────────────────────────────────────────
//  CINEMATCH — Agent de test Playwright
//  Remplit le questionnaire, extrait les résultats, analyse les
//  incohérences et retourne un rapport structuré.
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');

const BASE_URL = 'https://cineamatch.com';
const TIMEOUT_QUESTION = 8_000;
const TIMEOUT_AI       = 90_000; // L'IA peut prendre jusqu'à 90s

// ── Délai utilitaire ──
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────
//  Cliquer sur une option-card
// ─────────────────────────────────────────────────────────────────
async function clickOption(page, dataId) {
  const selector = `.option-card[data-id="${dataId}"]`;
  await page.waitForSelector(selector, { timeout: TIMEOUT_QUESTION });
  await page.click(selector);
}

// ─────────────────────────────────────────────────────────────────
//  Étape exclusions (multi-choix) + bouton Valider
// ─────────────────────────────────────────────────────────────────
async function fillExclusions(page, excludeList) {
  if (!excludeList || excludeList.length === 0) {
    // Cliquer "Rien ne me dérange"
    await clickOption(page, 'none');
    await wait(300);
  } else {
    for (const ex of excludeList) {
      await clickOption(page, ex);
      await wait(200);
    }
  }
  // Bouton Valider (btn-primary dans la question multi)
  const validateBtn = page.locator('#questionnaire .btn-primary').last();
  await validateBtn.waitFor({ timeout: TIMEOUT_QUESTION });
  await validateBtn.click();
  await wait(400);
}

// ─────────────────────────────────────────────────────────────────
//  Étape films de référence (search-multi)
// ─────────────────────────────────────────────────────────────────
async function fillReferences(page, refs) {
  if (!refs || refs.length === 0) {
    // Passer l'étape
    await page.waitForSelector('#search-skip-btn', { timeout: TIMEOUT_QUESTION });
    await page.click('#search-skip-btn');
    await wait(400);
    return;
  }

  await page.waitForSelector('#movie-search', { timeout: TIMEOUT_QUESTION });

  for (const ref of refs) {
    await page.fill('#movie-search', '');
    await page.type('#movie-search', ref, { delay: 60 });

    // Attendre les résultats de recherche
    try {
      await page.waitForSelector('#search-results .search-result-item', {
        timeout: 8000,
      });
      await wait(300);
      // Cliquer sur le premier résultat
      await page.click('#search-results .search-result-item:first-child');
      await wait(500);
    } catch (e) {
      console.warn(`  ⚠️  Film "${ref}" non trouvé dans la recherche — ignoré`);
    }
  }

  // Cliquer sur le bouton "Ajouter mes films" si des films ont été sélectionnés
  const nextBtn = page.locator('#search-next-btn');
  const skipBtn = page.locator('#search-skip-btn');

  try {
    await nextBtn.waitFor({ timeout: 3000, state: 'visible' });
    const isVisible = await nextBtn.isVisible();
    if (isVisible) {
      await nextBtn.click();
    } else {
      await skipBtn.click();
    }
  } catch {
    await skipBtn.click();
  }
  await wait(400);
}

// ─────────────────────────────────────────────────────────────────
//  Remplir tout le questionnaire pour un profil
// ─────────────────────────────────────────────────────────────────
async function fillQuestionnaire(page, profile) {
  const { answers, references } = profile;

  console.log(`  → Q1 Context: ${answers.context}`);
  await clickOption(page, answers.context);
  await wait(600);

  console.log(`  → Q2 Mood: ${answers.mood}`);
  await clickOption(page, answers.mood);
  await wait(600);

  console.log(`  → Q3 Langue: ${answers.language}`);
  await clickOption(page, answers.language);
  await wait(600);

  console.log(`  → Q4 Durée: ${answers.duration}`);
  await clickOption(page, answers.duration);
  await wait(600);

  console.log(`  → Q5 Exclusions: ${answers.exclude.join(', ') || 'none'}`);
  await fillExclusions(page, answers.exclude);

  console.log(`  → Q6 Époque: ${answers.era}`);
  await clickOption(page, answers.era);
  await wait(600);

  console.log(`  → Q7 Références: ${references.join(', ') || '(aucune)'}`);
  await fillReferences(page, references);
}

// ─────────────────────────────────────────────────────────────────
//  Attendre et extraire les films recommandés
// ─────────────────────────────────────────────────────────────────
async function extractResults(page) {
  console.log('  ⏳ Attente des résultats IA...');

  // Attendre que la section résultats soit visible
  await page.waitForSelector('#results.active', { timeout: TIMEOUT_AI });

  // Attendre que le spinner disparaisse
  try {
    await page.waitForSelector('#loading:not(.active)', { timeout: TIMEOUT_AI });
  } catch { /* parfois déjà caché */ }

  // Attendre qu'au moins une carte film apparaisse
  await page.waitForSelector('.movie-card', { timeout: TIMEOUT_AI });
  await wait(1000); // laisser le DOM se stabiliser

  const movies = await page.evaluate(() => {
    const cards = document.querySelectorAll('.movie-card');
    return Array.from(cards).map((card, idx) => {
      const title      = card.querySelector('h3')?.textContent?.trim() || '—';
      const matchBadge = card.querySelector('.match-badge')?.textContent?.trim() || '—';
      const aiReason   = card.querySelector('.ai-reason')?.textContent?.trim() || '—';
      const genres     = Array.from(card.querySelectorAll('.genre-tag'))
                             .map(g => g.textContent.trim()).join(', ') || '—';
      const year       = card.querySelector('.year-badge')?.textContent?.trim() || '—';
      const rating     = card.querySelector('.rating')?.textContent?.trim() || '—';
      const rankLabel  = card.querySelector('[style*="position:absolute"]')?.textContent?.trim() || `#${idx + 1}`;

      return { rank: idx + 1, rankLabel, title, matchBadge, genres, year, rating, aiReason };
    });
  });

  // Récupérer la bannière de conflit si présente
  const conflictBanner = await page.evaluate(() => {
    return document.getElementById('conflict-banner')?.textContent?.trim() || null;
  });

  return { movies, conflictBanner };
}

// ─────────────────────────────────────────────────────────────────
//  Analyser les résultats par rapport aux attentes du profil
// ─────────────────────────────────────────────────────────────────
function analyzeResults(profile, results) {
  const { movies, conflictBanner } = results;
  const { expectations, answers }  = profile;
  const issues = [];
  const positives = [];

  movies.forEach((m, i) => {
    const reasonLower = (m.aiReason + ' ' + m.title + ' ' + m.genres).toLowerCase();
    const rank = `#${m.rank}`;

    // Vérifier les mots interdits dans la raison IA
    if (expectations.shouldNotContain) {
      expectations.shouldNotContain.forEach(bad => {
        if (reasonLower.includes(bad.toLowerCase())) {
          issues.push(`${rank} "${m.title}" — la raison IA contient "${bad}" (contenu non souhaité)`);
        }
      });
    }

    // Vérifier les genres interdits
    if (expectations.forbiddenGenres) {
      expectations.forbiddenGenres.forEach(fg => {
        if (m.genres.toLowerCase().includes(fg.toLowerCase())) {
          issues.push(`${rank} "${m.title}" — genre interdit détecté : ${fg}`);
        }
      });
    }

    // Vérifier exclusion "sad" : détecter films maladie/tragiques connus
    if (answers.exclude?.includes('sad')) {
      const sadKeywords = ['maladie', 'cancer', 'mourir', 'deuil', 'tragique', 'mort', 'sparks'];
      sadKeywords.forEach(kw => {
        if (reasonLower.includes(kw)) {
          issues.push(`${rank} "${m.title}" — détection "trop triste" : contient "${kw}" malgré exclusion`);
        }
      });
    }

    // Vérifier exclusion "teen"
    if (answers.exclude?.includes('teen')) {
      const teenKeywords = ['lycée', 'adolescent', 'teen', 'ado', 'coming-of-age', 'high school'];
      teenKeywords.forEach(kw => {
        if (reasonLower.includes(kw)) {
          issues.push(`${rank} "${m.title}" — détection "film ados" : contient "${kw}" malgré exclusion`);
        }
      });
    }

    // Vérifier contexte famille
    if (answers.context === 'family') {
      const darkKeywords = ['violent', 'gore', 'adulte', 'dark', 'sombre', 'brutal'];
      darkKeywords.forEach(kw => {
        if (reasonLower.includes(kw)) {
          issues.push(`${rank} "${m.title}" — contexte famille : contenu potentiellement inapproprié détecté ("${kw}")`);
        }
      });
    }

    // Points positifs
    if (expectations.shouldContain) {
      expectations.shouldContain.forEach(good => {
        if (reasonLower.includes(good.toLowerCase())) {
          positives.push(`${rank} "${m.title}" — ✓ contient "${good}"`);
        }
      });
    }

    // Vérifier cohérence raison IA / titre film
    if (m.aiReason && m.aiReason !== '—') {
      // Si la raison mentionne un autre film clairement différent du résultat
      const otherMoviePattern = /(?:comme|à l'image de|dans la lignée de|rappelant)\s+"([^"]+)"/gi;
      let match;
      while ((match = otherMoviePattern.exec(m.aiReason)) !== null) {
        positives.push(`${rank} "${m.title}" — raison IA référence "${match[1]}" (ancrage ADN)`);
      }
    }
  });

  // Score sur 10
  const totalChecks = movies.length * (
    (expectations.shouldNotContain?.length || 0) +
    (expectations.forbiddenGenres?.length || 0) + 2
  );
  const issueWeight = issues.length * 2;
  const rawScore    = Math.max(0, 10 - issueWeight);
  const score       = Math.min(10, rawScore);

  return { issues, positives, score, conflictBanner };
}

// ─────────────────────────────────────────────────────────────────
//  Lancer un profil complet
// ─────────────────────────────────────────────────────────────────
async function runProfile(profile, browser) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🎬 PROFIL : ${profile.name}`);
  console.log(`${'─'.repeat(60)}`);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
  });
  const page = await context.newPage();

  // Ignorer les erreurs console non critiques
  page.on('console', msg => {
    if (msg.type() === 'error') {
      // silencieux pour les erreurs réseau mineures
    }
  });

  let result = null;
  let error  = null;
  const startTime = Date.now();

  try {
    // 1. Ouvrir le site
    console.log(`  → Navigation vers ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await wait(1500); // laisser JS initialiser

    // 2. Fermer l'éventuel onboarding tooltip
    try {
      const closeOnboarding = page.locator('.onboarding-tooltip .close, #onboarding-close');
      if (await closeOnboarding.count() > 0) {
        await closeOnboarding.click();
        await wait(300);
      }
    } catch { /* pas d'onboarding */ }

    // 3. Cliquer sur COMMENCER
    console.log('  → Clic sur COMMENCER');
    await page.waitForSelector('#start-btn', { timeout: 10_000 });
    await page.click('#start-btn');
    await wait(600);

    // 4. Remplir le questionnaire
    await fillQuestionnaire(page, profile);

    // 5. Extraire les résultats
    result = await extractResults(page);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ ${result.movies.length} film(s) extrait(s) en ${duration}s`);
    result.movies.forEach(m => {
      console.log(`     ${m.rankLabel} — ${m.title} (${m.matchBadge})`);
    });

  } catch (err) {
    error = err.message;
    console.error(`  ❌ Erreur : ${error}`);
  } finally {
    await context.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!result) {
    return {
      profile,
      movies: [],
      issues: [`Test échoué : ${error}`],
      positives: [],
      score: 0,
      conflictBanner: null,
      duration,
      error,
    };
  }

  const analysis = analyzeResults(profile, result);

  return {
    profile,
    movies:        result.movies,
    issues:        analysis.issues,
    positives:     analysis.positives,
    score:         analysis.score,
    conflictBanner: result.conflictBanner,
    duration,
    error:         null,
  };
}

module.exports = { runProfile };
