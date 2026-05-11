// ─────────────────────────────────────────────────────────────────
//  CINEMATCH — Générateur de rapport Markdown
// ─────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

function scoreEmoji(score) {
  if (score >= 9) return '🟢';
  if (score >= 7) return '🟡';
  if (score >= 5) return '🟠';
  return '🔴';
}

function generateReport(allResults) {
  const now      = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const avgScore = (allResults.reduce((s, r) => s + r.score, 0) / allResults.length).toFixed(1);
  const totalIssues = allResults.reduce((s, r) => s + r.issues.length, 0);

  let md = '';

  // ── En-tête ──
  md += `# 🎬 Rapport de test CineaMatch\n\n`;
  md += `**Date :** ${now}\n`;
  md += `**Site :** https://cineamatch.com\n`;
  md += `**Profils testés :** ${allResults.length}\n`;
  md += `**Score moyen :** ${avgScore}/10\n`;
  md += `**Problèmes détectés :** ${totalIssues}\n\n`;
  md += `---\n\n`;

  // ── Tableau récapitulatif ──
  md += `## Récapitulatif\n\n`;
  md += `| Profil | Score | Films | Problèmes | Durée |\n`;
  md += `|--------|-------|-------|-----------|-------|\n`;
  allResults.forEach(r => {
    const emoji  = scoreEmoji(r.score);
    const titles = r.movies.map(m => m.title).join(' / ') || '—';
    const issues = r.issues.length > 0 ? `⚠️ ${r.issues.length}` : '✅ 0';
    md += `| ${emoji} ${r.profile.name} | ${r.score}/10 | ${titles} | ${issues} | ${r.duration}s |\n`;
  });
  md += `\n---\n\n`;

  // ── Détail par profil ──
  allResults.forEach((r, idx) => {
    const { profile, movies, issues, positives, score, conflictBanner, duration, error } = r;

    md += `## ${idx + 1}. ${profile.name}\n\n`;

    // Réponses au questionnaire
    md += `### 📋 Questionnaire\n\n`;
    md += `| Question | Réponse |\n`;
    md += `|----------|---------|\n`;
    const contextLabels   = { alone: 'Seul', couple: 'En couple', family: 'En famille', friends: 'Entre amis' };
    const moodLabels      = { '35,10751': 'Rire / Comédie', '28,12': 'Action / Aventure', '53': 'Thriller', '27': 'Horreur', '18,10749': 'Émouvant / Inspirant', '878,9648': 'SF / Mystère' };
    const langLabels      = { en: '🇺🇸 Américain', fr: '🇫🇷 Français', ko: '🌏 Asiatique', es: '🇪🇸 Espagnol/Latino', any: '🌍 Peu importe' };
    const durationLabels  = { short: 'Court (<1h45)', long: 'Long (>2h)', any: 'Peu importe' };
    const eraLabels       = { new: 'Récent (2020+)', modern: 'Moderne (2000-2020)', vintage: 'Vintage (<2000)', any: 'Peu importe' };
    const excludeLabels   = {
      horror: 'Trop violent', sad: 'Trop triste', scary: 'Films qui font peur',
      adult: 'Contenu adulte', slow: 'Trop lent', complex: 'Trop complexe',
      animation: 'Animation', teen: 'Films d\'ados', none: 'Rien',
    };

    md += `| Contexte | ${contextLabels[profile.answers.context] || profile.answers.context} |\n`;
    md += `| Mood | ${moodLabels[profile.answers.mood] || profile.answers.mood} |\n`;
    md += `| Langue | ${langLabels[profile.answers.language] || profile.answers.language} |\n`;
    md += `| Durée | ${durationLabels[profile.answers.duration] || profile.answers.duration} |\n`;
    md += `| Exclusions | ${profile.answers.exclude.map(e => excludeLabels[e] || e).join(', ') || 'Aucune'} |\n`;
    md += `| Époque | ${eraLabels[profile.answers.era] || profile.answers.era} |\n`;
    md += `| Références | ${profile.references.length > 0 ? profile.references.join(', ') : '(aucune)'} |\n`;
    md += `\n`;

    if (error) {
      md += `### ❌ Erreur\n\n`;
      md += `\`\`\`\n${error}\n\`\`\`\n\n`;
      md += `---\n\n`;
      return;
    }

    // Films affichés
    md += `### 🎥 Films recommandés\n\n`;
    if (movies.length === 0) {
      md += `_Aucun film extrait._\n\n`;
    } else {
      movies.forEach(m => {
        md += `#### ${m.rankLabel} — ${m.title}\n\n`;
        md += `- **Compatibilité :** ${m.matchBadge}\n`;
        md += `- **Genres :** ${m.genres}\n`;
        md += `- **Année :** ${m.year}\n`;
        md += `- **Note TMDB :** ${m.rating}\n`;
        md += `- **Explication IA :** ${m.aiReason}\n\n`;
      });
    }

    // Bannière conflit
    if (conflictBanner) {
      md += `> ⚠️ **Bannière conflit détectée :** ${conflictBanner}\n\n`;
    }

    // Analyse critique
    md += `### 🔍 Analyse critique\n\n`;
    md += `**Score global : ${scoreEmoji(score)} ${score}/10**\n\n`;
    md += `**Durée du test :** ${duration}s\n\n`;

    if (positives.length > 0) {
      md += `**✅ Points cohérents :**\n`;
      positives.forEach(p => md += `- ${p}\n`);
      md += `\n`;
    }

    if (issues.length > 0) {
      md += `**⚠️ Problèmes détectés :**\n`;
      issues.forEach(i => md += `- ${i}\n`);
      md += `\n`;
    } else {
      md += `**✅ Aucun problème détecté**\n\n`;
    }

    // Suggestions de correction
    if (issues.length > 0) {
      md += `### 💡 Suggestions de correction scoring\n\n`;
      const suggestions = generateSuggestions(r);
      suggestions.forEach(s => md += `- ${s}\n`);
      md += `\n`;
    }

    md += `---\n\n`;
  });

  // ── Conclusion ──
  md += `## 📊 Conclusion générale\n\n`;

  const criticalProfiles = allResults.filter(r => r.score < 5);
  const goodProfiles     = allResults.filter(r => r.score >= 8);

  if (goodProfiles.length > 0) {
    md += `**Profils bien gérés (≥8/10) :**\n`;
    goodProfiles.forEach(r => md += `- ✅ ${r.profile.name}\n`);
    md += `\n`;
  }

  if (criticalProfiles.length > 0) {
    md += `**Profils problématiques (<5/10) :**\n`;
    criticalProfiles.forEach(r => md += `- 🔴 ${r.profile.name}\n`);
    md += `\n`;
  }

  const allIssues = allResults.flatMap(r => r.issues);
  const uniquePatterns = {};
  allIssues.forEach(issue => {
    const kw = issue.match(/"([^"]+)"/)?.[1] || issue.split(' — ')[1] || 'autre';
    uniquePatterns[kw] = (uniquePatterns[kw] || 0) + 1;
  });

  const topPatterns = Object.entries(uniquePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topPatterns.length > 0) {
    md += `**Problèmes récurrents :**\n`;
    topPatterns.forEach(([pattern, count]) => {
      md += `- "${pattern}" × ${count} occurrence(s)\n`;
    });
    md += `\n`;
  }

  md += `_Rapport généré automatiquement par l'agent de test CineaMatch._\n`;

  return md;
}

