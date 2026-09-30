export interface SpamReport {
  score: number; // 0 (clean) .. 100 (very spammy)
  level: 'good' | 'warn' | 'bad';
  issues: string[];
}

const TRIGGER_WORDS = [
  'free', 'winner', 'guarantee', 'guaranteed', 'act now', 'limited time', 'urgent', 'click here', 'buy now',
  'cash', 'earn money', 'no obligation', 'risk-free', '100%', 'congratulations', 'lowest price', 'order now',
  'exclusive deal', 'make money', 'credit card', 'viagra', 'casino',
];

/** Local heuristic linter (no network / no cost). Mirrors what deliverability tools flag first. */
export function spamCheck(subject: string, html: string): SpamReport {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const all = `${subject} ${text}`.toLowerCase();
  const issues: string[] = [];
  let score = 0;

  const hits = TRIGGER_WORDS.filter((w) => all.includes(w));
  if (hits.length) {
    score += Math.min(40, hits.length * 10);
    issues.push(`Spam trigger words: ${hits.slice(0, 4).join(', ')}`);
  }

  const letters = subject.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 6 && subject === subject.toUpperCase()) {
    score += 20;
    issues.push('Subject is ALL CAPS');
  }

  const bangs = (all.match(/!/g) ?? []).length;
  if (bangs > 2) {
    score += Math.min(15, bangs * 3);
    issues.push('Too many exclamation marks');
  }

  const links = (html.match(/<a\s[^>]*href/gi) ?? []).length + (text.match(/https?:\/\//g) ?? []).length;
  const words = text.split(' ').filter(Boolean).length;
  if (links > 3 || (words > 0 && links / words > 0.05)) {
    score += 15;
    issues.push('High link density');
  }

  if (/<img/i.test(html) && words < 15) {
    score += 15;
    issues.push('Image-heavy with little text');
  }

  if (subject.trim().length > 0 && subject.trim().length < 4) {
    score += 5;
    issues.push('Subject is very short');
  }
  if (subject.length > 90) {
    score += 5;
    issues.push('Subject is very long');
  }
  if (words > 0 && words < 8) {
    score += 5;
    issues.push('Body is very short');
  }

  score = Math.min(100, score);
  return { score, level: score < 25 ? 'good' : score < 55 ? 'warn' : 'bad', issues };
}
