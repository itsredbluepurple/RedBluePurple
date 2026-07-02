import type { DeepResearcher, DeepResult, Rules } from '../types';
import { anthropicJson } from '../anthropic';
import { log } from '../log';
import { isVerdict } from '../verdict';

const MODEL = 'claude-sonnet-4-6';

interface MessagesResponse {
  content?: Array<{ type: string; name?: string; input?: unknown }>;
}

export function buildDeepRequest(company: string, rules: Rules) {
  return {
    model: MODEL,
    max_tokens: 1024,
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 4 },
      {
        name: 'brief',
        description: 'Return a structured research brief for the company.',
        input_schema: {
          type: 'object',
          properties: {
            verdict: { type: 'string', enum: ['aligned', 'flagged', 'mixed', 'neutral'] },
            rating: { type: ['number', 'null'] },
            size: { type: ['string', 'null'] },
            news: { type: 'array', items: { type: 'string' } },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
          },
          required: ['verdict', 'news', 'pros', 'cons'],
        },
      },
    ],
    system:
      'Research the company with web search, then call the brief tool. ' +
      'rating = Glassdoor-style 1–5 if found else null. size = headcount range if found else null. ' +
      'news = up to 3 recent items. pros = evidence for their criteria, cons = evidence against. ' +
      'If you could not verify something, leave it out rather than guessing. ' +
      'Then return a verdict (aligned/flagged/mixed/neutral) with evidence for and against based on the criteria below.\n\n' +
      `Their criteria:\n${rules.prompt}`,
    messages: [{ role: 'user', content: `Research this company for a job seeker: ${company}` }],
  };
}

export function parseDeepResponse(input: any, company: string): DeepResult {
  return {
    company,
    verdict: isVerdict(input?.verdict) ? input.verdict : undefined,
    rating: typeof input.rating === 'number' ? input.rating : null,
    size: typeof input.size === 'string' ? input.size : null,
    news: Array.isArray(input.news) ? input.news : [],
    pros: Array.isArray(input.pros) ? input.pros : [],
    cons: Array.isArray(input.cons) ? input.cons : [],
    researchedAt: Date.now(),
  };
}

export const sonnetDeep: DeepResearcher = {
  async research(company: string, rules: Rules): Promise<DeepResult> {
    log.info('deep:start', { company, model: MODEL });
    // Web search makes this call slow (~15-40s); allow more time, fewer retries
    // than the cheap scan call since each attempt costs real search usage.
    const data = await anthropicJson<MessagesResponse>(buildDeepRequest(company, rules), rules.apiKey, {
      label: 'deep',
      timeoutMs: 60000,
      maxRetries: 2,
    });
    const toolUse = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'brief');
    const result = parseDeepResponse(toolUse?.input ?? {}, company);
    log.info('deep:done', { company, rating: result.rating, news: result.news.length });
    return result;
  },
};
