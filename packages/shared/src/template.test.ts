import { describe, it, expect } from 'vitest';
import { resolveSpintax, renderTemplate } from './template';
import { hourWindowLabel, nextHourWindowStart } from './time';
import { idempotencyKey } from './idempotency';

describe('template', () => {
  it('resolves spintax deterministically with injected rand', () => {
    expect(resolveSpintax('{Hi|Hello}', () => 0)).toBe('Hi');
    expect(resolveSpintax('{Hi|Hello}', () => 0.99)).toBe('Hello');
  });
  it('renders variables then spintax', () => {
    expect(renderTemplate('{Hi|Hey} {{firstName}}', { firstName: 'Ann' }, () => 0)).toBe('Hi Ann');
  });
});
describe('time', () => {
  it('computes windows', () => {
    const t = Date.UTC(2026, 0, 1, 10, 30);
    expect(hourWindowLabel(t)).toBe('2026-01-01T10');
    expect(nextHourWindowStart(t)).toBe(Date.UTC(2026, 0, 1, 11));
  });
});
describe('idempotency', () => {
  it('is stable and case-insensitive', () => {
    expect(idempotencyKey('c', 'A@x.com')).toBe(idempotencyKey('c', 'a@x.com'));
    expect(idempotencyKey('c', 'a@x.com', 1)).not.toBe(idempotencyKey('c', 'a@x.com', 0));
  });
});
