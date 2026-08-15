import { ChatOpenRouter } from "@langchain/openrouter";
import 'dotenv/config';
import { RESEARCH_MODEL_PROMPT } from "./PROMPTS";
import z from "zod";

const apiKey = process.env.OPENROUTER_API_KEY;

export const researchModel = new ChatOpenRouter({
  apiKey,
  model: "deepseek/deepseek-chat-v3.1:online",
  temperature: 0,
  maxTokens: 800,
});

const TargetSchema = z.object({
  content: z
    .object({
      summary: z
        .string()
        .describe('A concise summary of the research findings for this contact/company.'),
    })
    .describe('The research report content returned to the user'),
  reasoning: z.string().describe('Two-three sentences explaining what you did'),
});

const model = researchModel.withStructuredOutput(TargetSchema);

export type TargetResult = z.infer<typeof TargetSchema>;

export async function research(query: string): Promise<TargetResult> {
  const response = await model.invoke([
    { role: "system", content: [{ type: "text", text: RESEARCH_MODEL_PROMPT }] },
    { role: "user", content: [{ type: "text", text: query }] },
  ]);

  return response;
}
