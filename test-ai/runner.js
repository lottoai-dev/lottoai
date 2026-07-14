const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { autoCheck } = require('./auto-check');
const {
  SAMPLE_STATS_TEXT,
  getBasePrompt,
  getExplanationPrompt,
  CLASSIFY_SYSTEM_PROMPT,
} = require('./prompts');
const { getScenarios, countScenarios } = require('./scenario-generator');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tsxzukctomvnyzalgxap.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_R4PXW8J2-BxE77dlN7cS-w_6NfFrcl0';
const AI_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;

const DEFAULT_DELAY_CLASSIFY = Number(process.env.TEST_DELAY_CLASSIFY || 500);
const DEFAULT_DELAY_CHAT = Number(process.env.TEST_DELAY_CHAT || 700);

function parseArgs(argv) {
  const args = {
    mode: 'full',
    delayClassify: DEFAULT_DELAY_CLASSIFY,
    delayChat: DEFAULT_DELAY_CHAT,
    verbose: true,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--smoke') args.mode = 'smoke';
    else if (arg === '--classify-only') args.mode = 'classify-only';
    else if (arg === '--chat-only') args.mode = 'chat-only';
    else if (arg === '--explanation-only') args.mode = 'explanation-only';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--quiet') args.verbose = false;
    else if (arg.startsWith('--delay=')) args.delayClassify = args.delayChat = Number(arg.split('=')[1]);
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function printHelp() {
  console.log(`Lota AI toplu test aracı

Kullanım:
  node test-ai.js [seçenekler]

Seçenekler:
  --smoke              Kritik ~40 senaryo (hızlı smoke test)
  --classify-only      Sadece sınıflandırma testleri (~200)
  --chat-only          Sadece sohbet davranış testleri
  --explanation-only   Sadece kupon açıklaması testleri
  --dry-run            API çağrısı yapmadan senaryo sayısını göster
  --quiet              Sadece özet raporu yazdır
  --delay=500          İstekler arası bekleme (ms)
  --help               Bu yardım metni

Ortam değişkenleri:
  TEST_EMAIL           Test hesabı e-postası
  TEST_PASSWORD        Test hesabı şifresi

Alternatif: proje köküne test-ai.local.json oluşturun:
  { "email": "...", "password": "..." }
  (Bu dosya git'e eklenmemelidir.)
`);
}

function extractBalancedJsonObject(text) {
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (codeBlock) return codeBlock[1].trim();

  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseClassifyReply(reply) {
  const trimmed = reply.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const block = extractBalancedJsonObject(trimmed);
    if (block) return JSON.parse(block);
    throw new Error('JSON parse edilemedi');
  }
}

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertClassifyScenario(parsed, scenario) {
  const failures = [];

  if (parsed.intent !== scenario.expectedIntent) {
    failures.push({
      field: 'intent',
      expected: scenario.expectedIntent,
      actual: parsed.intent,
    });
  }

  if (scenario.expectedFields) {
    for (const [key, expected] of Object.entries(scenario.expectedFields)) {
      const actual = parsed[key];
      if (!arraysEqual(actual, expected)) {
        failures.push({ field: key, expected, actual });
      }
    }
  }

  return failures;
}

async function callAI(messages, accessToken, options) {
  const response = await fetch(AI_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messages,
      ...(options?.temperature != null ? { temperature: options.temperature } : {}),
      ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  if (!response.ok) {
    return { reply: null, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  return { reply: data.reply || null, error: data.error || null };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runClassifyTests(scenarios, accessToken, ctx) {
  const { print, report, delayMs, verbose } = ctx;

  print('█'.repeat(70));
  print('BÖLÜM 1: SINIFLANDIRMA TESTLERİ');
  print(`Toplam senaryo: ${scenarios.length}`);
  print('█'.repeat(70));

  for (const scenario of scenarios) {
    const result = {
      section: 'classify',
      name: scenario.name,
      message: scenario.message,
      passed: false,
      failures: [],
      error: null,
    };

    if (verbose) {
      print('\n' + '─'.repeat(70));
      print(`Senaryo: ${scenario.name}`);
      print(`Mesaj: "${scenario.message}"`);
    }

    const messages = [
      { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      ...scenario.context,
      { role: 'user', content: scenario.message },
    ];

    const { reply, error } = await callAI(messages, accessToken, { temperature: 0.1, maxTokens: 700 });

    if (error || !reply) {
      result.error = error || 'boş cevap';
      report.classify.failed++;
      report.classify.failures.push(result);
      if (verbose) print(`❌ Hata: ${result.error}`);
      await delay(delayMs);
      continue;
    }

    let parsed;
    try {
      parsed = parseClassifyReply(reply);
    } catch {
      result.error = `JSON parse hatası: ${reply.slice(0, 200)}`;
      report.classify.failed++;
      report.classify.failures.push(result);
      if (verbose) print(`❌ ${result.error}`);
      await delay(delayMs);
      continue;
    }

    const failures = assertClassifyScenario(parsed, scenario);
    result.failures = failures;
    result.parsed = parsed;

    if (failures.length === 0) {
      result.passed = true;
      report.classify.passed++;
      if (verbose) print(`✅ Geçti — intent: ${parsed.intent}`);
    } else {
      report.classify.failed++;
      report.classify.failures.push(result);
      if (verbose) {
        print(`Ham JSON: ${JSON.stringify(parsed)}`);
        failures.forEach((f) => print(`❌ ${f.field}: beklenen ${JSON.stringify(f.expected)}, gerçek ${JSON.stringify(f.actual)}`));
      }
    }

    await delay(delayMs);
  }

  print(`\nSınıflandırma: ${report.classify.passed} başarılı, ${report.classify.failed} başarısız\n`);
}

async function runChatTests(scenarios, accessToken, ctx) {
  const { print, report, delayMs, verbose } = ctx;

  print('█'.repeat(70));
  print('BÖLÜM 2: GENEL SOHBET DAVRANIŞI');
  print(`Toplam senaryo: ${scenarios.length}`);
  print('█'.repeat(70));

  for (const scenario of scenarios) {
    if (verbose) {
      print('\n' + '═'.repeat(70));
      print(`SENARYO: ${scenario.name}`);
      print('═'.repeat(70));
    }

    const conversation = [
      { role: 'system', content: getBasePrompt(SAMPLE_STATS_TEXT, null) },
    ];

    const scenarioResult = {
      section: 'chat',
      name: scenario.name,
      passed: true,
      turns: [],
    };

    for (const userMsg of scenario.messages) {
      const turn = { user: userMsg, issues: [], error: null, reply: null };
      if (verbose) print(`\n👤 Kullanıcı: ${userMsg}`);

      conversation.push({ role: 'user', content: userMsg });
      const { reply, error } = await callAI(conversation, accessToken, { temperature: 0.5, maxTokens: 600 });

      if (error) {
        turn.error = error;
        scenarioResult.passed = false;
        if (verbose) print(`❌ Hata: ${error}`);
      } else {
        turn.reply = reply;
        if (verbose) print(`🤖 Lota: ${reply}`);
        conversation.push({ role: 'assistant', content: reply || '' });

        const issues = autoCheck(reply, { forbidNumberSequence: true });
        turn.issues = issues;
        if (issues.length > 0) {
          scenarioResult.passed = false;
          report.chat.issues += issues.length;
          if (verbose) issues.forEach((issue) => print(`   ❌ OTOMATİK KONTROL: ${issue}`));
        } else if (verbose) {
          print('   ✅ Otomatik kontrol: sorun bulunamadı');
        }
      }

      scenarioResult.turns.push(turn);
      await delay(delayMs);
    }

    if (scenarioResult.passed) report.chat.passed++;
    else {
      report.chat.failed++;
      report.chat.failures.push(scenarioResult);
    }
  }

  print(`\nSohbet: ${report.chat.passed} başarılı, ${report.chat.failed} başarısız (${report.chat.issues} otomatik uyarı)\n`);
}

async function runExplanationTests(scenarios, accessToken, ctx) {
  const { print, report, delayMs, verbose } = ctx;

  print('\n' + '█'.repeat(70));
  print('BÖLÜM 3: KUPON AÇIKLAMASI DAVRANIŞI');
  print(`Toplam senaryo: ${scenarios.length}`);
  print('█'.repeat(70));

  for (const scenario of scenarios) {
    if (verbose) {
      print('═'.repeat(70));
      print(`SENARYO: ${scenario.name}`);
      print(`Sayılar: ${scenario.numbers.join(', ')}${scenario.bonus ? ' + Şans Topu: ' + scenario.bonus : ''}`);
      print('═'.repeat(70));
    }

    const prompt = getExplanationPrompt(
      scenario.game,
      scenario.numbers,
      scenario.superStar,
      scenario.bonus,
      null,
      scenario.constraints,
      scenario.relaxed
    );

    const result = {
      section: 'explanation',
      name: scenario.name,
      passed: true,
      issues: [],
      error: null,
      reply: null,
    };

    const { reply, error } = await callAI([{ role: 'user', content: prompt }], accessToken, { temperature: 0.5, maxTokens: 600 });

    if (error) {
      result.error = error;
      result.passed = false;
      if (verbose) print(`❌ Hata: ${error}`);
    } else {
      result.reply = reply;
      if (verbose) print(`🤖 Lota: ${reply}`);
      const issues = autoCheck(reply, { forbidNumberSequence: false, isExplanation: true });
      result.issues = issues;
      if (issues.length > 0) {
        result.passed = false;
        report.explanation.issues += issues.length;
        if (verbose) issues.forEach((issue) => print(`   ❌ OTOMATİK KONTROL: ${issue}`));
      } else if (verbose) {
        print('   ✅ Otomatik kontrol: sorun bulunamadı');
      }
    }

    if (result.passed) report.explanation.passed++;
    else {
      report.explanation.failed++;
      report.explanation.failures.push(result);
    }

    if (verbose) print('');
    await delay(delayMs);
  }

  print(`Açıklama: ${report.explanation.passed} başarılı, ${report.explanation.failed} başarısız (${report.explanation.issues} otomatik uyarı)\n`);
}

function buildEmptyReport() {
  return {
    mode: 'full',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    counts: {},
    classify: { passed: 0, failed: 0, failures: [] },
    chat: { passed: 0, failed: 0, issues: 0, failures: [] },
    explanation: { passed: 0, failed: 0, issues: 0, failures: [] },
  };
}

function loadCredentials() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (email && password) return { email, password };

  const localPath = path.join(process.cwd(), 'test-ai.local.json');
  if (fs.existsSync(localPath)) {
    try {
      const local = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      if (local.email && local.password) {
        return { email: local.email, password: local.password };
      }
    } catch {
      console.error(`HATA: ${localPath} okunamadı veya geçersiz JSON.`);
      return null;
    }
  }

  return null;
}

async function runTests(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  const counts = countScenarios(args.mode);
  console.log(`Mod: ${args.mode} | Senaryolar: ${counts.classify} sınıflandırma + ${counts.chat} sohbet + ${counts.explanation} açıklama = ${counts.total} toplam`);

  if (args.dryRun) {
    console.log('Dry-run: API çağrısı yapılmadı.');
    return 0;
  }

  const creds = loadCredentials();
  if (!creds) {
    console.error('HATA: Kimlik bilgisi bulunamadı.');
    console.error('TEST_EMAIL / TEST_PASSWORD ortam değişkenlerini ayarlayın veya test-ai.local.json oluşturun.');
    return 1;
  }

  const { email: testEmail, password: testPassword } = creds;

  const log = [];
  const print = (line) => {
    if (args.verbose) console.log(line);
    log.push(line);
  };

  const report = buildEmptyReport();
  report.mode = args.mode;
  report.counts = counts;

  print('Supabase\'e giriş yapılıyor...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError || !authData.session) {
    console.error('Giriş başarısız:', authError?.message);
    return 1;
  }

  print('Giriş başarılı.\n');
  const accessToken = authData.session.access_token;
  const ctx = { print, report, delayMs: args.delayClassify, verbose: args.verbose };

  const { classify, chat, explanation } = getScenarios(args.mode);

  if (classify.length > 0) {
    await runClassifyTests(classify, accessToken, { ...ctx, delayMs: args.delayClassify });
  }
  if (chat.length > 0) {
    await runChatTests(chat, accessToken, { ...ctx, delayMs: args.delayChat });
  }
  if (explanation.length > 0) {
    await runExplanationTests(explanation, accessToken, { ...ctx, delayMs: args.delayChat });
  }

  report.finishedAt = new Date().toISOString();
  const totalFailed = report.classify.failed + report.chat.failed + report.explanation.failed;
  const totalPassed = report.classify.passed + report.chat.passed + report.explanation.passed;

  print('█'.repeat(70));
  print('GENEL ÖZET');
  print(`  Sınıflandırma : ${report.classify.passed} ✅  ${report.classify.failed} ❌`);
  print(`  Sohbet        : ${report.chat.passed} ✅  ${report.chat.failed} ❌  (${report.chat.issues} uyarı)`);
  print(`  Açıklama      : ${report.explanation.passed} ✅  ${report.explanation.failed} ❌  (${report.explanation.issues} uyarı)`);
  print(`  TOPLAM        : ${totalPassed} ✅  ${totalFailed} ❌`);
  print('█'.repeat(70));

  const outDir = path.resolve(process.cwd());
  fs.writeFileSync(path.join(outDir, 'test-sonuclari.txt'), log.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'test-sonuclari.json'), JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\nSonuçlar: test-sonuclari.txt ve test-sonuclari.json`);
  if (totalFailed > 0) {
    console.log(`⚠️  ${totalFailed} senaryo başarısız — test-sonuclari.json içindeki failures dizisine bakın.`);
    return 1;
  }

  console.log('✅ Tüm senaryolar geçti.');
  return 0;
}

module.exports = { runTests, countScenarios, parseArgs };
