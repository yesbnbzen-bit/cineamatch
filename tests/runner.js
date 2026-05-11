// ─────────────────────────────────────────────────────────────────
//  CINEMATCH — Runner principal
//  Lance tous les profils ou un profil spécifique
//  Usage :
//    node runner.js                    → tous les profils
//    node runner.js --profile romance  → profil contenant "romance"
//    node runner.js --headless false   → avec fenêtre visible
// ─────────────────────────────────────────────────────────────────

const { chromium }  = require('playwright');
const { PROFILES }  = require('./profiles');
const { runProfile } = require('./cinematch');
const { saveReport } = require('./reporter');

// ── Arguments CLI ──
const args     = process.argv.slice(2);
const headless = !args.includes('--headless') || args[args.indexOf('--headless') + 1] !== 'false';
const profileArg = args.includes('--profile')
  ? args[args.indexOf('--profile') + 1]?.toLowerCase()
  : null;

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        🎬  CINEMATCH — Agent de test automatisé          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode : ${headless ? 'Headless (invisible)' : 'Visible (fenêtre ouverte)'}`);

  // Sélectionner les profils à tester
  let profilesToRun = PROFILES;
  if (profileArg) {
    profilesToRun = PROFILES.filter(p =>
      p.id.includes(profileArg) || p.name.toLowerCase().includes(profileArg)
    );
    if (profilesToRun.length === 0) {
      console.error(`\n❌ Aucun profil trouvé pour "${profileArg}"`);
      console.error(`Profils disponibles : ${PROFILES.map(p => p.id).join(', ')}`);
      process.exit(1);
    }
    console.log(`Profil(s) sélectionné(s) : ${profilesToRun.map(p => p.name).join(', ')}`);
  } else {
    console.log(`Profils à tester : ${profilesToRun.length}`);
  }

  // Lancer le navigateur
  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allResults = [];
  const total      = profilesToRun.length;

  for (let i = 0; i < total; i++) {
    const profile = profilesToRun[i];
    console.log(`\n[${i + 1}/${total}] Démarrage du profil...`);

    const result = await runProfile(profile, browser);
    allResults.push(result);

    // Pause entre les profils pour éviter de surcharger l'API
    if (i < total - 1) {
      console.log('  ⏸  Pause 5s avant le profil suivant...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  await browser.close();

  // Générer et sauvegarder le rapport
  console.log('\n\n════════════════════════════════════════════════════════════');
  console.log('📊 RÉSUMÉ');
  console.log('════════════════════════════════════════════════════════════');

  allResults.forEach(r => {
    const emoji = r.score >= 8 ? '🟢' : r.score >= 5 ? '🟡' : '🔴';
    const films = r.movies.map(m => m.title).join(' / ') || 'Aucun film';
    console.log(`${emoji} [${r.score}/10] ${r.profile.name}`);
    console.log(`   Films : ${films}`);
    if (r.issues.length > 0) {
      r.issues.forEach(i => console.log(`   ⚠️  ${i}`));
    }
  });

  const reportPath = saveReport(allResults);
  console.log(`\n✅ Terminé ! Rapport : ${reportPath}`);
}

main().catch(err => {
  console.error('\n💥 Erreur fatale :', err);
  process.exit(1);
});
