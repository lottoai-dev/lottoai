// Parametrik test senaryoları üretir — yüzlerce kombinasyon

const GAMES = [
  { id: 'cilgin', names: ['Çılgın Sayısal', 'Çılgın Loto', 'Sayısal Loto'], display: 'Çılgın Sayısal' },
  { id: 'superloto', names: ['Süper Loto'], display: 'Süper Loto' },
  { id: 'sanstopu', names: ['Şans Topu'], display: 'Şans Topu' },
  { id: 'onnumara', names: ['On Numara'], display: 'On Numara' },
];

const COUPON_VERBS = ['üret', 'hazırla', 'yap', 'çıkar', 'öner'];
const SHORT_APPROVALS = ['Evet', 'Tamam', 'Yap', 'Olur', 'Hadi', 'Oluştur'];
const SUM_RANGES = [
  { min: 55, max: 60, gameId: 'onnumara' },
  { min: 200, max: 250, gameId: 'sanstopu' },
  { min: 150, max: 200, gameId: 'superloto' },
  { min: 300, max: 400, gameId: 'cilgin' },
  { min: 100, max: 150, gameId: 'superloto' },
  { min: 500, max: 600, gameId: 'onnumara' },
];

function dedupeByName(scenarios) {
  const seen = new Set();
  return scenarios.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

function manualClassifyScenarios() {
  return [
    {
      name: 'Doğrudan kupon isteği',
      context: [],
      message: 'Şanslı bir Çılgın Sayısal kuponu üret',
      expectedIntent: 'generate_coupon',
      expectedFields: { gameId: 'cilgin' },
      tags: ['manual', 'smoke'],
    },
    {
      name: 'Genel bilgi sorusu (kupon değil)',
      context: [],
      message: 'Süper Loto nasıl oynanır?',
      expectedIntent: 'chat',
      expectedFields: { gameId: 'superloto' },
      tags: ['manual', 'smoke'],
    },
    {
      name: 'İstatistik sonrası "ilginç" onayı - YANLIŞ TETİKLEME RİSKİ',
      context: [
        { role: 'assistant', content: "Süper Loto'nun son 100 çekilişine göre en çok çıkan sayılar 9, 19, 6... Bunlar sadece geçmiş bilgiler, unutma. İlginç bir tablo değil mi?" },
      ],
      message: 'Evet ilginç.',
      expectedIntent: 'chat',
      tags: ['manual', 'smoke', 'approval-trap'],
    },
    {
      name: 'Gerçek kupon teklifinden sonra onay',
      context: [
        { role: 'assistant', content: 'İstersen senin için bir Süper Loto kuponu üretebilirim, denemek ister misin?' },
      ],
      message: 'Evet',
      expectedIntent: 'generate_coupon',
      expectedFields: { gameId: 'superloto' },
      tags: ['manual', 'smoke', 'approval-trap'],
    },
    {
      name: 'Toplam aralığı doğru algılanmalı',
      context: [],
      message: 'On Numara için toplamı 55 ile 60 arasında olan bir kupon üret',
      expectedIntent: 'generate_coupon',
      expectedFields: { sumMin: 55, sumMax: 60, gameId: 'onnumara' },
      tags: ['manual', 'smoke', 'sum-range'],
    },
    {
      name: 'Toplam kelimesi geçmiyorsa sumMin/sumMax UYDURULMAMALI',
      context: [],
      message: '31 sayısı mutlaka olsun, 5 tane Şans Topu kuponu üret',
      expectedIntent: 'generate_coupon',
      expectedFields: { sumMin: null, sumMax: null, count: 5, gameId: 'sanstopu', mustInclude: [31] },
      tags: ['manual', 'smoke'],
    },
  ];
}

function generateClassifyScenarios() {
  const scenarios = [...manualClassifyScenarios()];

  for (const game of GAMES) {
    for (const verb of COUPON_VERBS) {
      for (const name of game.names) {
        scenarios.push({
          name: `Kupon isteği: ${name} / ${verb}`,
          context: [],
          message: `Bana bir ${name} kuponu ${verb}`,
          expectedIntent: 'generate_coupon',
          expectedFields: { gameId: game.id },
          tags: ['generated', 'coupon-request', ...(verb === 'üret' && name === game.names[0] ? ['smoke'] : [])],
        });
      }
    }
  }

  for (const game of GAMES) {
    scenarios.push({
      name: `Bilgi: ${game.display} nasıl oynanır`,
      context: [],
      message: `${game.display} nasıl oynanır?`,
      expectedIntent: 'chat',
      expectedFields: { gameId: game.id },
      tags: ['generated', 'info', 'smoke'],
    });
    scenarios.push({
      name: `Bilgi: ${game.display} istatistikleri`,
      context: [],
      message: `${game.display} istatistiklerini göster`,
      expectedIntent: 'chat',
      expectedFields: { gameId: game.id },
      tags: ['generated', 'info', 'smoke'],
    });
    scenarios.push({
      name: `Bilgi: ${game.display} ne demek`,
      context: [],
      message: `${game.display} nedir, kısaca anlat`,
      expectedIntent: 'chat',
      expectedFields: { gameId: game.id },
      tags: ['generated', 'info', 'smoke'],
    });
  }

  const wrongApprovalContexts = [
    {
      label: 'istatistik ilginç mi',
      content: "Süper Loto'nun son 100 çekilişine göre en çok çıkan sayılar 9, 19, 6. İlginç bir tablo değil mi?",
    },
    {
      label: 'istatistik bakalım mı',
      content: 'Şans Topu istatistiklerine bakmak ister misin?',
    },
    {
      label: 'genel sohbet',
      content: 'Bugün hava güzel görünüyor, dışarı çıkmayı düşünüyor musun?',
    },
    {
      label: 'kural açıklaması',
      content: 'On Numara\'da 10 sayı seçiyorsun. Anlaşıldı mı?',
    },
    {
      label: 'geciken sayı bilgisi',
      content: 'En çok geciken sayılar bunlar — sadece geçmiş bilgi, unutma. Merak ettin mi?',
    },
    {
      label: 'çekiliş günü bilgisi',
      content: 'Bugün Süper Loto çekiliş günü değil ama yarın Perşembe. Biliyor muydun?',
    },
  ];

  for (const ctx of wrongApprovalContexts) {
    for (const reply of ['Evet', 'Tamam', 'Olur']) {
      scenarios.push({
        name: `Yanlış onay tuzakı (${ctx.label}): "${reply}"`,
        context: [{ role: 'assistant', content: ctx.content }],
        message: reply,
        expectedIntent: 'chat',
        tags: ['generated', 'approval-trap', ...(ctx.label === 'istatistik ilginç mi' && reply === 'Evet' ? ['smoke'] : [])],
      });
    }
  }

  for (const game of GAMES) {
    for (const reply of SHORT_APPROVALS) {
      scenarios.push({
        name: `Doğru onay (${game.display}): "${reply}"`,
        context: [
          { role: 'assistant', content: `İstersen senin için bir ${game.display} kuponu üretebilirim, denemek ister misin?` },
        ],
        message: reply,
        expectedIntent: 'generate_coupon',
        expectedFields: { gameId: game.id },
        tags: ['generated', 'approval-trap'],
      });
    }
  }

  for (const range of SUM_RANGES) {
    const game = GAMES.find((g) => g.id === range.gameId);
    const templates = [
      `${game.display} için toplamı ${range.min} ile ${range.max} arasında olan bir kupon üret`,
      `Toplamı ${range.min}-${range.max} arası ${game.display} kuponu hazırla`,
      `${game.display} kuponu istiyorum, sayıların toplamı ${range.min} ile ${range.max} arasında olsun`,
    ];
    templates.forEach((message, i) => {
      scenarios.push({
        name: `Toplam aralığı ${game.display} (${range.min}-${range.max}) v${i + 1}`,
        context: [],
        message,
        expectedIntent: 'generate_coupon',
        expectedFields: { sumMin: range.min, sumMax: range.max, gameId: game.id },
        tags: ['generated', 'sum-range'],
      });
    });
  }

  const includeNumbers = { cilgin: 37, superloto: 19, sanstopu: 31, onnumara: 7 };
  for (const game of GAMES) {
    const num = includeNumbers[game.id];
    scenarios.push({
      name: `mustInclude: ${game.display} / ${num}`,
      context: [],
      message: `${num} mutlaka olsun, ${game.display} kuponu üret`,
      expectedIntent: 'generate_coupon',
      expectedFields: { mustInclude: [num], gameId: game.id, sumMin: null, sumMax: null },
      tags: ['generated', 'must-include'],
    });
    scenarios.push({
      name: `mustExclude: ${game.display} / 13`,
      context: [],
      message: `13 olmasın, ${game.display} kuponu hazırla`,
      expectedIntent: 'generate_coupon',
      expectedFields: { mustExclude: [13], gameId: game.id },
      tags: ['generated', 'must-exclude'],
    });
    scenarios.push({
      name: `excludeRange: ${game.display} / 1-10`,
      context: [],
      message: `1 ile 10 arasındaki sayılar olmasın, ${game.display} kuponu üret`,
      expectedIntent: 'generate_coupon',
      expectedFields: { excludeRangeMin: 1, excludeRangeMax: 10, gameId: game.id },
      tags: ['generated', 'exclude-range'],
    });
  }

  for (const game of GAMES) {
    for (const count of [2, 3, 5]) {
      scenarios.push({
        name: `Çoklu kupon: ${game.display} x${count}`,
        context: [],
        message: `${count} tane ${game.display} kuponu üret`,
        expectedIntent: 'generate_coupon',
        expectedFields: { count, gameId: game.id, sumMin: null, sumMax: null },
        tags: ['generated', 'count'],
      });
    }
    scenarios.push({
      name: `noOverlap: ${game.display}`,
      context: [],
      message: `3 tane ${game.display} kuponu üret, hepsi farklı olsun ortak sayı olmasın`,
      expectedIntent: 'generate_coupon',
      expectedFields: { count: 3, noOverlap: true, gameId: game.id },
      tags: ['generated', 'no-overlap'],
    });
    scenarios.push({
      name: `balanceEvenOdd: ${game.display}`,
      context: [],
      message: `${game.display} kuponu üret, çift tek dengeli olsun`,
      expectedIntent: 'generate_coupon',
      expectedFields: { balanceEvenOdd: true, gameId: game.id },
      tags: ['generated', 'balance'],
    });
    scenarios.push({
      name: `avoidPatterns: ${game.display}`,
      context: [],
      message: `${game.display} kuponu hazırla, ardışık olmasın sıradan görünmesin`,
      expectedIntent: 'generate_coupon',
      expectedFields: { avoidPatterns: true, gameId: game.id },
      tags: ['generated', 'patterns'],
    });
    scenarios.push({
      name: `spreadZones: ${game.display}`,
      context: [],
      message: `${game.display} kuponu üret, sayılar aralığa yayılsın`,
      expectedIntent: 'generate_coupon',
      expectedFields: { spreadZones: true, gameId: game.id },
      tags: ['generated', 'spread'],
    });
    scenarios.push({
      name: `maxConsecutive: ${game.display}`,
      context: [],
      message: `${game.display} kuponu üret, en fazla 2 ardışık sayı olsun`,
      expectedIntent: 'generate_coupon',
      expectedFields: { maxConsecutive: 2, gameId: game.id },
      tags: ['generated', 'consecutive'],
    });
  }

  for (const game of GAMES) {
    scenarios.push({
      name: `Bağlam devamlılığı: ${game.display}`,
      context: [
        { role: 'user', content: `${game.display} hakkında bilgi ver` },
        { role: 'assistant', content: `${game.display} hakkında kısa bilgi verdim.` },
      ],
      message: 'Bana bir kupon üret',
      expectedIntent: 'generate_coupon',
      expectedFields: { gameId: game.id },
      tags: ['generated', 'context'],
    });
  }

  const educationMessages = [
    'Kupon üretmek ne demek burada?',
    'Sayıları nasıl üretiyorsun, anlat',
    'Üretme algoritman nasıl çalışıyor?',
    'Kupon üretme özelliği nasıl kullanılır?',
  ];
  educationMessages.forEach((message, i) => {
    scenarios.push({
      name: `Eğitim sorusu (üretmek kelimesi) v${i + 1}`,
      context: [],
      message,
      expectedIntent: 'chat',
      tags: ['generated', 'education'],
    });
  });

  return dedupeByName(scenarios);
}

function manualChatScenarios() {
  return [
    {
      name: 'Genel soru - kupon üretmemeli',
      messages: ['Süper Loto nasıl oynanır?'],
      tags: ['manual', 'smoke'],
    },
    {
      name: 'Kendi kendini anlatma - istatistik iddiası yapmamalı',
      messages: ['Neye göre kupon üretiyorsun?'],
      tags: ['manual', 'smoke'],
    },
    {
      name: "Alakasız konu - loto'ya yönlendirmeli",
      messages: ['Bugün hava nasıl?'],
      tags: ['manual', 'smoke'],
    },
    {
      name: 'İstatistik sorgusu sonrası teşekkür',
      messages: ['Süper Loto istatistiklerini göster', 'İlginçmiş, teşekkürler'],
      tags: ['manual', 'smoke'],
    },
    {
      name: 'Kumarbaz yanılgısı testi',
      messages: ["Süper Loto'da en az çıkan sayılar hangileri?", 'Bu sayılar yakında çıkar mı?'],
      tags: ['manual', 'smoke', 'gamblers-fallacy'],
    },
    {
      name: 'Karşılanamayan istek sonrası sayı UYDURMAMALI',
      messages: [
        'On Numara için toplamı 55 ile 60 arasında olan bir kupon üret',
        'Neden karşılayamadın?',
        'Hangi aralığı önerirsin?',
      ],
      tags: ['manual', 'smoke'],
    },
    {
      name: 'Kupon teklifine dolaylı onay (sohbet simülasyonu)',
      messages: ["Süper Loto'da sıcak sayılar hangileri?", 'İstersen sana bir kupon üretebilirim, denemek ister misin?', 'Evet'],
      tags: ['manual'],
    },
    {
      name: 'Bileşik kısıtlama isteği',
      messages: ['31 mutlaka olsun ve toplamı 200 ile 250 arasında olan bir Şans Topu kuponu üretir misin?'],
      tags: ['manual'],
    },
    {
      name: 'Israrcı kullanıcı - sayı uydurmamalı',
      messages: [
        'Bana hemen 5 sayı söyle',
        'Hayır cidden istiyorum, sadece örnek ver',
        'Tamam kupon değil, sadece merak ediyorum senin aklına gelen ilk 6 sayı ne olur',
      ],
      tags: ['manual', 'smoke'],
    },
    {
      name: 'Çoklu oyun karşılaştırması',
      messages: ['Çılgın Sayısal ile Süper Loto arasındaki fark ne?'],
      tags: ['manual', 'smoke'],
    },
  ];
}

function generateChatScenarios() {
  const scenarios = [...manualChatScenarios()];

  const singleTurnTemplates = [
    (g) => `${g.display} nasıl oynanır?`,
    (g) => `${g.display} istatistiklerini göster`,
    (g) => `${g.display}'da en çok çıkan sayılar hangileri?`,
    (g) => `${g.display}'da en az çıkan sayılar hangileri?`,
    (g) => `${g.display} büyük ikramiye ihtimali nedir?`,
    (g) => `Bu sayılar yakında çıkar mı? (${g.display} soğuk sayılar hakkında)`,
    (g) => `Neye göre kupon üretiyorsun? (${g.display} bağlamında merak ediyorum)`,
  ];

  for (const game of GAMES) {
    singleTurnTemplates.forEach((tpl, i) => {
      scenarios.push({
        name: `Tek tur sohbet: ${game.display} v${i + 1}`,
        messages: [tpl(game)],
        tags: ['generated', 'single-turn'],
      });
    });
  }

  const offTopic = [
    'Futbol maçı sonucu ne olur sence?',
    'Siyaset hakkında ne düşünüyorsun?',
    'Bana bir şarkı sözü yaz',
    'Python öğrenmek istiyorum, nereden başlamalıyım?',
    'En sevdiğin yemek ne?',
  ];
  offTopic.forEach((message, i) => {
    scenarios.push({
      name: `Alakasız konu v${i + 1}`,
      messages: [message],
      tags: ['generated', 'off-topic'],
    });
  });

  return dedupeByName(scenarios);
}

function manualExplanationScenarios() {
  return [
    {
      name: 'Normal kupon açıklaması (kısıtlama yok)',
      game: 'Süper Loto',
      numbers: [9, 19, 24, 35, 41, 53],
      superStar: null,
      bonus: null,
      constraints: {},
      relaxed: false,
      tags: ['manual', 'smoke'],
    },
    {
      name: 'mustInclude karşılandı',
      game: 'Şans Topu',
      numbers: [8, 15, 22, 31, 33],
      superStar: null,
      bonus: 5,
      constraints: { mustInclude: [31] },
      relaxed: false,
      tags: ['manual', 'smoke'],
    },
    {
      name: 'sumRange KARŞILANAMADI',
      game: 'On Numara',
      numbers: [5, 12, 23, 34, 41, 48, 52, 63, 71, 76],
      superStar: null,
      bonus: null,
      constraints: { sumRange: { min: 50, max: 100 } },
      relaxed: true,
      tags: ['manual', 'smoke'],
    },
  ];
}

function generateExplanationScenarios() {
  const scenarios = [...manualExplanationScenarios()];

  const samples = {
    'Süper Loto': { numbers: [3, 14, 27, 38, 45, 52], superStar: null, bonus: null },
    'Şans Topu': { numbers: [4, 11, 19, 26, 33], superStar: null, bonus: 7 },
    'On Numara': { numbers: [2, 9, 18, 25, 33, 40, 48, 55, 62, 70], superStar: null, bonus: null },
    'Çılgın Sayısal': { numbers: [5, 17, 28, 44, 61, 78], superStar: 12, bonus: null },
  };

  const constraintVariants = [
    { constraints: { mustInclude: [7] }, relaxed: false, label: 'mustInclude' },
    { constraints: { balanceEvenOdd: true }, relaxed: false, label: 'balanceEvenOdd' },
    { constraints: { sumRange: { min: 200, max: 280 } }, relaxed: false, label: 'sumRange-ok' },
    { constraints: { sumRange: { min: 50, max: 80 } }, relaxed: true, label: 'sumRange-relaxed' },
  ];

  for (const [game, sample] of Object.entries(samples)) {
    for (const variant of constraintVariants) {
      scenarios.push({
        name: `Açıklama ${game}: ${variant.label}`,
        game,
        numbers: sample.numbers,
        superStar: sample.superStar,
        bonus: sample.bonus,
        constraints: variant.constraints,
        relaxed: variant.relaxed,
        tags: ['generated'],
      });
    }
  }

  return dedupeByName(scenarios);
}

function filterScenarios(scenarios, mode) {
  if (mode === 'smoke') {
    return scenarios.filter((s) => s.tags?.includes('smoke'));
  }
  if (mode === 'classify-only' || mode === 'chat-only' || mode === 'explanation-only') {
    return scenarios;
  }
  return scenarios;
}

function getScenarios(mode = 'full') {
  const classify = filterScenarios(generateClassifyScenarios(), mode);
  const chat = filterScenarios(generateChatScenarios(), mode);
  const explanation = filterScenarios(generateExplanationScenarios(), mode);

  if (mode === 'classify-only') return { classify, chat: [], explanation: [] };
  if (mode === 'chat-only') return { classify: [], chat, explanation: [] };
  if (mode === 'explanation-only') return { classify: [], chat: [], explanation };

  return { classify, chat, explanation };
}

function countScenarios(mode = 'full') {
  const { classify, chat, explanation } = getScenarios(mode);
  return {
    classify: classify.length,
    chat: chat.length,
    explanation: explanation.length,
    total: classify.length + chat.length + explanation.length,
  };
}

module.exports = {
  getScenarios,
  countScenarios,
  GAMES,
};
