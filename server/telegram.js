// Telegram Bot — Admin notifications for iWrite
// Sends real-time updates about registrations, subscriptions, moderation, etc.
// Requires env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID

const TelegramBot = require('node-telegram-bot-api');
const { appendSupportMessage, makeSupportMessage } = require('./utils/supportThread');

let bot = null;
let chatId = null;
let adminChatIds = new Set();
let infoChatIds = new Set();
let _activeUsers = null; // passed from index.js to avoid circular require
const APP_URL = (process.env.APP_URL || 'https://iwrite4.me').replace(/\/$/, '');

function parseChatIds(value) {
  return String(value || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function allNotifyChatIds() {
  return [...new Set([...adminChatIds, ...infoChatIds].filter(Boolean))];
}

function canReceive(id) {
  return adminChatIds.has(String(id)) || infoChatIds.has(String(id));
}

function canAct(id) {
  return adminChatIds.has(String(id));
}

function init(activeUsersMap) {
  _activeUsers = activeUsersMap || null;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Telegram] No TELEGRAM_BOT_TOKEN set — bot disabled');
    return;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || null;
    adminChatIds = new Set(parseChatIds(process.env.TELEGRAM_ADMIN_CHAT_IDS || chatId));
    infoChatIds = new Set(parseChatIds(process.env.TELEGRAM_INFO_CHAT_IDS));
    if (chatId) adminChatIds.add(chatId);

    // /start command — requires access code to unlock
    const accessCode = process.env.TELEGRAM_ACCESS_CODE || null;
    const authorizedChats = new Set();
    for (const id of allNotifyChatIds()) authorizedChats.add(id);

    bot.onText(/\/start(.*)/, (msg, match) => {
      const id = msg.chat.id.toString();
      const code = (match[1] || '').trim();

      // Already authorized
      if (authorizedChats.has(id)) {
        const commands = canAct(id) ? '/status, /stats, reply to support tickets' : '/status';
        bot.sendMessage(id, `✅ You're authorized.\n\nChat ID: <code>${id}</code>\nRole: <b>${canAct(id) ? 'admin' : 'info viewer'}</b>\nCommands: ${commands}`, { parse_mode: 'HTML' });
        return;
      }

      // No access code set — reject everyone except pre-set admin
      if (!accessCode) {
        bot.sendMessage(id, '🔒 This bot is private.');
        return;
      }

      // Check code
      if (!code) {
        bot.sendMessage(id, '🔒 This bot requires an access code.\n\nSend: <code>/start YOUR_CODE</code>', { parse_mode: 'HTML' });
        return;
      }

      if (code === accessCode) {
        authorizedChats.add(id);
        if (!chatId) {
          chatId = id;
          adminChatIds.add(id);
          console.log(`[Telegram] Admin chat ID set to ${chatId} via access code`);
        }
        bot.sendMessage(id, `✅ Access granted!\n\nChat ID: <code>${id}</code>\nCommands: /status, /stats`, { parse_mode: 'HTML' });
        console.log(`[Telegram] Chat ${id} authorized via access code`);
      } else {
        bot.sendMessage(id, '❌ Wrong access code.');
        console.log(`[Telegram] Failed auth attempt from chat ${id}`);
      }
    });

    // /status command — quick health check
    bot.onText(/\/status/, (msg) => {
      const id = msg.chat.id.toString();
      if (!canReceive(id)) return;
      bot.sendMessage(id, `✅ Bot is running\n📡 Chat ID: <code>${id}</code>\nRole: <b>${canAct(id) ? 'admin' : 'info viewer'}</b>\n⏰ ${new Date().toISOString()}`, { parse_mode: 'HTML' });
    });

    // Handle inline button callbacks (moderation approve/reject/view)
    bot.on('callback_query', async (query) => {
      if (!query.data) return;
      // Only authorized users can press buttons
      if (!canAct(query.message.chat.id.toString())) {
        await bot.answerCallbackQuery(query.id, { text: '🔒 Not authorized' });
        return;
      }
      const [action, entityId] = query.data.split(':');
      if (!entityId || action === 'noop') return;

      try {
        if (action === 'stats' && entityId === 'refresh') {
          await bot.answerCallbackQuery(query.id, { text: 'Refreshing stats...' });
          await sendStatsCard();
          return;
        }

        const { findOne, updateOne } = require('./utils/storage');

        // VIEW full story content
        if (action === 'view') {
          const story = await findOne('stories.json', s => s.id === entityId);
          if (!story) {
            await bot.answerCallbackQuery(query.id, { text: 'Story not found' });
            return;
          }
          const fullText = (story.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
            .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
          // Telegram max message is 4096 chars
          const chunks = [];
          for (let i = 0; i < fullText.length; i += 4000) {
            chunks.push(fullText.slice(i, i + 4000));
          }
          await bot.answerCallbackQuery(query.id, { text: 'Sending full story...' });
          for (const chunk of chunks) {
            await bot.sendMessage(query.message.chat.id, chunk, {
              reply_to_message_id: query.message.message_id
            });
          }
          return;
        }

        // Approve/Reject story
        const story = await findOne('stories.json', s => s.id === entityId);
        if (!story) {
          await bot.answerCallbackQuery(query.id, { text: 'Story not found' });
          return;
        }

        if (story.status !== 'pending_review') {
          await bot.answerCallbackQuery(query.id, { text: `Already ${story.status}` });
          return;
        }

        if (action === 'approve') {
          const now = new Date().toISOString();
          await updateOne('stories.json', s => s.id === entityId, {
            status: 'published',
            publishedAt: story.publishedAt || now,
            reviewedAt: now,
            moderatedBy: 'telegram'
          });
          await bot.answerCallbackQuery(query.id, { text: '✅ Published!' });
          await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ APPROVED', callback_data: 'noop:0' }]] }, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          });
        } else if (action === 'reject') {
          await updateOne('stories.json', s => s.id === entityId, {
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            moderatedBy: 'telegram'
          });
          await bot.answerCallbackQuery(query.id, { text: '❌ Rejected' });
          await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ REJECTED', callback_data: 'noop:0' }]] }, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          });
        }
      } catch (err) {
        console.error('[Telegram] Callback error:', err.message);
        await bot.answerCallbackQuery(query.id, { text: 'Error processing' }).catch(() => {});
      }
    });

    // Handle replies to support ticket messages — auto-reply on the platform
    bot.on('message', async (msg) => {
      const senderChatId = msg.chat.id.toString();
      if (!msg.reply_to_message || !msg.text || !canReceive(senderChatId)) return;
      if (!canAct(senderChatId)) {
        if ((msg.reply_to_message.text || '').includes('ticket:')) {
          bot.sendMessage(senderChatId, '🔒 Info viewers can see support tickets but cannot reply to users.', { reply_to_message_id: msg.message_id });
        }
        return;
      }
      // Check if the original message is a support ticket
      const origText = msg.reply_to_message.text || '';
      if (!origText.includes('New Support Ticket') && !origText.includes('🎫')) return;

      // Extract ticket info from the original message by matching the ticket ID stored in the message
      const ticketIdMatch = origText.match(/ticket:([a-f0-9-]+)/i);
      if (!ticketIdMatch) {
        // Fallback: find most recent open ticket from the mentioned user
        const usernameMatch = origText.match(/@(\S+)/);
        if (!usernameMatch) return;
        const { findOne, findMany, updateOne } = require('./utils/storage');
        const user = await findOne('users.json', u => u.username === usernameMatch[1]);
        if (!user) {
          bot.sendMessage(senderChatId, '⚠️ Could not find user', { reply_to_message_id: msg.message_id });
          return;
        }
        const tickets = await findMany('support.json', t => t.userId === user.id && t.status === 'open');
        if (!tickets.length) {
          bot.sendMessage(senderChatId, '⚠️ No open tickets from this user', { reply_to_message_id: msg.message_id });
          return;
        }
        // Match by subject in original message
        const subjectMatch = origText.match(/Subject:\s*(.+)/);
        let ticket = tickets[0]; // default to most recent
        if (subjectMatch) {
          const found = tickets.find(t => t.subject === subjectMatch[1].trim());
          if (found) ticket = found;
        }
        const replyMessage = makeSupportMessage('admin', msg.text, { via: 'telegram', telegramChatId: senderChatId });
        await updateOne('support.json', t => t.id === ticket.id, {
          messages: appendSupportMessage(ticket, replyMessage),
          adminReply: msg.text,
          repliedAt: new Date().toISOString(),
          status: 'replied',
          updatedAt: new Date().toISOString()
        });
        bot.sendMessage(senderChatId, `✅ Reply sent to @${esc(user.username)} on ticket "${esc(ticket.subject)}"`, {
          reply_to_message_id: msg.message_id,
          parse_mode: 'HTML'
        });
        return;
      }

      // Direct ticket ID match
      const { findOne, updateOne } = require('./utils/storage');
      const ticket = await findOne('support.json', t => t.id === ticketIdMatch[1]);
      if (!ticket) {
        bot.sendMessage(senderChatId, '⚠️ Ticket not found', { reply_to_message_id: msg.message_id });
        return;
      }
      const replyMessage = makeSupportMessage('admin', msg.text, { via: 'telegram', telegramChatId: senderChatId });
      await updateOne('support.json', t => t.id === ticket.id, {
        messages: appendSupportMessage(ticket, replyMessage),
        adminReply: msg.text,
        repliedAt: new Date().toISOString(),
        status: 'replied',
        updatedAt: new Date().toISOString()
      });
      const user = await findOne('users.json', u => u.id === ticket.userId);
      bot.sendMessage(senderChatId, `✅ Reply sent to @${esc(user ? user.username : '?')} on ticket "${esc(ticket.subject)}"`, {
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML'
      });
    });

    // Periodic stats card once a day
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setTimeout(() => sendStatsCard(), 10000); // first one 10s after boot
    setInterval(() => sendStatsCard(), TWENTY_FOUR_HOURS);

    // /stats command — manual stats card
    bot.onText(/\/stats/, (msg) => {
      if (!canAct(msg.chat.id.toString())) return;
      sendStatsCard();
    });

    console.log(`[Telegram] Bot started${chatId ? ` (admin: ${chatId})` : ' (no admin chat ID — send /start to the bot)'}`);
  } catch (err) {
    console.error('[Telegram] Failed to start bot:', err.message);
  }
}

async function sendStatsCard() {
  if (!bot || allNotifyChatIds().length === 0) return;
  try {
    const { findMany } = require('./utils/storage');
    const users = await findMany('users.json');
    const docs = await findMany('documents.json');
    const logs = await findMany('logs.json');

    const totalUsers = users.filter(u => u.role !== 'admin').length;
    const totalDocs = docs.length;
    const activeDocs = docs.filter(d => !d.deleted && d.status !== 'abandoned').length;
    const lostDocs = docs.filter(d => d.deletedBySystem);
    const lostWords = lostDocs.reduce((sum, d) => sum + (Number(d.wordCount) || 0), 0);
    const totalWords = users.reduce((sum, u) => sum + (u.totalWords || 0), 0);

    // Anti-gaming: cap credited time per session by words written (min 3 WPM)
    const MIN_WPM = 3;
    const effectiveMinutes = (d) => {
      const actualMin = (Number(d.duration) || 0) / 60;
      const wordCap = (d.wordCount || 0) / MIN_WPM;
      return Math.min(actualMin, wordCap);
    };
    const totalMinutes = Math.round(docs.reduce((sum, d) => sum + effectiveMinutes(d), 0));
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMins = totalMinutes % 60;

    // Get active users count (passed in during init to avoid circular require)
    let onlineNow = _activeUsers ? _activeUsers.size : 0;
    // Writing Now: users with writingAt within last 60s
    let writingNow = 0;
    let onTabNow = 0;
    if (_activeUsers) {
      const writingCutoff = Date.now() - 60000;
      for (const [, data] of _activeUsers) {
        if (data.writingAt && data.writingAt > writingCutoff) writingNow++;
        if (data.focusedAt && data.focusedAt > writingCutoff) onTabNow++;
      }
    }

    const dailyRows = [];
    const nowMs = Date.now();
    for (let i = 2; i >= 0; i--) {
      const dayMs = nowMs - (i * 86400000);
      const dayKey = uzDayKey(dayMs);
      const d = new Date(dayMs);
      const label = d.toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent', weekday: 'short', month: 'short', day: 'numeric' });

      const dayDocs = docs.filter(doc => {
        const t = new Date(doc.updatedAt || doc.createdAt || 0).getTime();
        return Number.isFinite(t) && uzDayKey(t) === dayKey;
      });
      const dayWords = dayDocs.reduce((sum, doc) => sum + (Number(doc.wordCount) || 0), 0);
      const dayMinutes = Math.round(dayDocs.reduce((sum, doc) => sum + effectiveMinutes(doc), 0));
      const dayUsers = new Set();

      dayDocs.forEach(doc => { if (doc.userId) dayUsers.add(doc.userId); });
      logs.forEach(log => {
        if (!log.userId) return;
        const t = new Date(log.timestamp).getTime();
        if (Number.isFinite(t) && uzDayKey(t) === dayKey) dayUsers.add(log.userId);
      });

      dailyRows.push(`${esc(label)}  •  <b>${compact(dayWords)}</b> words  •  <b>${formatMinutes(dayMinutes)}</b>  •  <b>${dayUsers.size}</b> users`);
    }

    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent', dateStyle: 'medium', timeStyle: 'short' });

    send(
      `<b>iWrite4.me Command Center</b>\n` +
      `<i>${esc(now)} · Asia/Tashkent</i>\n\n` +
      `<blockquote>` +
      `Online: <b>${onlineNow}</b>\n` +
      `On Tab: <b>${onTabNow}</b>\n` +
      `Writing now: <b>${writingNow}</b>\n` +
      `Users: <b>${totalUsers.toLocaleString()}</b>\n` +
      `Documents: <b>${totalDocs.toLocaleString()}</b> · active <b>${activeDocs.toLocaleString()}</b>\n` +
      `Total words: <b>${totalWords.toLocaleString()}</b>\n` +
      `Lost words: <b>${lostWords.toLocaleString()}</b> (${lostDocs.length.toLocaleString()} docs)\n` +
      `Active hours: <b>${totalHours}h ${remainingMins}m</b>` +
      `</blockquote>\n\n` +
      `<b>Last 3 days</b>\n` +
      `<i>words · active time · authenticated users</i>\n` +
      dailyRows.join('\n'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Users', url: `${APP_URL}/admin#users` },
              { text: 'Documents', url: `${APP_URL}/admin#documents` }
            ],
            [
              { text: 'Activity Logs', url: `${APP_URL}/admin#logs` },
              { text: 'Refresh', callback_data: 'stats:refresh' }
            ]
          ]
        }
      }
    );
  } catch (err) {
    console.error('[Telegram] Stats card error:', err.message);
  }
}

