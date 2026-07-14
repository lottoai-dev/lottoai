// test-ai.js — Lota AI toplu test giriş noktası
//
// Kullanım:
//   $env:TEST_EMAIL="test@example.com"; $env:TEST_PASSWORD="..."; node test-ai.js
//   node test-ai.js --smoke          # ~40 kritik senaryo
//   node test-ai.js --classify-only  # ~200 sınıflandırma testi
//   node test-ai.js --dry-run        # Senaryo sayısını göster, API çağırma
//
// Sonuçlar: test-sonuclari.txt (log) + test-sonuclari.json (yapılandırılmış rapor)

const { runTests } = require('./test-ai/runner');

runTests(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Beklenmeyen hata:', err);
    process.exit(1);
  });
