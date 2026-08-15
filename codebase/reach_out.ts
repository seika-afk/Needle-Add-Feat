import nodemailer from "nodemailer";
import "dotenv/config";
import { generate_email_main } from "./generate_mail";
import type { EmailResult } from "./generate_mail";

type EmailContent = EmailResult["content"];

export async function sendEmail(q: EmailContent) {

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
