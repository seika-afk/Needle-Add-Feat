import nodemailer from "nodemailer";
import "dotenv/config";
import { generate_email_main } from "./generate_mail";
import type { EmailResult } from "./generate_mail";

type EmailContent = EmailResult["content"];

async function sendEmail(q: EmailContent) {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL,
      pass: process.env.APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL,
    to: q.to,
    subject: q.subject,
    text: q.text,
  });

  console.log("Message sent");
}

async function main() {
  const email = "talk2gagan09@gmail.com";
  const userq = "Ask if they will be free tonight around 10pm for a call";
  const extrainfo = "ABC is a renowned military officer";

  const res = await generate_email_main(email, userq, extrainfo);
  
  await sendEmail(res);
}

main().catch(console.error);
