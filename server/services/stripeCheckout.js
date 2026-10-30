// Only grant access for a completed Checkout with a currently usable subscription.
function checkoutGrant(session, subscription, now = Date.now()) {
  if (!session || session.status !== 'complete' || session.mode !== 'subscription') return null;
  if (!subscription || typeof subscription !== 'object' || !subscription.id) return null;
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) return null;
  if (subscription.status === 'trialing') {
    if (!Number.isFinite(subscription.trial_end) || subscription.trial_end * 1000 <= now) return null;
    return { isTrial: true };
  }
  if (subscription.status === 'active') return { isTrial: false };
  return null;
}
module.exports = { checkoutGrant };
