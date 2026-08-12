import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { FILTER_GENRATOR_PROMPT } from './PROMPTS';

const TargetSchema = z.object({
  target_companies: z
    .array(
      z.object({
        name: z.string().describe('Company or organization name'),
        domain: z.string().describe('Best-guess website domain, e.g. "example.com"'),
      })
    )
    .describe('5-10 real companies/organizations that plausibly fit the request'),
  role_keywords: z
    .array(z.string())
    .describe('Job title / position keywords to filter for within each company\'s results, e.g. "founder", "owner", "photographer"'),
  reasoning: z.string().describe('One sentence explaining the targeting logic'),
});

export type TargetResult = z.infer<typeof TargetSchema>;


function buildModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set in your .env file');

  return new ChatOpenAI({
    apiKey,
    model: 'deepseek/deepseek-chat-v3.1',
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Lead Finder Bot',
      },
    },
    temperature: 0.3,
     maxTokens: 300,
  });
}

export async function generateTargets(userPrompt: string): Promise<TargetResult> {
  const model = buildModel().withStructuredOutput(TargetSchema);

  const result = await model.invoke([
    { role: 'system', content:  FILTER_GENRATOR_PROMPT},
    { role: 'user', content: userPrompt },
  ]);

  return result;
}
