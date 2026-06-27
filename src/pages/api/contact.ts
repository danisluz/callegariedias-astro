import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

export const prerender = false;

const TO_EMAIL = import.meta.env.CONTACT_TO_EMAIL || 'adv.guilhermecallegari@gmail.com';
const GMAIL_USER = import.meta.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = import.meta.env.GMAIL_APP_PASSWORD;

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
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
