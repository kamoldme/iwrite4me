const test = require('node:test');
const assert = require('node:assert/strict');
const { sendBrevoEmail } = require('../server/utils/brevo');

const email = {
  apiKey: 'test-key',
  senderEmail: 'hello@iwrite4.me',
  senderName: 'iWrite4.me',
  toEmail: 'writer@example.com',
  toName: 'Writer',
  subject: 'Verification code',
  htmlContent: '<p>123456</p>'
};

test('sends transactional email through the Brevo HTTPS API', async () => {
  let request;
  const result = await sendBrevoEmail({
    ...email,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201 };
    }
  });

  assert.equal(result, true);
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['api-key'], 'test-key');
  assert.deepEqual(JSON.parse(request.options.body).to, [{ email: 'writer@example.com', name: 'Writer' }]);
});

test('returns Brevo API errors without attempting an SMTP socket', async () => {
  await assert.rejects(
    sendBrevoEmail({
      ...email,
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        text: async () => '{"code":"unauthorized"}'
      })
    }),
    /Brevo email failed: 401.*unauthorized/
  );
});
