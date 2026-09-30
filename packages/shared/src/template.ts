/** Resolve `{a|b|c}` spintax (nestable) by picking a random variant. */
export function resolveSpintax(input: string, rand: () => number = Math.random): string {
  const re = /\{([^{}]*\|[^{}]*)\}/;
  let out = input;
  // Innermost-first; guard against pathological input.
  for (let i = 0; i < 1000; i++) {
    const m = re.exec(out);
    if (!m) break;
    const opts = m[1].split('|');
    out = out.slice(0, m.index) + opts[Math.floor(rand() * opts.length)] + out.slice(m.index + m[0].length);
  }
  return out;
}

/** Replace `{{var}}` with values; unknown vars become empty string. */
export function renderVariables(input: string, vars: Record<string, string> = {}): string {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

export function renderTemplate(input: string, vars: Record<string, string> = {}, rand?: () => number): string {
  // Variables first so they cannot be mistaken for spintax braces.
  return resolveSpintax(renderVariables(input, vars), rand);
}
