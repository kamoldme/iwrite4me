const express = require('express');
const { findMany, insertOne, findOne, updateOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const { appendSupportMessage, getSupportMessages, makeSupportMessage } = require('../utils/supportThread');

const router = express.Router();
router.use(authenticate);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_BASE64_LEN = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16;

function detectImageMime(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

// Get user's own tickets
router.get('/', async (req, res) => {
  const tickets = await findMany('support.json', t => t.userId === req.user.id);
  res.json(tickets
    .map(t => ({ ...t, messages: getSupportMessages(t) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Submit a new ticket
router.post('/', async (req, res) => {
  const { subject, message, type, imageBase64, imageMime } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  let storedImage = null;
  if (imageBase64) {
    if (typeof imageBase64 !== 'string' || imageBase64.length > MAX_BASE64_LEN) {
      return res.status(400).json({ error: 'Image too large (max 2MB)' });
    }
    let buf;
    try { buf = Buffer.from(imageBase64, 'base64'); } catch { buf = null; }
    if (!buf || buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'Invalid or oversized image' });
    }
    const detected = detectImageMime(buf);
    if (!detected) {
      return res.status(400).json({ error: 'Only PNG, JPG, or WebP images allowed' });
    }
    if (imageMime && imageMime !== detected) {
      return res.status(400).json({ error: 'Image type mismatch' });
    }
    storedImage = { base64: imageBase64, mime: detected };
  }

  const user = await findOne('users.json', u => u.id === req.user.id);
  const ticket = {
    id: uuid(),
    userId: req.user.id,
    subject,
    message,
    type: type || 'feedback', // feedback, bug, suggestion
    status: 'open',
    adminReply: null,
    repliedAt: null,
    image: storedImage,
    messages: [
      makeSupportMessage('user', message, { image: storedImage })
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await insertOne('support.json', ticket);
  try { require('../telegram').notifySupportTicket(user || { name: 'Unknown', username: '?' }, ticket); } catch {}
  res.status(201).json(ticket);
});

// Add a follow-up message to an existing ticket
router.post('/:id/messages', async (req, res) => {
  const { message, imageBase64, imageMime } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const ticket = await findOne('support.json', t => t.id === req.params.id && t.userId === req.user.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  let storedImage = null;
  if (imageBase64) {
    if (typeof imageBase64 !== 'string' || imageBase64.length > MAX_BASE64_LEN) {
      return res.status(400).json({ error: 'Image too large (max 2MB)' });
    }
    let buf;
    try { buf = Buffer.from(imageBase64, 'base64'); } catch { buf = null; }
    if (!buf || buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'Invalid or oversized image' });
    }
    const detected = detectImageMime(buf);
    if (!detected) {
      return res.status(400).json({ error: 'Only PNG, JPG, or WebP images allowed' });
    }
    if (imageMime && imageMime !== detected) {
      return res.status(400).json({ error: 'Image type mismatch' });
    }
    storedImage = { base64: imageBase64, mime: detected };
  }

  const supportMessage = makeSupportMessage('user', message, { image: storedImage });
  const updated = await updateOne('support.json', t => t.id === ticket.id, {
    messages: appendSupportMessage(ticket, supportMessage),
    status: 'open',
    updatedAt: new Date().toISOString()
  });

  const user = await findOne('users.json', u => u.id === req.user.id);
  try {
    require('../telegram').notifySupportTicketMessage(
      user || { name: 'Unknown', username: '?' },
      updated,
      supportMessage
    );
  } catch {}

  res.status(201).json({ ...updated, messages: getSupportMessages(updated) });
});

module.exports = router;
