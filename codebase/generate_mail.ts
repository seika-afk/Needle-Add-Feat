import { ChatOpenRouter } from "@langchain/openrouter";
import 'dotenv/config';
import z from "zod";
import { EMAIL_MODEL_PROMPT } from "./PROMPTS";

const apiKey = process.env.OPENROUTER_API_KEY;

export const gmail_model = new ChatOpenRouter({
  apiKey,
  model: "deepseek/deepseek-chat-v3.1",
  temperature: 0,
  maxTokens: 300,
});

const EmailSchema = z.object({
  content: z.object({
    to: z.string().describe('Recipient email address.'),
    subject: z.string().describe('A concise, relevant email subject line.'),
    text: z.string().describe('The full plain-text body of the email.'),
  }),
  reasoning: z.string().describe('Two-three sentences explaining what you did'),
});

const model = gmail_model.withStructuredOutput(EmailSchema);
export type EmailResult = z.infer<typeof EmailSchema>;



interface GenerateEmailParams {
  to: string;
  userQuery: string;
  extraInfo?: string;
}

export async function generateEmail({
  to,
  userQuery,
  extraInfo = "",
}: GenerateEmailParams): Promise<EmailResult> {
  const response = await model.invoke([
    { role: "system", content: [{ type: "text", text: EMAIL_MODEL_PROMPT }] },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Recipient email: ${to}\n\nWhat to send: ${userQuery}\n\nExtra info: ${extraInfo}`,
        },
      ],
    },
  ]);
  response.content.to = to;
  return response;
}

export async function generate_email_main(
  email: string,
  userq: string,
  extrainfo: string
): Promise<EmailResult["content"]> {
  const resp = await generateEmail({ to: email, userQuery: userq, extraInfo: extrainfo });
  console.log("REASONING: ",resp.reasoning)
  console.log(JSON.stringify(resp.content, null, 2));
  return resp.content;
}
