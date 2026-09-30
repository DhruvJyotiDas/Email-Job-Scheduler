import { describe, it, expect } from 'vitest';
import { spamCheck } from './spam';

describe('spamCheck', () => {
  it('passes a normal email', () => {
    const r = spamCheck('Quick question about your onboarding', '<p>Hi Ann, I noticed your team is hiring and wanted to ask how you handle onboarding today.</p>');
    expect(r.level).toBe('good');
  });
  it('flags a spammy email', () => {
    const r = spamCheck('FREE WINNER!!! ACT NOW', '<p>Click here for guaranteed cash!!!</p>');
    expect(r.level).toBe('bad');
    expect(r.issues.length).toBeGreaterThan(2);
  });
});
