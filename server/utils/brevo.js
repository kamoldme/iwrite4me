async function sendBrevoEmail({
  apiKey,
  senderEmail,
  senderName,
  toEmail,
  toName,
  subject,
  htmlContent,
  fetchImpl = fetch
}) {
  const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: toEmail, name: toName }],
      subject,
      htmlContent
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (response.ok) return true;

  const body = await response.text().catch(() => '');
  throw new Error(`Brevo email failed: ${response.status} ${body}`);
}

module.exports = { sendBrevoEmail };
