const { stripMarkdown } = require('../lib/stripMarkdown');

const FORBIDDEN_GAMBLERS_FALLACY = [
  'sırası gel',
  'bu sefer çıkabilir',
  'onların sırası',
  'gecikti demek',
  'iyi gidiyor',
  'yakında çıkar',
  'çıkma vakti',
  'sırası gelmiş',
  'artık çıkmalı',
  'gecikmiş sayı',
];

const FORBIDDEN_STATS_CLAIM = [
  'istatistiklere göre seç',
  'istatistiklere dayanarak seç',
  'geçmiş verilere dayanarak seç',
  'geçmiş verilere göre seç',
  'istatistiklere göre üret',
  'geçmişe dayanarak seç',
  'sık çıkan',
  'az çıkan',
  'olasılık hesap',
  'istatistiklere dayalı',
  'geçmiş çekiliş',
  'sıcak sayı',
  'soğuk sayı',
];

const FORBIDDEN_WRONG_ATTRIBUTION = [
  'seçtiğin sayılar',
  'seçimlerin',
  'verdiğin sayılar',
];

const MARKDOWN_PATTERNS = [
  /\*\*.+\*\*/,
  /^#{1,6}\s/m,
  /^\s*[-*+]\s/m,
];

// Oyun kuralı açıklamalarındaki "1-60 arası" gibi ifadeleri hariç tut
const RULE_RANGE_REGEX = /\d{1,2}\s*[-–]\s*\d{1,2}\s*arası/;
const NUMBER_SEQUENCE_REGEX = /\d{1,2}(\s*[,\-–]\s*\d{1,2}){3,}/;

/** Ardışık tam sayı listesi (ör. "56, 57, 58, 59, 60") — matematik açıklaması, kupon değil. */
function isConsecutiveExplanationSequence(match) {
  const nums = match.split(/\s*[,\-–]\s*/).map((s) => Number(s.trim()));
  if (nums.length < 4 || nums.some((n) => !Number.isInteger(n))) return false;
  return nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
}

function hasForbiddenNumberSequence(text) {
  const withoutRuleRanges = text.replace(RULE_RANGE_REGEX, '');
  const regex = new RegExp(NUMBER_SEQUENCE_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(withoutRuleRanges)) !== null) {
    if (!isConsecutiveExplanationSequence(match[0])) return true;
  }
  return false;
}

function autoCheck(reply, options = {}) {
  const {
    forbidNumberSequence = false,
    isExplanation = false,
    checkMarkdown = true,
  } = options;

  const issues = [];
  if (!reply) return ['Boş cevap'];

  // Uygulama kullanıcıya stripMarkdown uygulanmış metni gösterir — test de aynı metni denetler.
  const sanitized = stripMarkdown(reply.trim());
  const lower = sanitized.toLocaleLowerCase('tr-TR');

  for (const phrase of FORBIDDEN_GAMBLERS_FALLACY) {
    if (lower.includes(phrase)) issues.push(`Kumarbaz yanılgısı şüphesi: "${phrase}"`);
  }
  for (const phrase of FORBIDDEN_STATS_CLAIM) {
    if (lower.includes(phrase)) issues.push(`Yanlış istatistik iddiası: "${phrase}"`);
  }
  if (isExplanation) {
    for (const phrase of FORBIDDEN_WRONG_ATTRIBUTION) {
      if (lower.includes(phrase)) issues.push(`Yanlış hitap: "${phrase}"`);
    }
  }
  if (checkMarkdown) {
    for (const pattern of MARKDOWN_PATTERNS) {
      if (pattern.test(sanitized)) {
        issues.push('Markdown formatı tespit edildi (stripMarkdown sonrası)');
        break;
      }
    }
  }
  if (forbidNumberSequence && hasForbiddenNumberSequence(sanitized)) {
    issues.push('Sohbet modunda sayı dizisi tespit edildi (AI kendi kafasından kupon uydurmuş olabilir)');
  }

  return issues;
}

module.exports = { autoCheck, stripMarkdown };
