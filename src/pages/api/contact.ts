import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

export const prerender = false;

const TO_EMAIL = import.meta.env.CONTACT_TO_EMAIL || 'adv.guilhermecallegari@gmail.com';
const GMAIL_USER = import.meta.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = import.meta.env.GMAIL_APP_PASSWORD;
const TURNSTILE_SECRET_KEY = import.meta.env.TURNSTILE_SECRET_KEY;

const MIN_FILL_TIME_MS = 3000; // humanos levam pelo menos alguns segundos para preencher
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000; // 2h: evita reenvio de formulário "congelado"

const MAX_LENGTHS = {
  nome: 100,
  email: 150,
  telefone: 20,
  mensagem: 2000
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function verifyTurnstile(secretKey: string, token: string, remoteIp: string | null): Promise<boolean> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return json(400, { success: false, message: 'Requisição inválida' });
  }

  // Honeypot anti-spam
  if (body.website) {
    return json(400, { success: false, message: 'Formulário inválido' });
  }

  // Trava de tempo: bots costumam enviar quase instantaneamente após carregar a página
  const ts = Number(body.ts);
  if (!ts || Number.isNaN(ts)) {
    return json(400, { success: false, message: 'Formulário inválido' });
  }
  const elapsed = Date.now() - ts;
  if (elapsed < MIN_FILL_TIME_MS || elapsed > MAX_FORM_AGE_MS) {
    return json(400, { success: false, message: 'Formulário inválido. Atualize a página e tente novamente.' });
  }

  // Cloudflare Turnstile (captcha invisível) — só valida se a chave estiver configurada
  if (TURNSTILE_SECRET_KEY) {
    const turnstileToken = body['cf-turnstile-response'];
    if (!turnstileToken) {
      return json(400, { success: false, message: 'Verificação de segurança não concluída. Tente novamente.' });
    }
    const remoteIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const isHuman = await verifyTurnstile(TURNSTILE_SECRET_KEY, turnstileToken, remoteIp);
    if (!isHuman) {
      return json(400, { success: false, message: 'Não foi possível confirmar que você não é um robô. Tente novamente.' });
    }
  }

  const nome = (body.nome ?? '').trim();
  const telefone = (body.telefone ?? '').trim();
  const email = (body.email ?? '').trim();
  const mensagem = (body.mensagem ?? '').trim();

  if (!nome || !email || !mensagem) {
    return json(400, { success: false, message: 'Preencha todos os campos obrigatórios' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { success: false, message: 'E-mail inválido' });
  }
  if (
    nome.length > MAX_LENGTHS.nome ||
    email.length > MAX_LENGTHS.email ||
    telefone.length > MAX_LENGTHS.telefone ||
    mensagem.length > MAX_LENGTHS.mensagem
  ) {
    return json(400, { success: false, message: 'Um dos campos excede o tamanho máximo permitido' });
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('GMAIL_USER ou GMAIL_APP_PASSWORD não configurados');
    return json(500, { success: false, message: 'Erro interno. Tente novamente mais tarde.' });
  }

  const corpo = [
    `Nome: ${nome}`,
    telefone && `Telefone: ${telefone}`,
    `E-mail: ${email}`,
    '',
    'Mensagem:',
    mensagem
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `Callegari & Dias - Site <${GMAIL_USER}>`,
      to: TO_EMAIL,
      replyTo: email,
      subject: `[Site] Nova mensagem de ${nome}`,
      text: corpo
    });

    return json(200, {
      success: true,
      message: 'Mensagem enviada com sucesso! Entraremos em contato em breve.'
    });
  } catch (err) {
    console.error('Contact form error:', err);
    return json(500, { success: false, message: 'Erro ao enviar mensagem. Tente novamente.' });
  }
};
