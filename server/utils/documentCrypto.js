const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const secret = process.env.DOCUMENT_ENCRYPTION_KEY || '';
  if (!secret.trim()) return null;
  if (/^[a-f0-9]{64}$/i.test(secret.trim())) {
    return Buffer.from(secret.trim(), 'hex');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptionEnabled() {
  return !!getKey();
}

function encryptContent(content) {
  const key = getKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(content || ''), 'utf8'),
    cipher.final()
  ]);
  return {
    v: 1,
    alg: ALGORITHM,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptContent(payload) {
  const key = getKey();
  if (!key || !payload || payload.alg !== ALGORITHM) return null;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function withEncryptedContent(doc, content) {
  const encrypted = encryptContent(content);
  if (!encrypted) return { ...doc, content: content || '' };
  const { content: _content, ...rest } = doc;
  return {
    ...rest,
    content: undefined,
    contentEncrypted: encrypted,
    contentEncryptedAt: new Date().toISOString()
  };
}

function withDecryptedContent(doc) {
  if (!doc) return doc;
  if (doc.contentEncrypted) {
    const content = decryptContent(doc.contentEncrypted);
    return {
      ...doc,
      content: content == null ? '' : content
    };
  }
  return doc;
}

function redactEncryptedContent(doc) {
  if (!doc) return doc;
  const { content, contentEncrypted, ...safeDoc } = doc;
  return {
    ...safeDoc,
    contentRedacted: true,
    contentAvailableToAdmin: false,
    contentEncrypted: !!contentEncrypted || !!doc.contentEncryptedAt
  };
}

module.exports = {
  encryptionEnabled,
  encryptContent,
  decryptContent,
  withEncryptedContent,
  withDecryptedContent,
  redactEncryptedContent
};
