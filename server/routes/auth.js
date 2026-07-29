const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const { findOne, insertOne, updateOne, pool } = require('../utils/storage');
const { generateToken, authenticate, checkSubscriptionExpiry } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { sendBrevoEmail } = require('../utils/brevo');
const { OAuth2Client } = require('google-auth-library');

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const APP_URL = (process.env.APP_URL || 'https://iwrite4.me').replace(/\/$/, '');

// Top guessable passwords — quick deny-list. Not exhaustive (zxcvbn would be
// stronger), but blocks the obvious offenders that brute-forcers try first.
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'qwertyui', 'qwerty12', 'iloveyou', 'iloveu123', 'admin123',
  'letmein123', 'welcome1', 'welcome123', 'monkey123', 'football', 'baseball',
  'sunshine', 'princess', 'dragon123', 'shadow123', 'master123', 'abc12345',
  'passw0rd', 'p@ssword', 'p@ssw0rd', '11111111', '00000000', 'asdfghjk',
  'changeme', 'trustno1', 'iwrite4me', 'iwrite123'
]);

function validatePassword(pw) {
  if (!pw || typeof pw !== 'string') return 'Password is required';
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (pw.length > 200) return 'Password is too long';
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'This password is too common, please pick a stronger one';
  return null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  if (!email) return 'Email is required';
  if (email.length > 254) return 'Email is too long';
  if (!validator.isEmail(email)) return 'Please enter a valid email address';
  return null;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createVerificationCode() {
  const code = String(crypto.randomInt(100000, 1000000));
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, hash };
}

