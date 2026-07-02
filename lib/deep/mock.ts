import type { DeepResearcher, DeepResult } from '../types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockDeep: DeepResearcher = {
  async research(company: string): Promise<DeepResult> {
    await delay(600);
    return {
      company,
      verdict: 'mixed',
      rating: 2.8,
      size: '51–200',
      news: [
        `${company} raised a Series B last quarter`,
        'Recently opened a second office',
      ],
      pros: ['Actively hiring for similar roles', 'Strong employer rating'],
      cons: ['Recent restructuring news'],
      researchedAt: Date.now(),
    };
  },
};
