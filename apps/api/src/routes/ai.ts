import { Router } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import { config, redis } from '@ejs/core';
import { uid } from '../auth';

export const aiRouter = Router();

const bodySchema = z.object({ prompt: z.string().trim().min(5).max(400) });

/**
 * Credit-conscious by design: only runs on an explicit click, output is capped, identical prompts are served
 * from a 24h Redis cache (no API call), and each user has a daily call budget.
 */
aiRouter.post('/generate', async (req, res) => {
  if (!config.gemini.apiKey) return void res.status(501).json({ error: 'AI is not configured (GEMINI_API_KEY)' });
  const { prompt } = bodySchema.parse(req.body);
  const userId = uid(req);

  const cacheKey = `ai:cache:${createHash('sha256').update(prompt.toLowerCase()).digest('hex')}`;
  const cached = await redis.get(cacheKey);
  if (cached) return void res.json({ ...JSON.parse(cached), cached: true });

  const day = new Date().toISOString().slice(0, 10);
  const usageKey = `ai:usage:${userId}:${day}`;
  const used = await redis.incr(usageKey);
  if (used === 1) await redis.expire(usageKey, 86400);
  if (used > config.gemini.dailyLimitPerUser) {
    await redis.decr(usageKey);
    return void res.status(429).json({ error: `Daily AI limit reached (${config.gemini.dailyLimitPerUser}/day)` });
  }

  const instruction =
    'Write a short, friendly, non-spammy cold outreach email. Reply ONLY with JSON: {"subject": string, "body": string}. ' +
    'The body is simple HTML using <p> tags, under 90 words. You may use {{firstName}} and spintax like {Hi|Hello}. ' +
    `Brief: ${prompt}`;

  // Primary model first; on overload/timeout (5xx) fall back once to a cheaper model.
  const models = [config.gemini.model, config.gemini.fallbackModel].filter((m, i, a) => m && a.indexOf(m) === i);
  let r: Response | null = null;
  let usedModel = models[0];
  for (const model of models) {
    usedModel = model;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
          generationConfig: { maxOutputTokens: 350, temperature: 0.7, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      r = null;
      req.log.warn({ model }, 'gemini request failed/timed out');
      continue;
    }
    if (r.status < 500) break;
    req.log.warn({ model, status: r.status }, 'gemini overloaded, trying fallback');
  }
  if (!r) {
    await redis.decr(usageKey);
    return void res.status(504).json({ error: 'AI request timed out' });
  }

  if (!r.ok) {
    await redis.decr(usageKey); // failed calls do not spend the user's budget
    const detail = await r.text().catch(() => '');
    req.log.warn({ status: r.status, detail: detail.slice(0, 300) }, 'gemini error');
    return void res.status(502).json({ error: r.status >= 500 ? 'AI is busy right now, try again shortly' : `AI provider error (${r.status})` });
  }

  try {
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const out = z.object({ subject: z.string(), body: z.string() }).parse(JSON.parse(text));
    await redis.set(cacheKey, JSON.stringify(out), 'EX', 86400);
    res.json({ ...out, cached: false, model: usedModel, remaining: Math.max(0, config.gemini.dailyLimitPerUser - used) });
  } catch {
    await redis.decr(usageKey);
    res.status(502).json({ error: 'AI returned an unreadable response' });
  }
});

aiRouter.get('/status', async (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const used = Number((await redis.get(`ai:usage:${uid(req)}:${day}`)) ?? 0);
  res.json({ enabled: !!config.gemini.apiKey, remaining: Math.max(0, config.gemini.dailyLimitPerUser - used) });
});