function buildEmailCodeBlock(safeCode) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:340px;margin:0 auto;border-radius:18px;background:#0f5e49;background-image:linear-gradient(135deg,#0e6a50 0%,#0b4f3f 100%);box-shadow:0 14px 32px rgba(15,94,73,0.28);">
    <tr>
      <td align="center" style="padding:28px 24px;">
        <div style="font-family:'DM Mono','Courier New',monospace;font-size:44px;line-height:1;font-weight:800;letter-spacing:14px;color:#ffffff;text-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;user-select:all;">${safeCode}</div>
      </td>
    </tr>
  </table>`;
}

function buildVerificationEmail({ name, code }) {
  const safeName = escapeHtml(name || 'writer');
  const safeCode = escapeHtml(code);
  const logoUrl = `${APP_URL}/media/iwrite-logo.png`;
  const classicalImageUrl = `${APP_URL}/media/features-classical-background.jpg`;
  const codeBlock = buildEmailCodeBlock(safeCode);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3eee5;font-family:'Nunito',Arial,Helvetica,sans-serif;color:#17342d;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee5;padding:34px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fffdf7;border:1px solid #ddd2c3;border-radius:22px;overflow:hidden;box-shadow:0 16px 42px rgba(40,31,22,0.16);">
            <tr>
              <td align="center" style="padding:58px 28px 24px;background:#fffdf7;background-image:linear-gradient(180deg,#fffdf9 0%,#fbf7ee 100%);">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 48px;">
                  <tr>
                    <td style="padding:0 9px 0 0;">
                      <img src="${logoUrl}" width="27" height="27" alt="" style="display:block;border:0;border-radius:0;object-fit:contain;">
                    </td>
                    <td style="font-family:'Nunito',Arial,Helvetica,sans-serif;font-size:23px;line-height:1;font-weight:800;color:#35164f;letter-spacing:0;">iWrite4.me</td>
                  </tr>
                </table>
                <h1 style="margin:0;font-family:'Nunito Sans','Nunito',Arial,Helvetica,sans-serif;font-size:54px;line-height:0.98;font-weight:900;color:#371555;letter-spacing:0;text-shadow:0 12px 30px rgba(55,21,85,0.13);">Your code to start writing.</h1>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
                  <tr>
                    <td style="width:48px;height:1px;background:#cdbb9f;font-size:0;line-height:0;">&nbsp;</td>
                    <td style="padding:0 14px;font-size:19px;line-height:1;color:#c0ad90;">&#10022;</td>
                    <td style="width:48px;height:1px;background:#cdbb9f;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 28px 24px;background:#fffdf7;">
                <p style="margin:0 0 24px;font-size:18px;line-height:1.55;color:#62726b;">Hi ${safeName}, enter this code on iWrite4.me</p>
                ${codeBlock}
                <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#7b8781;">Expires in 15 minutes</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0;background:#fffdf7;">
                <img src="${classicalImageUrl}" width="680" alt="" style="display:block;width:100%;max-width:680px;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 24px 34px;background:#fffdf7;">
                <p style="margin:0;font-size:17px;line-height:1.5;color:#596c63;">Focused writing with real stakes.</p>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a938d;">If you did not create an iWrite4.me account, you can ignore this email.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#8a938d;">iWrite4.me &middot; Email verification</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildPasswordResetEmail({ name, code }) {
  const safeName = escapeHtml(name || 'writer');
  const safeCode = escapeHtml(code);
  const logoUrl = `${APP_URL}/media/iwrite-logo.png`;
  const codeBlock = buildEmailCodeBlock(safeCode);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3eee5;font-family:'Nunito',Arial,Helvetica,sans-serif;color:#17342d;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee5;padding:34px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fffdf7;border:1px solid #ddd2c3;border-radius:22px;overflow:hidden;box-shadow:0 16px 42px rgba(40,31,22,0.16);">
            <tr>
              <td align="center" style="padding:48px 28px 22px;background:#fffdf7;background-image:linear-gradient(180deg,#fffdf9 0%,#fbf7ee 100%);">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 36px;">
                  <tr>
                    <td style="padding:0 9px 0 0;">
                      <img src="${logoUrl}" width="27" height="27" alt="" style="display:block;border:0;border-radius:0;object-fit:contain;">
                    </td>
                    <td style="font-family:'Nunito',Arial,Helvetica,sans-serif;font-size:23px;line-height:1;font-weight:800;color:#35164f;letter-spacing:0;">iWrite4.me</td>
                  </tr>
                </table>
                <h1 style="margin:0;font-family:'Nunito Sans','Nunito',Arial,Helvetica,sans-serif;font-size:54px;line-height:0.98;font-weight:900;color:#371555;letter-spacing:0;text-shadow:0 12px 30px rgba(55,21,85,0.13);">Reset your password.</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 28px 42px;background:#fffdf7;">
                <p style="margin:0 0 24px;font-size:18px;line-height:1.55;color:#62726b;">Hi ${safeName}, enter this code on iWrite4.me to choose a new password.</p>
                ${codeBlock}
                <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#7b8781;">Expires in 15 minutes</p>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a938d;">If you did not request this, ignore this email. Your password will stay unchanged.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#8a938d;">iWrite4.me &middot; Password reset</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendTransactionalEmail({ user, subject, htmlContent, devCode }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.MAIL_FROM_EMAIL || process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.MAIL_FROM_NAME || process.env.BREVO_SENDER_NAME || 'iWrite4.me';
  if (!apiKey || !senderEmail) {
    if (process.env.NODE_ENV !== 'production') {
      // Local dev only — no Brevo configured, so just log instead of failing signup/reset.
      console.log(`[dev-email] to=${user.email} subject="${subject}" code=${devCode}`);
      return true;
    }
    throw new Error('Brevo is not configured. Set BREVO_API_KEY and MAIL_FROM_EMAIL.');
  }

  return sendBrevoEmail({
    apiKey,
    senderEmail,
    senderName,
    toEmail: user.email,
    toName: user.name,
    subject,
    htmlContent
  });
}

async function sendVerificationEmail(user, code) {
  return sendTransactionalEmail({
    user,
    subject: 'Your iWrite4.me verification code',
    htmlContent: buildVerificationEmail({ name: user.name, code }),
    devCode: code
  });
}

async function sendPasswordResetEmail(user, code) {
  return sendTransactionalEmail({
    user,
    subject: 'Your iWrite4.me password reset code',
    htmlContent: buildPasswordResetEmail({ name: user.name, code }),
    devCode: code
  });
}

// Streak → tree stage mapping (30 days = max)
const TREE_STAGE_THRESHOLDS = [0, 1, 3, 5, 8, 11, 14, 17, 20, 23, 27, 30];
function streakToTreeStage(streak) {
  for (let i = TREE_STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (streak >= TREE_STAGE_THRESHOLDS[i]) return i;
  }
  return 0;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
    cb(null, true);
  }
});

// Restricted words list for usernames and names
const RESTRICTED_WORDS = [
  'admin', 'administrator', 'moderator', 'mod', 'staff', 'support', 'system', 'official',
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'dick', 'pussy', 'cock', 'cunt', 'bastard',
  'whore', 'slut', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'rape', 'rapist',
  'nazi', 'hitler', 'porn', 'sex', 'penis', 'vagina', 'anus', 'dildo', 'hentai',
  'kill', 'murder', 'suicide', 'terrorist', 'bomb', 'drug', 'cocaine', 'heroin',
  'asshole', 'motherfucker', 'wanker', 'twat', 'piss', 'bollocks', 'crap',
  'iwrite', 'iwrite4me', 'root', 'superuser', 'null', 'undefined'
];

function containsBadWord(str) {
  if (!str) return false;
  const lower = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return RESTRICTED_WORDS.some(w => lower.includes(w));
}

function validateUsername(username) {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 30) return 'Username must be at most 30 characters';
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return 'Username can only contain letters, numbers, underscores, dots, and hyphens';
  if (containsBadWord(username)) return 'Username contains inappropriate content';
  return null;
}

function generateReferralCode() {
  // 8-char alphanumeric code
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateRandomUsername() {
  const adjectives = ['swift', 'bright', 'quiet', 'bold', 'keen', 'wild', 'calm', 'warm', 'cool', 'free'];
  const nouns = ['writer', 'scribe', 'author', 'poet', 'muse', 'quill', 'ink', 'page', 'story', 'word'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9999);
  return `${adj}_${noun}_${num}`;
}

async function markTermsAcceptedIfMissing(user) {
  if (!user || user.acceptedTermsAt) return user;
  return updateOne('users.json', u => u.id === user.id, {
    acceptedTermsAt: user.createdAt || new Date().toISOString()
  });
}

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, password, username } = req.body;
    const email = normalizeEmail(req.body.email);
    const acceptedTerms = req.body.acceptedTerms === true;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'You must agree to the Privacy Policy and Terms of Service.' });
    }
    if (containsBadWord(name)) {
      return res.status(400).json({ error: 'Name contains inappropriate content' });
    }
    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const existing = await findOne('users.json', u => normalizeEmail(u.email) === email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Validate username if provided, otherwise generate one
    let finalUsername = username;
    if (finalUsername) {
      const usernameError = validateUsername(finalUsername);
      if (usernameError) return res.status(400).json({ error: usernameError });
      const usernameTaken = await findOne('users.json', u => u.username && u.username.toLowerCase() === finalUsername.toLowerCase());
      if (usernameTaken) return res.status(409).json({ error: 'Username is already taken' });
    } else {
      finalUsername = generateRandomUsername();
    }

    const hash = await bcrypt.hash(password, 12);
    const verification = createVerificationCode();
    const user = {
      id: uuid(),
      name,
      username: finalUsername,
      email,
      password: hash,
      role: 'user',
      plan: 'free',
      planDuration: null,
      planStartedAt: null,
      planExpiresAt: null,
      xp: 0,
      level: 0,
      streak: 0,
      longestStreak: 0,
      lastWritingDate: null,
      treeStage: 0,
      totalWords: 0,
      totalSessions: 0,
      achievements: [],
      friends: [],
      friendRequests: [],
      sentRequests: [],
      sharedTokens: [],
      lastUsernameChange: null,
      referralCode: generateReferralCode(),
      referredBy: null,
      referralCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planSource: null,
      trialUsed: false,
      planPaymentFailed: false,
      bio: '',
      followers: [],
      following: [],
      banner: null,
      bannerUpdatedAt: null,
      emailVerified: false,
      emailVerificationCodeHash: verification.hash,
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
      emailVerificationAttempts: 0,
      emailVerificationSentAt: new Date().toISOString(),
      acceptedTermsAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    let emailSent = false;
    try {
      emailSent = await sendVerificationEmail(user, verification.code);
    } catch (mailErr) {
      console.error('[email] verification send failed:', mailErr.message);
    }
    if (!emailSent) {
      return res.status(503).json({ error: 'Could not send verification code. Please try again in a few minutes.' });
    }

    // Handle referral — credit the referrer
    const { ref } = req.body;
    if (ref) {
      const referrer = await findOne('users.json', u => u.referralCode === ref);
      if (referrer && referrer.id !== user.id) {
        user.referredBy = ref;
        const newCount = (referrer.referralCount || 0) + 1;
        const updates = { referralCount: newCount };
        // Every 5 referrals → grant 1 month of Pro
        if (newCount % 5 === 0) {
          const now = new Date();
          const currentExpiry = referrer.planExpiresAt ? new Date(referrer.planExpiresAt) : now;
          const base = currentExpiry > now ? currentExpiry : now;
          updates.plan = 'premium';
          updates.planSource = 'referral';
          updates.planStartedAt = updates.planStartedAt || now.toISOString();
          updates.planExpiresAt = new Date(base.getTime() + 30 * 86400000).toISOString();
        }
        await updateOne('users.json', u => u.id === referrer.id, updates);
        try { require('../telegram').notifyReferral(user, referrer, newCount); } catch {}
      }
    }

    await insertOne('users.json', user);
    logAction('user_registered', { name: user.name, email: user.email, referredBy: ref || null }, user.id);
    try { require('../telegram').notifyUserRegistered(user, 'Email'); } catch {}
    res.status(201).json({ requiresVerification: true, email: user.email, emailSent });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').replace(/\D/g, '');
    if (!email || !code) return res.status(400).json({ error: 'Email and verification code are required' });
    if (code.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit verification code.' });

    const user = await findOne('users.json', u => normalizeEmail(u.email) === email);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.emailVerified) {
      const token = generateToken(user);
      const { password: _, ...safeUser } = user;
      return res.json({ token, user: safeUser });
    }
    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ error: 'No active verification code. Request a new code.' });
    }
    if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
    }
    const attempts = Number(user.emailVerificationAttempts || 0);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    if (hash !== user.emailVerificationCodeHash) {
      await updateOne('users.json', u => u.id === user.id, { emailVerificationAttempts: attempts + 1 });
      return res.status(400).json({ error: 'Invalid verification code.' });
    }
    const verifiedUser = await updateOne('users.json', u => u.id === user.id, {
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      emailVerificationCodeHash: null,
      emailVerificationExpiresAt: null,
      emailVerificationAttempts: 0
    });
    const token = generateToken(verifiedUser);
    const { password: _, ...safeUser } = verifiedUser;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await findOne('users.json', u => normalizeEmail(u.email) === email);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.emailVerified) return res.json({ ok: true });
    const lastSent = user.emailVerificationSentAt ? new Date(user.emailVerificationSentAt).getTime() : 0;
    if (Date.now() - lastSent < 60 * 1000) {
      return res.status(429).json({ error: 'Wait a minute before requesting another code.' });
    }
    const verification = createVerificationCode();
    await sendVerificationEmail(user, verification.code);
    await updateOne('users.json', u => u.id === user.id, {
      emailVerificationCodeHash: verification.hash,
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
      emailVerificationAttempts: 0,
      emailVerificationSentAt: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[email] resend verification failed:', err.message);
    res.status(500).json({ error: 'Could not send verification code.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findOne('users.json', u => normalizeEmail(u.email) === email);
    if (!user) {
      return res.status(404).json({ error: 'No account found. Register first.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.emailVerified === false && !user.googleId) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    const acceptedUser = await markTermsAcceptedIfMissing(user);
    const token = generateToken(acceptedUser);
    const { password: _, ...safeUser } = acceptedUser;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, checkSubscriptionExpiry, async (req, res) => {
  let user = await findOne('users.json', u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Real-time streak check — if lastWritingDate is older than yesterday, streak is broken
  if (user.lastWritingDate && user.streak > 0) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (user.lastWritingDate !== today && user.lastWritingDate !== yesterday) {
      // Streak broken — reset streak and tree
      user = await updateOne('users.json', u => u.id === req.user.id, {
        streak: 0,
        treeStage: 0
      });
    }
  }

  // Recalculate treeStage from current streak (new scale)
  const correctTreeStage = streakToTreeStage(user.streak || 0);
  if (user.treeStage !== correctTreeStage) {
    user = await updateOne('users.json', u => u.id === req.user.id, { treeStage: correctTreeStage });
  }

  const { password: _, ...safeUser } = user;
  // If subscription just expired during this request, notify the frontend
  if (req.subscriptionExpired) {
    safeUser.subscriptionJustExpired = true;
  }
  res.json(safeUser);
});

router.patch('/me', authenticate, async (req, res) => {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};

    // Name update (always allowed)
    if (req.body.name !== undefined) {
      if (containsBadWord(req.body.name)) {
        return res.status(400).json({ error: 'Name contains inappropriate content' });
      }
      updates.name = req.body.name;
    }

    // Username update — Free: once per 30 days, Pro: 3 times per month
    if (req.body.username !== undefined) {
      const usernameError = validateUsername(req.body.username);
      if (usernameError) return res.status(400).json({ error: usernameError });

      const isPro = user.plan === 'premium';
      if (isPro) {
        // Pro: 3 changes per calendar month
        const currentMonth = new Date().toISOString().slice(0, 7);
        const changesThisMonth = (user.usernameChangesMonth === currentMonth) ? (user.usernameChangesCount || 0) : 0;
        if (changesThisMonth >= 3) {
          return res.status(400).json({ error: 'Username change limit reached (3/month for Pro)' });
        }
        updates.usernameChangesCount = changesThisMonth + 1;
        updates.usernameChangesMonth = currentMonth;
      } else {
        // Free: once per 30 days
        if (user.lastUsernameChange) {
          const lastChange = new Date(user.lastUsernameChange);
          const now = new Date();
          const diffDays = (now - lastChange) / (1000 * 60 * 60 * 24);
          if (diffDays < 30) {
            const daysLeft = Math.ceil(30 - diffDays);
            return res.status(400).json({ error: `You can change your username again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` });
          }
        }
      }

      // Check uniqueness
      const taken = await findOne('users.json', u => u.id !== req.user.id && u.username && u.username.toLowerCase() === req.body.username.toLowerCase());
      if (taken) return res.status(409).json({ error: 'Username is already taken' });

      updates.username = req.body.username;
      updates.lastUsernameChange = new Date().toISOString();
    }

    // Bio update (max 160 chars)
    if (req.body.bio !== undefined) {
      const bio = String(req.body.bio).replace(/<[^>]*>/g, '').trim().slice(0, 160);
      updates.bio = bio;
    }

    // Clear needsProfile flag
    if (req.body.needsProfile === false) {
      updates.needsProfile = false;
    }

    const updated = await updateOne('users.json', u => u.id === req.user.id, updates);
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.provider === 'google') {
      return res.status(400).json({ error: 'Google accounts cannot change password' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) return res.status(400).json({ error: newPasswordError.replace(/^Password/, 'New password') });

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await updateOne('users.json', u => u.id === req.user.id, { password: hash });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });

    const user = await findOne('users.json', u => normalizeEmail(u.email) === email);
    if (!user || !user.password || user.provider === 'google') {
      return res.json({ ok: true });
    }

    const lastSent = user.passwordResetSentAt ? new Date(user.passwordResetSentAt).getTime() : 0;
    if (Date.now() - lastSent < 60 * 1000) {
      return res.status(429).json({ error: 'Wait a minute before requesting another code.' });
    }

    const reset = createVerificationCode();
    await sendPasswordResetEmail(user, reset.code);
    await updateOne('users.json', u => u.id === user.id, {
      passwordResetCodeHash: reset.hash,
      passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString(),
      passwordResetAttempts: 0,
      passwordResetSentAt: new Date().toISOString()
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[email] password reset send failed:', err.message);
    res.status(503).json({ error: 'Could not send password reset code. Please try again in a few minutes.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').replace(/\D/g, '');
    const { newPassword, confirmPassword } = req.body;

    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });
    if (!code || code.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit reset code.' });
    if (!newPassword || !confirmPassword) return res.status(400).json({ error: 'New password and confirmation are required.' });

    const user = await findOne('users.json', u => normalizeEmail(u.email) === email);
    if (!user || !user.password || user.provider === 'google') {
      return res.status(400).json({ error: 'Password reset is not available for this account.' });
    }
    if (!user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      return res.status(400).json({ error: 'No active reset code. Request a new code.' });
    }
    if (new Date(user.passwordResetExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset code expired. Request a new code.' });
    }
    const attempts = Number(user.passwordResetAttempts || 0);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }

    const hash = crypto.createHash('sha256').update(code).digest('hex');
    if (hash !== user.passwordResetCodeHash) {
      await updateOne('users.json', u => u.id === user.id, { passwordResetAttempts: attempts + 1 });
      return res.status(400).json({ error: 'Invalid reset code.' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError.replace(/^Password/, 'New password') });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: 'New passwords do not match.' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await updateOne('users.json', u => u.id === user.id, {
      password: passwordHash,
      emailVerified: true,
      emailVerifiedAt: user.emailVerified ? user.emailVerifiedAt : new Date().toISOString(),
      passwordResetCodeHash: null,
      passwordResetExpiresAt: null,
      passwordResetAttempts: 0,
      passwordResetSentAt: null
    });
    const token = generateToken(updated);
    const { password: _, ...safeUser } = updated;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('[auth] reset password failed:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== GOOGLE OAUTH =====
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credential is required' });
    }

    // Verify the credential with Google
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = normalizeEmail(payload.email);
    const name = payload.name;

    // Find user by googleId first
    let user = await findOne('users.json', u => u.googleId === googleId);

    // If not found by googleId, try email
    if (!user) {
      user = await findOne('users.json', u => normalizeEmail(u.email) === email);
      if (user && !user.googleId) {
        // Link Google to existing email account
        await updateOne('users.json', u => u.id === user.id, {
          googleId,
          provider: 'google',
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || new Date().toISOString(),
          emailVerificationCodeHash: null,
          emailVerificationExpiresAt: null,
          emailVerificationAttempts: 0,
          acceptedTermsAt: user.acceptedTermsAt || user.createdAt || new Date().toISOString()
        });
        user = await findOne('users.json', u => u.id === user.id);
      }
    }

    // If still not found, create new user
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = {
        id: uuid(),
        name,
        username: generateRandomUsername(),
        email,
        password: null,
        googleId,
        provider: 'google',
        role: 'user',
        plan: 'free',
        planDuration: null,
        planStartedAt: null,
        planExpiresAt: null,
        xp: 0,
        level: 0,
        streak: 0,
        longestStreak: 0,
        lastWritingDate: null,
        treeStage: 0,
        totalWords: 0,
        totalSessions: 0,
        achievements: [],
        friends: [],
        friendRequests: [],
        sentRequests: [],
        sharedTokens: [],
        lastUsernameChange: null,
        referralCode: generateReferralCode(),
        referredBy: null,
        referralCount: 0,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        planSource: null,
        trialUsed: false,
        planPaymentFailed: false,
        needsProfile: true,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        acceptedTermsAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      // Handle referral — credit the referrer
      const { ref } = req.body;
      if (ref) {
        const referrer = await findOne('users.json', u => u.referralCode === ref);
        if (referrer && referrer.id !== user.id) {
          user.referredBy = ref;
          const newCount = (referrer.referralCount || 0) + 1;
          const updates = { referralCount: newCount };
          if (newCount % 5 === 0) {
            const now = new Date();
            const currentExpiry = referrer.planExpiresAt ? new Date(referrer.planExpiresAt) : now;
            const base = currentExpiry > now ? currentExpiry : now;
            updates.plan = 'premium';
            updates.planSource = 'referral';
            updates.planStartedAt = updates.planStartedAt || now.toISOString();
            updates.planExpiresAt = new Date(base.getTime() + 30 * 86400000).toISOString();
          }
          await updateOne('users.json', u => u.id === referrer.id, updates);
          try { require('../telegram').notifyReferral(user, referrer, newCount); } catch {}
        }
      }

      await insertOne('users.json', user);
      logAction('user_registered_google', { name: user.name, email: user.email, referredBy: user.referredBy }, user.id);
      try { require('../telegram').notifyUserRegistered(user, 'Google'); } catch {}
    }

    user = await markTermsAcceptedIfMissing(user);
    const token = generateToken(user);
    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser, isNewUser });
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const avatarsDir = path.join(__dirname, '../data/avatars');
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

    const filepath = path.join(avatarsDir, `${req.user.id}.jpg`);

    await sharp(req.file.buffer)
      .resize(480, 480, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 70 })
      .toFile(filepath);

    const avatarUrl = `/uploads/avatars/${req.user.id}.jpg`;
    const avatarUpdatedAt = Date.now();
    const updated = await updateOne('users.json', u => u.id === req.user.id, { avatar: avatarUrl, avatarUpdatedAt });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

router.delete('/avatar', authenticate, async (req, res) => {
  try {
    const filepath = path.join(__dirname, '../data/avatars', `${req.user.id}.jpg`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    const updated = await updateOne('users.json', u => u.id === req.user.id, { avatar: null, avatarUpdatedAt: null });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// ===== BANNER =====
router.post('/banner', authenticate, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const bannersDir = path.join(__dirname, '../data/banners');
    if (!fs.existsSync(bannersDir)) fs.mkdirSync(bannersDir, { recursive: true });

    // Delete ALL old banner files for this user (handles timestamped filenames)
    const files = fs.readdirSync(bannersDir);
    files.filter(f => f.startsWith(req.user.id)).forEach(f => {
      try { fs.unlinkSync(path.join(bannersDir, f)); } catch (_) {}
    });

    // Use timestamped filename so every upload is a unique URL (defeats all caching layers)
    const ts = Date.now();
    const filename = `${req.user.id}-${ts}.jpg`;
    const filepath = path.join(bannersDir, filename);
    await sharp(req.file.buffer)
      .resize(1200, 300, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 75 })
      .toFile(filepath);

    const bannerUrl = `/uploads/banners/${filename}`;
    const bannerUpdatedAt = ts;
    const updated = await updateOne('users.json', u => u.id === req.user.id, { banner: bannerUrl, bannerUpdatedAt });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    console.error('Banner upload error:', err);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

router.delete('/banner', authenticate, async (req, res) => {
  try {
    // Delete all banner files for this user (handles timestamped filenames)
    const bannersDir = path.join(__dirname, '../data/banners');
    if (fs.existsSync(bannersDir)) {
      fs.readdirSync(bannersDir).filter(f => f.startsWith(req.user.id)).forEach(f => {
        try { fs.unlinkSync(path.join(bannersDir, f)); } catch (_) {}
      });
    }
    const updated = await updateOne('users.json', u => u.id === req.user.id, { banner: null, bannerUpdatedAt: null });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove banner' });
  }
});

// ===== PENDING PRO CONGRATS (admin-awarded) =====
router.post('/ack-pro-congrats', authenticate, async (req, res) => {
  try {
    await updateOne('users.json', u => u.id === req.user.id, { pendingProCongrats: null });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// ===== REFERRAL =====
router.get('/referral', authenticate, async (req, res) => {
  try {
    let user = await findOne('users.json', u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Backfill referral code for existing users who don't have one
    if (!user.referralCode) {
      user = await updateOne('users.json', u => u.id === req.user.id, {
        referralCode: generateReferralCode(),
        referralCount: user.referralCount || 0,
        referredBy: user.referredBy || null
      });
    }

    // Find users who were referred by this user
    const { findMany } = require('../utils/storage');
    const referred = await findMany('users.json', u => u.referredBy === user.referralCode);
    const referredList = referred.map(u => ({
      name: (u.name || '').split(' ')[0],
      joinedAt: u.createdAt
    }));

    res.json({
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referredUsers: referredList,
      nextRewardAt: Math.ceil(((user.referralCount || 0) + 1) / 5) * 5,
      progress: (user.referralCount || 0) % 5
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== ACCOUNT DELETION =====
router.delete('/account', authenticate, async (req, res) => {
  try {
    const user = await findOne('users.json', u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { password: confirmPassword, confirmation } = req.body;

    if (user.googleId) {
      if ((confirmation || '').toUpperCase() !== 'DELETE') {
        return res.status(400).json({ error: 'Please type DELETE to confirm.' });
      }
    } else {
      if (!confirmPassword) {
        return res.status(400).json({ error: 'Password is required.' });
      }
      const match = await bcrypt.compare(confirmPassword, user.password);
      if (!match) {
        return res.status(400).json({ error: 'Incorrect password.' });
      }
    }

    // Cancel Stripe subscription
    if (user.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = require('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (_) {}
    }

    // Delete uploaded files (avatar, banner)
    for (const dir of ['avatars', 'banners']) {
      const dirPath = path.join(__dirname, '../data', dir);
      if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath)
          .filter(f => f.startsWith(user.id))
          .forEach(f => { try { fs.unlinkSync(path.join(dirPath, f)); } catch (_) {} });
      }
    }

    const uid = user.id;

    // Delete all user-owned data
    await pool.query(`DELETE FROM documents WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM stories WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM story_comments WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM story_likes WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM story_comment_likes WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM notifications WHERE data->>'userId' = $1 OR data->>'fromUserId' = $1`, [uid]);
    await pool.query(`DELETE FROM activities WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM duels WHERE data->>'challengerId' = $1 OR data->>'opponentId' = $1`, [uid]);
    await pool.query(`DELETE FROM duel_queue WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM support WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM announcement_views WHERE data->>'userId' = $1`, [uid]);
    await pool.query(`DELETE FROM announcement_likes WHERE data->>'userId' = $1`, [uid]);

    // Delete the user record
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);

    logAction('account_deleted', { email: user.email }, uid);

    res.json({ ok: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

module.exports = router;