// ─────────────────────────────────────────────────────────────────
//  Générer des suggestions selon les problèmes détectés
// ─────────────────────────────────────────────────────────────────
function generateSuggestions(result) {
  const { issues, profile } = result;
  const suggestions = [];

  if (issues.some(i => i.includes('trop triste') || i.includes('sad'))) {
    suggestions.push('Renforcer la blacklist des films maladie/tragiques quand exclusion "sad" est active');
    suggestions.push('Vérifier que la polarité émotionnelle "émotion positive" est bien transmise à l\'IA pour le mood émouvant');
  }

  if (issues.some(i => i.includes('ados') || i.includes('teen'))) {
    suggestions.push('Ajouter les IDs TMDB des films teen-drama problématiques à la blacklist candidats');
    suggestions.push('Renforcer la règle teen dans le prompt IA avec des exemples plus précis');
  }

  if (issues.some(i => i.includes('famille') || i.includes('family'))) {
    suggestions.push('Vérifier que la certification TMDB est bien utilisée pour filtrer les films famille');
    suggestions.push('Étendre la blacklist famille avec les films animés pour adultes récents');
  }

  if (issues.some(i => i.includes('genre interdit'))) {
    suggestions.push('Revoir le mapping genre exclusion dans EXCLUDE_GENRE_MAP pour couvrir ce cas');
  }

  if (suggestions.length === 0 && issues.length > 0) {
    suggestions.push('Analyser manuellement les films détectés pour identifier le pattern de scoring');
    suggestions.push('Vérifier les logs console du site pour le détail du scoring IA');
  }

  return suggestions;
}

// ─────────────────────────────────────────────────────────────────
//  Sauvegarder le rapport
// ─────────────────────────────────────────────────────────────────
function saveReport(allResults) {
  const md       = generateReport(allResults);
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `rapport-test-${date}.md`;
  const filepath = path.join(__dirname, filename);

  fs.writeFileSync(filepath, md, 'utf8');
  console.log(`\n📄 Rapport sauvegardé : ${filepath}`);
  return filepath;
}

module.exports = { generateReport, saveReport };