// ===== NOTIFICATION HELPERS =====

function send(text, opts = {}) {
  if (!bot) return;
  for (const id of allNotifyChatIds()) {
    bot.sendMessage(id, text, { parse_mode: 'HTML', disable_web_page_preview: true, ...opts }).catch(err => {
      console.error(`[Telegram] Send error (${id}):`, err.message);
    });
  }
}

function sendAdminOnly(text, opts = {}) {
  if (!bot) return;
  for (const id of adminChatIds) {
    bot.sendMessage(id, text, { parse_mode: 'HTML', disable_web_page_preview: true, ...opts }).catch(err => {
      console.error(`[Telegram] Admin send error (${id}):`, err.message);
    });
  }
}

function esc(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function compact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatMinutes(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function uzDayKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// ===== PUBLIC NOTIFICATION FUNCTIONS =====

function notifyUserRegistered(user, method) {
  const ref = user.referredBy ? `\n🔗 Referred by: ${esc(user.referredBy)}` : '';
  send(
    `👤 <b>New User Registered</b>\n\n` +
    `Name: ${esc(user.name)}\n` +
    `Email: ${esc(user.email)}\n` +
    `Username: @${esc(user.username)}\n` +
    `Method: ${method}${ref}\n` +
    `🕐 ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })}`
  );
}

function notifySessionCompleted(user, doc, stats) {
  const mode = doc.mode === 'dangerous' ? '🔴 Dangerous' : '🟢 Normal';
  const mins = Math.round((stats.duration || 0) / 60);
  send(
    `✅ <b>Session Completed</b>\n\n` +
    `Writer: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Title: ${esc(doc.title || 'Untitled')}\n` +
    `Mode: ${mode}\n` +
    `Duration: ${mins} min\n` +
    `Words: ${stats.wordCount || 0}\n` +
    `XP: +${stats.xpEarned || 0}`
  );
}

// Same shape as notifySessionCompleted but framed as a duel — used when
// the completed document is linked to a duel record. Adds opponent name +
// result (won/lost/forfeit/draw) so the admin can read the outcome at a
// glance instead of confusing it with a regular solo session.
function notifyDuelSessionCompleted(user, doc, stats, duel) {
  const isChallenger = duel.challengerId === user.id;
  const opponentName = isChallenger ? duel.opponentName : duel.challengerName;
  const fromMatchmaking = !!duel.fromMatchmaking;
  let result;
  if (duel.status !== 'completed') {
    result = '⏳ In progress';
  } else if (duel.forfeitedBy === user.id) {
    result = '😢 Forfeit (lost)';
  } else if (duel.winnerId === user.id) {
    result = '🏆 Won';
  } else if (duel.winnerId) {
    result = '😢 Lost';
  } else {
    result = '🤝 Draw';
  }
  const mins = Math.round((stats.duration || 0) / 60);
  send(
    `⚔️ <b>Duel Completed</b>\n\n` +
    `Writer: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Vs: ${esc(opponentName || 'Opponent')}${fromMatchmaking ? ' (matchmaking)' : ''}\n` +
    `Result: ${result}\n` +
    `Duration: ${mins} min\n` +
    `Words: ${stats.wordCount || 0}\n` +
    `XP: +${stats.xpEarned || 0}`
  );
}

function notifySessionFailed(user, doc, stats) {
  const mode = doc.mode === 'dangerous' ? '🔴 Dangerous' : '🟢 Normal';
  const reasonMap = { typing_stopped: '⌨️ Stopped typing', tab_left: '🚪 Left the tab' };
  const reasonText = reasonMap[stats.reason] || stats.reason || 'Unknown';
  send(
    `💀 <b>Session Failed</b>\n\n` +
    `Writer: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Title: ${esc(doc.title || 'Untitled')}\n` +
    `Mode: ${mode}\n` +
    `Words: ${doc.wordCount || 0}\n` +
    `Reason: ${reasonText}`
  );
}

function notifySupportTicket(user, ticket) {
  const typeEmoji = { bug: '🐛', feedback: '💬', suggestion: '💡' };
  const text =
    `🎫 <b>New Support Ticket</b>\n\n` +
    `From: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Type: ${typeEmoji[ticket.type] || '📩'} ${esc(ticket.type)}\n` +
    `Subject: ${esc(ticket.subject)}\n` +
    `Message: ${esc((ticket.message || '').slice(0, 300))}${ticket.message && ticket.message.length > 300 ? '...' : ''}` +
    `${ticket.image ? '\n📎 Image attached ↑' : ''}\n\n` +
    `<i>Reply to this message to respond to the user</i>\n` +
    `<code>ticket:${ticket.id}</code>`;

  if (ticket.image && ticket.image.base64 && bot && chatId) {
    const buf = Buffer.from(ticket.image.base64, 'base64');
    Promise.all(allNotifyChatIds().map(id =>
      bot.sendPhoto(id, buf, { caption: `🎫 Ticket: ${esc(ticket.subject)}`, parse_mode: 'HTML' })
    ))
      .then(() => send(text))
      .catch(err => { console.error('[Telegram] sendPhoto error:', err.message); send(text); });
    return;
  }
  send(text);
}

function notifySupportTicketMessage(user, ticket, message) {
  const text =
    `🎫 <b>Support Ticket Update</b>\n\n` +
    `From: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Subject: ${esc(ticket.subject)}\n` +
    `Message: ${esc((message.body || '').slice(0, 500))}${message.body && message.body.length > 500 ? '...' : ''}` +
    `${message.image ? '\n📎 Image attached ↑' : ''}\n\n` +
    `<i>Reply to this message to respond to the user again</i>\n` +
    `<code>ticket:${ticket.id}</code>`;

  if (message.image && message.image.base64 && bot) {
    const buf = Buffer.from(message.image.base64, 'base64');
    Promise.all(allNotifyChatIds().map(id =>
      bot.sendPhoto(id, buf, { caption: `🎫 Ticket update: ${esc(ticket.subject)}`, parse_mode: 'HTML' })
    ))
      .then(() => send(text))
      .catch(err => { console.error('[Telegram] update sendPhoto error:', err.message); send(text); });
    return;
  }
  send(text);
}

function notifyStripeSubscription(user, details) {
  const trial = details.isTrial ? ' (Trial)' : '';
  send(
    `💳 <b>New Subscription</b>${trial}\n\n` +
    `User: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Email: ${esc(user.email)}\n` +
    `Duration: ${esc(details.duration)}\n` +
    `Expires: ${esc(details.expiresAt || 'N/A')}`
  );
}

function notifyStripeRenewal(user, details) {
  send(
    `🔄 <b>Subscription Renewed</b>\n\n` +
    `User: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Duration: ${esc(details.duration)}\n` +
    `New expiry: ${esc(details.expiresAt || 'N/A')}`
  );
}

function notifyStripeFailed(user) {
  send(
    `⚠️ <b>Payment Failed</b>\n\n` +
    `User: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Email: ${esc(user.email)}`
  );
}

function notifyStripeTrialEnding(user) {
  send(
    `⏰ <b>Trial Ending Soon (3d)</b>\n\n` +
    `User: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Email: ${esc(user.email)}`
  );
}

function notifyStripeCancelled(user) {
  send(
    `🚫 <b>Subscription Cancelled</b>\n\n` +
    `User: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Email: ${esc(user.email)}`
  );
}

function notifyStripeWillCancel(user, details = {}) {
  const ends = details.cancelAt ? new Date(details.cancelAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'period end';
  send(
    `⚠️ <b>Subscription Cancellation Scheduled</b>\n\n` +
    `User: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Email: ${esc(user.email)}\n` +
    `Will end: ${esc(ends)}`
  );
}

function notifyAnnouncementPublished(a) {
  if (!a) return;
  const audience = a.audience === 'pro' ? 'Pro users' : 'Everyone';
  send(
    `📢 <b>Announcement Published</b>\n\n` +
    `Title: ${esc(a.title)}\n` +
    `Audience: ${esc(audience)}\n` +
    `Category: ${esc(a.category || 'update')}` +
    (a.pinned ? '\n📌 Pinned' : '') +
    `\n\n${esc((a.body || '').slice(0, 200))}${(a.body || '').length > 200 ? '…' : ''}`
  );
}

function notifyReferral(newUser, referrer, referralCount) {
  const bonus = referralCount % 5 === 0 ? `\n🎉 <b>${esc(referrer.name)} earned FREE PRO</b> (${referralCount} referrals!)` : '';
  send(
    `🔗 <b>New Referral</b>\n\n` +
    `New user: ${esc(newUser.name)} (@${esc(newUser.username)})\n` +
    `Referred by: ${esc(referrer.name)} (@${esc(referrer.username)})\n` +
    `Total referrals: ${referralCount}${bonus}`
  );
}

function notifyStorySubmitted(user, story) {
  const preview = (story.content || '').replace(/<[^>]*>/g, '').slice(0, 200);
  send(
    `📖 <b>Story Submitted for Review</b>\n\n` +
    `Author: ${esc(user.name)} (@${esc(user.username)})\n` +
    `Title: ${esc(story.title)}\n` +
    `Words: ${story.wordCount || '?'}\n` +
    `Preview: ${esc(preview)}${preview.length >= 200 ? '...' : ''}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📖 VIEW FULL', callback_data: `view:${story.id}` }
          ],
          [
            { text: '✅ Approve', callback_data: `approve:${story.id}` },
            { text: '❌ Reject', callback_data: `reject:${story.id}` }
          ]
        ]
      }
    }
  );
}

module.exports = {
  init,
  notifyUserRegistered,
  notifySessionCompleted,
  notifyDuelSessionCompleted,
  notifySessionFailed,
  notifySupportTicket,
  notifySupportTicketMessage,
  notifyStripeSubscription,
  notifyStripeRenewal,
  notifyStripeFailed,
  notifyStripeTrialEnding,
  notifyStripeCancelled,
  notifyStripeWillCancel,
  notifyAnnouncementPublished,
  notifyReferral,
  notifyStorySubmitted
};
