import nodemailer from 'nodemailer';

const deliveryFailure = () => Object.assign(new Error('Không thể gửi mã Gmail. Hãy thử lại sau.'), { code: 'MAIL_DELIVERY_FAILED' });
const validAddress = value => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

/** Returns null until credentials exist. This factory never connects or logs credentials. */
export function createSmtpMailer({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  if (!user || !pass) return null;
  const host = env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(env.SMTP_PORT || 465);
  const secureText = env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureText === undefined || secureText === '' ? port === 465 : secureText === 'true';
  const from = env.SMTP_FROM?.trim() || user;
  if (!validAddress(from) || !/^[a-zA-Z0-9.-]+$/.test(host)
    || ![465, 587].includes(port) || (secureText && !['true', 'false'].includes(secureText))
    || secure !== (port === 465)) throw new Error('SMTP configuration invalid: use TLS on port 465 or STARTTLS on port 587.');

  const transport = createTransport({
    host, port, secure, requireTLS: !secure,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });
  return async (email, otp, purpose) => {
    if (!validAddress(email) || !/^\d{6}$/.test(otp) || !['register', 'login'].includes(purpose)) throw deliveryFailure();
    try {
      const result = await transport.sendMail({
        from: { name: 'Cổ Tiên Lộ', address: from }, to: email,
        subject: purpose === 'register' ? 'Mã xác nhận đăng ký Cổ Tiên Lộ' : 'Mã đăng nhập Cổ Tiên Lộ',
        text: `Mã xác thực Cổ Tiên Lộ của bạn: ${otp}\nMã có hiệu lực 5 phút và chỉ dùng một lần. Không chia sẻ mã này. Nếu không yêu cầu, bạn có thể bỏ qua thư.`,
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!Array.isArray(result?.accepted) || !result.accepted.some(recipient => String(recipient).toLowerCase() === email.toLowerCase())) throw deliveryFailure();
    } catch { throw deliveryFailure(); }
  };
}
