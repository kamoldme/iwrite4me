const { v4: uuid } = require('uuid');

function makeSupportMessage(author, body, extra = {}) {
  return {
    id: uuid(),
    author,
    body: String(body || '').trim(),
    createdAt: new Date().toISOString(),
    ...extra
  };
}

function getSupportMessages(ticket) {
  if (Array.isArray(ticket.messages) && ticket.messages.length) return ticket.messages;

  const messages = [];
  if (ticket.message) {
    messages.push({
      id: `${ticket.id || 'ticket'}-initial`,
      author: 'user',
      body: ticket.message,
      image: ticket.image || null,
      createdAt: ticket.createdAt || ticket.updatedAt || new Date().toISOString()
    });
  }
  if (ticket.adminReply) {
    messages.push({
      id: `${ticket.id || 'ticket'}-admin-reply`,
      author: 'admin',
      body: ticket.adminReply,
      createdAt: ticket.repliedAt || ticket.updatedAt || new Date().toISOString()
    });
  }
  return messages;
}

function appendSupportMessage(ticket, message) {
  return [...getSupportMessages(ticket), message];
}

module.exports = {
  appendSupportMessage,
  getSupportMessages,
  makeSupportMessage
};
