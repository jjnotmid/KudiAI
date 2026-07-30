import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

const LOGO_URL = "https://res.cloudinary.com/r02znnpk/image/upload/v1785373046/kudi-logo.png";

/** Send an HTML email via Resend. Never throws — caller degrades gracefully. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const env = getEnv();
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `Kudi <${env.RESEND_FROM}>`, to: [to], subject, html }),
    });
    if (!res.ok) {
      log("warn", "email.send_failed", { status: res.status, detail: (await res.text()).slice(0, 160) });
      return false;
    }
    return true;
  } catch (e) {
    log("warn", "email.exception", { detail: String(e) });
    return false;
  }
}

/** Branded verification email with the logo and the 6-digit code. */
export async function sendVerificationEmail(to: string, name: string, code: string): Promise<boolean> {
  const first = name.trim().split(/\s+/)[0] || "there";
  const html = `
  <div style="margin:0;padding:0;background:#f4efe4;">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16150f;">
      <div style="background:#ffffff;border:1px solid #ece7da;border-radius:20px;overflow:hidden;">
        <div style="height:5px;background:#0c4b3a;"></div>
        <div style="background:#ffffff;padding:28px 28px 22px;text-align:center;border-bottom:1px solid #f1ece0;">
          <img src="${LOGO_URL}" alt="Kudi" width="160" style="display:inline-block;height:auto;max-width:160px;" />
        </div>
        <div style="padding:32px 28px;">
          <p style="margin:0 0 8px;font-size:15px;color:#4b4736;">Hi ${escapeHtml(first)},</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Use this code to confirm your email and set up your Kudi account:</p>
          <div style="text-align:center;margin:8px 0 24px;">
            <span style="display:inline-block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#0c4b3a;background:#f4efe4;border-radius:12px;padding:16px 24px;">${code}</span>
          </div>
          <p style="margin:0;font-size:13px;color:#8a856f;line-height:1.5;">This code expires shortly. If you didn't request it, you can ignore this email.</p>
        </div>
      </div>
      <p style="text-align:center;margin:20px 0 0;font-size:12px;color:#a29c85;">Kudi — money you can talk to.</p>
    </div>
  </div>`;
  return sendEmail(to, `Your Kudi code is ${code}`, html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
