import test from 'node:test';
import assert from 'node:assert/strict';

test('SMTP transport requires credentials and sends no fake fallback mail', async () => {
  const { createSmtpMailer } = await import('./email-transport.mjs');
  assert.equal(createSmtpMailer({ env: {} }), null);
  assert.equal(createSmtpMailer({ env: { SMTP_USER: 'sender@gmail.com' } }), null);
});

test('Gmail default SMTP uses verified TLS and sends only the intended recipient', async () => {
  const { createSmtpMailer } = await import('./email-transport.mjs');
  let settings, message;
  const mailer = createSmtpMailer({ env: { SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'app password' },
    createTransport: options => { settings = options; return { sendMail: async mail => { message = mail; return { accepted: [mail.to] }; } }; } });
  const result = await mailer('player@gmail.com', '123456', 'register');
  assert.equal(settings.host, 'smtp.gmail.com');
  assert.equal(settings.port, 465);
  assert.equal(settings.secure, true);
  assert.equal(settings.tls.rejectUnauthorized, true);
  assert.equal(settings.logger, false);
  assert.equal(settings.debug, false);
  assert.equal(message.to, 'player@gmail.com');
  assert.equal(message.from.address, 'sender@gmail.com');
  assert.match(message.text, /123456/);
  assert.match(message.subject, /đăng ký/i);
  assert.equal(result, undefined);
});

test('SMTP port 587 requires STARTTLS and invalid port/security config is rejected', async () => {
  const { createSmtpMailer } = await import('./email-transport.mjs');
  let settings;
  const factory = options => { settings = options; return { sendMail: async mail => ({ accepted: [mail.to] }) }; };
  const mailer = createSmtpMailer({ env: { SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'app-password', SMTP_PORT: '587', SMTP_SECURE: 'false' }, createTransport: factory });
  await mailer('player@gmail.com', '123456', 'login');
  assert.equal(settings.secure, false);
  assert.equal(settings.requireTLS, true);
  for (const env of [{ SMTP_PORT: '25' }, { SMTP_PORT: '465', SMTP_SECURE: 'false' }, { SMTP_PORT: '587', SMTP_SECURE: 'true' }]) {
    assert.throws(() => createSmtpMailer({ env: { SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'secret', ...env }, createTransport: factory }), /SMTP/);
  }
});

test('SMTP rejection is a sanitized failure and cannot disclose transport credentials', async () => {
  const { createSmtpMailer } = await import('./email-transport.mjs');
  for (const mode of ['reject', 'throw']) {
    const mailer = createSmtpMailer({ env: { SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'secret' },
      createTransport: () => ({ sendMail: async () => { if (mode === 'throw') throw new Error('secret'); return { accepted: [] }; } }) });
    await assert.rejects(mailer('player@gmail.com', '123456', 'register'), error => error.code === 'MAIL_DELIVERY_FAILED' && !error.message.includes('secret'));
  }
});
