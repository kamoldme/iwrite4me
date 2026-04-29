const express = require('express');
const { v4: uuid } = require('uuid');
const { findOne, findMany, insertOne, updateOne, deleteOne } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Helper: complete a duel with a forfeit
async function completeDuelWithForfeit(duelId, forfeiterId) {
  const duel = await findOne('duels.json', d => d.id === duelId);
  if (!duel || duel.status !== 'active') return;
  const winnerId = duel.challengerId === forfeiterId ? duel.opponentId : duel.challengerId;
  await updateOne('duels.json', d => d.id === duelId, {
    status: 'completed',
    forfeitedBy: forfeiterId,
    winnerId,
    endAt: new Date().toISOString()
  });
  try {
    const winner = await findOne('users.json', u => u.id === winnerId);
    const loser = await findOne('users.json', u => u.id === forfeiterId);
    if (winner && loser) {
      await insertOne('activities.json', {
        id: uuid(),
        userId: winnerId,
        type: 'duel_won',
        data: { name: winner.name, opponentName: loser.name, forfeit: true },
        createdAt: new Date().toISOString()
      });
    }
  } catch {}
}

// Helper: complete a duel when its time runs out.
// Endurance scoring: forfeiter loses; if no one forfeited (both stayed full
// duration), it's a DRAW (winnerId=null). Word counts are no longer compared
// because they were game-able via copy-paste. Word counts still recorded as a
// stat, just not used for win determination.
async function completeDuelByTime(duelId) {
  const duel = await findOne('duels.json', d => d.id === duelId);
  if (!duel || duel.status !== 'active') return;
  let winnerId = null;
  if (duel.forfeitedBy) {
    winnerId = duel.forfeitedBy === duel.challengerId ? duel.opponentId : duel.challengerId;
  }
  await updateOne('duels.json', d => d.id === duelId, {
    status: 'completed',
    winnerId,
    endAt: duel.endAt || new Date().toISOString()
  });
  if (winnerId) {
    try {
      const winner = await findOne('users.json', u => u.id === winnerId);
      const loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
      const loser = await findOne('users.json', u => u.id === loserId);
      if (winner && loser) {
        await insertOne('activities.json', {
          id: uuid(),
          userId: winnerId,
          type: 'duel_won',
          data: { name: winner.name, opponentName: loser.name },
          createdAt: new Date().toISOString()
        });
      }
    } catch {}
  }
}

// Stale threshold: if a user hasn't polled in this many ms, they're gone
const STALE_POLL_MS = 15000; // 15 seconds (polls happen every 3s)

// Helper: auto-complete stale duels — called on key endpoints
async function cleanupStaleDuels() {
  const now = Date.now();

  // 1. Active duels past endAt → complete by word count
  const expiredDuels = await findMany('duels.json', d =>
    d.status === 'active' && d.endAt && new Date(d.endAt).getTime() <= now
  );
  for (const duel of expiredDuels) {
    await completeDuelByTime(duel.id);
  }

  // 2. Active duels where user(s) stopped polling
  const activeDuels = await findMany('duels.json', d => d.status === 'active');
  for (const duel of activeDuels) {
    const challengerGone = duel.challengerLastSeen && (now - new Date(duel.challengerLastSeen).getTime()) > STALE_POLL_MS;
    const opponentGone = duel.opponentLastSeen && (now - new Date(duel.opponentLastSeen).getTime()) > STALE_POLL_MS;

    if (duel.forfeitedBy) {
      // Someone already forfeited. Check if the remaining player also stopped polling.
      const remainingIsChallenger = duel.forfeitedBy !== duel.challengerId;
      const remainingGone = remainingIsChallenger ? challengerGone : opponentGone;
      if (remainingGone) {
        // Both gone now — complete the duel. Forfeiter loses.
        await completeDuelWithForfeit(duel.id, duel.forfeitedBy);
      }
      // else: remaining player still active, duel continues
    } else if (challengerGone && opponentGone) {
      // Both gone, no one forfeited yet — whoever stopped polling first loses
      const challengerTime = new Date(duel.challengerLastSeen).getTime();
      const opponentTime = new Date(duel.opponentLastSeen).getTime();
      if (challengerTime < opponentTime) {
        await completeDuelWithForfeit(duel.id, duel.challengerId);
      } else if (opponentTime < challengerTime) {
        await completeDuelWithForfeit(duel.id, duel.opponentId);
      } else {
        await completeDuelByTime(duel.id);
      }
    } else if (challengerGone) {
      // Only challenger gone — mark as forfeited but keep duel active
      const winnerId = duel.opponentId;
      await updateOne('duels.json', d => d.id === duel.id, { forfeitedBy: duel.challengerId, winnerId });
    } else if (opponentGone) {
      // Only opponent gone — mark as forfeited but keep duel active
      const winnerId = duel.challengerId;
      await updateOne('duels.json', d => d.id === duel.id, { forfeitedBy: duel.opponentId, winnerId });
    }
  }

  // 3. Stale countdown duels (startAt passed >2min ago)
  const staleCountdowns = await findMany('duels.json', d =>
    d.status === 'countdown' && d.startAt && (now - new Date(d.startAt).getTime()) > 120000
  );
  for (const duel of staleCountdowns) {
    await updateOne('duels.json', d => d.id === duel.id, {
      status: 'expired',
      endAt: new Date().toISOString()
    });
  }

  // 4. Expire pending duels older than 5 minutes
  const stalePending = await findMany('duels.json', d =>
    d.status === 'pending' && (now - new Date(d.createdAt).getTime()) > 5 * 60 * 1000
  );
  for (const duel of stalePending) {
    await updateOne('duels.json', d => d.id === duel.id, { status: 'expired' });
  }

  // 5. Evict stale matchmaking queue entries (haven't heartbeat-ed in 30s)
  const QUEUE_STALE_MS = 30000;
  const staleQueue = await findMany('duel-queue.json', q =>
    q.lastSeen && (now - new Date(q.lastSeen).getTime()) > QUEUE_STALE_MS
  );
  for (const entry of staleQueue) {
    await deleteOne('duel-queue.json', q => q.id === entry.id);
  }
}

// ───────── MATCHMAKING ─────────
// Duration is stored as a NUMBER of minutes (matches the existing challenge
// flow which uses duration * 60 * 1000 elsewhere). Standard buckets are
// 10/30/45 min for everyone; PRO users can also pick custom 5–180 min.
const STANDARD_DURATIONS_MIN = [10, 30, 45];
const PRO_CUSTOM_MIN = 5;
const PRO_CUSTOM_MAX = 180;

// Validates a requested duration against the user's plan + the live queue.
// Free users can pick STANDARD durations OR join an existing custom lobby
// that a PRO user already created. Returns the integer duration or null.
async function validateDuration(durationRaw, isPro, currentUserId) {
  const d = parseInt(durationRaw, 10);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (STANDARD_DURATIONS_MIN.includes(d)) return d;
  if (isPro && d >= PRO_CUSTOM_MIN && d <= PRO_CUSTOM_MAX) return d;
  // Free user picking a custom duration: only allow if a PRO user is already
  // waiting at that exact duration. Joining an existing PRO-created lobby
  // doesn't require the joiner to be PRO.
  if (!isPro && d >= PRO_CUSTOM_MIN && d <= PRO_CUSTOM_MAX) {
    const existing = await findOne('duel-queue.json', q =>
      Number(q.duration) === d && q.userId !== currentUserId
    );
    if (existing) return d;
  }
  return null;
}

// Tries to match the given user against the oldest waiting opponent in their
// duration bucket. If a match is found: creates a duel and removes both queue
// entries. Returns { matched: true, duelId } or { matched: false }.
async function tryMatch(userId, duration) {
  const opponents = await findMany('duel-queue.json', q =>
    Number(q.duration) === Number(duration) && q.userId !== userId
  );
  if (!opponents.length) return { matched: false };
  opponents.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  const opp = opponents[0];

  // Create duel — start countdown immediately. Both already opted in.
  // 6-second countdown then transitions to active. Match the existing
  // duel schema: numeric duration (minutes), startAt (when countdown ends),
  // endAt set later when active starts.
  const duelId = uuid();
  const now = new Date();
  const startAt = new Date(now.getTime() + 6000); // 6s countdown
  await insertOne('duels.json', {
    id: duelId,
    challengerId: opp.userId, // earlier in queue gets challenger slot
    opponentId: userId,
    duration: Number(duration),
    status: 'countdown',
    fromMatchmaking: true,
    challengerWords: 0,
    opponentWords: 0,
    challengerLastSeen: now.toISOString(),
    opponentLastSeen: now.toISOString(),
    createdAt: now.toISOString(),
    countdownStartAt: now.toISOString(),
    startAt: startAt.toISOString(),
    endAt: null
  });

  // Remove both from queue
  await deleteOne('duel-queue.json', q => q.id === opp.id);
  const myEntry = await findOne('duel-queue.json', q => q.userId === userId);
  if (myEntry) await deleteOne('duel-queue.json', q => q.id === myEntry.id);

  return { matched: true, duelId };
}

// POST /queue/join — join the matchmaking queue, attempt immediate match
router.post('/queue/join', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const me = await findOne('users.json', u => u.id === req.user.id);
    const isPro = me?.plan === 'premium';
    const duration = await validateDuration(req.body?.duration, isPro, req.user.id);
    if (!duration) {
      return res.status(400).json({
        error: isPro
          ? `Invalid duration. Use ${STANDARD_DURATIONS_MIN.join('/')} min, or a custom ${PRO_CUSTOM_MIN}–${PRO_CUSTOM_MAX} min.`
          : `Invalid duration. Use ${STANDARD_DURATIONS_MIN.join('/')} min, or join an existing custom lobby. (Creating a custom duration requires PRO.)`
      });
    }

    // Already in queue? Update duration if different
    const existing = await findOne('duel-queue.json', q => q.userId === req.user.id);
    if (existing) {
      if (Number(existing.duration) !== duration) {
        await updateOne('duel-queue.json', q => q.id === existing.id, {
          duration, lastSeen: new Date().toISOString()
        });
      }
    }

    // Try to match against an opponent already waiting
    const match = await tryMatch(req.user.id, duration);
    if (match.matched) {
      return res.json({ matched: true, duelId: match.duelId });
    }

    // No match yet — insert (or it's already there from above)
    if (!existing) {
      await insertOne('duel-queue.json', {
        id: uuid(),
        userId: req.user.id,
        duration,
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
    }

    const all = await findMany('duel-queue.json');
    res.json({ matched: false, waitingCount: all.length, duration });
  } catch (err) {
    console.error('Queue join error:', err);
    res.status(500).json({ error: 'Failed to join queue' });
  }
});

// POST /queue/leave — remove user from queue
router.post('/queue/leave', async (req, res) => {
  try {
    await deleteOne('duel-queue.json', q => q.userId === req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Queue leave error:', err);
    res.status(500).json({ error: 'Failed to leave queue' });
  }
});

// POST /queue/heartbeat — keep queue entry alive, return matched duel if any
router.post('/queue/heartbeat', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const userId = req.user.id;
    const entry = await findOne('duel-queue.json', q => q.userId === userId);

    if (entry) {
      await updateOne('duel-queue.json', q => q.id === entry.id, {
        lastSeen: new Date().toISOString()
      });
      // Try matching again on every heartbeat in case someone else joined
      const match = await tryMatch(userId, entry.duration);
      if (match.matched) {
        return res.json({ status: 'matched', duelId: match.duelId });
      }
      const all = await findMany('duel-queue.json');
      const elapsedMs = Date.now() - new Date(entry.joinedAt).getTime();
      return res.json({
        status: 'waiting',
        waitingCount: all.length,
        elapsedMs,
        duration: entry.duration
      });
    }

    // Not in queue — maybe they were just matched
    const recent = await findMany('duels.json', d =>
      (d.challengerId === userId || d.opponentId === userId) &&
      d.fromMatchmaking === true &&
      (Date.now() - new Date(d.createdAt).getTime()) < 60000 &&
      (d.status === 'countdown' || d.status === 'active')
    );
    if (recent.length) {
      recent.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ status: 'matched', duelId: recent[0].id });
    }

    return res.json({ status: 'idle' });
  } catch (err) {
    console.error('Queue heartbeat error:', err);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// GET /queue/lobby-detail — per-user list of who's waiting, with name,
// username, duration, and wait time. Used by the in-page Active Lobbies
// section. Excludes the current user from the list.
router.get('/queue/lobby-detail', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const all = await findMany('duel-queue.json');
    const others = all.filter(q => q.userId !== req.user.id);
    if (!others.length) return res.json({ entries: [], waitingCount: 0 });
    const userIds = [...new Set(others.map(q => q.userId))];
    const users = await findMany('users.json', u => userIds.includes(u.id));
    const userById = Object.fromEntries(users.map(u => [u.id, u]));
    const now = Date.now();
    const entries = others.map(q => {
      const u = userById[q.userId] || {};
      return {
        userId: q.userId,
        name: u.name || 'Unknown',
        username: u.username || null,
        plan: u.plan || 'free',
        duration: Number(q.duration),
        waitMs: now - new Date(q.joinedAt).getTime()
      };
    }).sort((a, b) => b.waitMs - a.waitMs);
    res.json({ entries, waitingCount: entries.length });
  } catch (err) {
    console.error('Lobby detail error:', err);
    res.json({ entries: [], waitingCount: 0 });
  }
});

// GET /queue/lobby — counts of users waiting, broken down by duration
// bucket. Used by the sidebar pulse and the lobby popover.
router.get('/queue/lobby', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const all = await findMany('duel-queue.json');
    const now = Date.now();
    const byDuration = {};
    for (const q of all) {
      const d = Number(q.duration);
      if (!byDuration[d]) byDuration[d] = { duration: d, count: 0, oldestWaitMs: 0 };
      byDuration[d].count += 1;
      const waitMs = now - new Date(q.joinedAt).getTime();
      if (waitMs > byDuration[d].oldestWaitMs) byDuration[d].oldestWaitMs = waitMs;
    }
    const buckets = Object.values(byDuration).sort((a, b) => a.duration - b.duration);
    res.json({ waitingCount: all.length, buckets });
  } catch (err) {
    res.json({ waitingCount: 0, buckets: [] });
  }
});

// POST /challenge — create a new duel challenge
router.post('/challenge', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const { friendId, duration } = req.body;
    if (!friendId || !duration) return res.status(400).json({ error: 'friendId and duration are required' });

    const me = await findOne('users.json', u => u.id === req.user.id);
    const friend = await findOne('users.json', u => u.id === friendId);
    if (!me || !friend) return res.status(404).json({ error: 'User not found' });
    if (!(me.friends || []).includes(friendId)) return res.status(400).json({ error: 'You can only challenge friends' });

    // Check for existing active duel between these users
    const existing = await findOne('duels.json', d =>
      (d.status === 'pending' || d.status === 'accepted' || d.status === 'countdown' || d.status === 'active') &&
      ((d.challengerId === me.id && d.opponentId === friendId) || (d.challengerId === friendId && d.opponentId === me.id))
    );
    if (existing) return res.status(400).json({ error: 'An active duel already exists with this friend' });

    const duel = {
      id: uuid(),
      challengerId: me.id,
      challengerName: me.name,
      challengerUsername: me.username || null,
      challengerPlan: me.plan || 'free',
      opponentId: friendId,
      opponentName: friend.name,
      opponentUsername: friend.username || null,
      opponentPlan: friend.plan || 'free',
      duration: Math.min(Math.max(parseInt(duration), 1), 60), // 1-60 minutes
      status: 'pending',
      createdAt: new Date().toISOString(),
      acceptedAt: null,
      startAt: null,
      endAt: null,
      challengerWords: 0,
      opponentWords: 0,
      challengerDocId: null,
      opponentDocId: null,
      winnerId: null
    };

    await insertOne('duels.json', duel);
    res.json(duel);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /requests — incoming duel requests for current user
router.get('/requests', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const duels = await findMany('duels.json', d => d.opponentId === req.user.id && d.status === 'pending');
    // Auto-expire duels older than 24h
    const now = Date.now();
    const valid = [];
    for (const d of duels) {
      if (now - new Date(d.createdAt).getTime() > 24 * 60 * 60 * 1000) {
        await updateOne('duels.json', x => x.id === d.id, { status: 'expired' });
      } else {
        valid.push(d);
      }
    }
    res.json(valid);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/accept — accept a duel challenge
router.post('/:id/accept', async (req, res) => {
  try {
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.opponentId !== req.user.id) return res.status(403).json({ error: 'Not your challenge' });
    if (duel.status !== 'pending') return res.status(400).json({ error: 'Duel is no longer pending' });

    const startAt = new Date(Date.now() + 60 * 1000).toISOString(); // 60s countdown
    const updated = await updateOne('duels.json', d => d.id === req.params.id, {
      status: 'countdown',
      acceptedAt: new Date().toISOString(),
      startAt
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/decline — decline a duel challenge
router.post('/:id/decline', async (req, res) => {
  try {
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.opponentId !== req.user.id) return res.status(403).json({ error: 'Not your challenge' });
    if (duel.status !== 'pending') return res.status(400).json({ error: 'Duel is no longer pending' });

    await updateOne('duels.json', d => d.id === req.params.id, { status: 'declined' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/cancel — challenger cancels their own pending duel
router.post('/:id/cancel', async (req, res) => {
  try {
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    // For matchmaking duels, either side can cancel (both opted in voluntarily).
    // For challenge duels, only the challenger can cancel their own challenge.
    const isParticipant = duel.challengerId === req.user.id || duel.opponentId === req.user.id;
    const canCancel = duel.fromMatchmaking ? isParticipant : duel.challengerId === req.user.id;
    if (!canCancel) return res.status(403).json({ error: 'Not your duel' });
    if (duel.status !== 'pending' && duel.status !== 'countdown') return res.status(400).json({ error: 'Cannot cancel this duel' });

    await updateOne('duels.json', d => d.id === req.params.id, { status: 'cancelled' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /sent — outgoing pending duel challenges from current user
router.get('/sent', async (req, res) => {
  try {
    const duels = await findMany('duels.json', d => d.challengerId === req.user.id && d.status === 'pending');
    // Auto-expire duels older than 24h
    const now = Date.now();
    const valid = [];
    for (const d of duels) {
      if (now - new Date(d.createdAt).getTime() > 24 * 60 * 60 * 1000) {
        await updateOne('duels.json', x => x.id === d.id, { status: 'expired' });
      } else {
        valid.push(d);
      }
    }
    res.json(valid);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /:id/status — poll duel state (word counts, time remaining)
router.get('/:id/status', async (req, res) => {
  try {
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.challengerId !== req.user.id && duel.opponentId !== req.user.id) {
      return res.status(403).json({ error: 'Not your duel' });
    }

    // Record last seen time for this user (used by cleanupStaleDuels)
    if (duel.status === 'active' || duel.status === 'countdown') {
      const seenUpdate = {};
      if (duel.challengerId === req.user.id) seenUpdate.challengerLastSeen = new Date().toISOString();
      else seenUpdate.opponentLastSeen = new Date().toISOString();
      await updateOne('duels.json', d => d.id === req.params.id, seenUpdate);
    }

    // Clean up stale duels (including ones where users stopped polling)
    await cleanupStaleDuels();

    // Re-read duel in case cleanup changed its status
    const freshDuel = await findOne('duels.json', d => d.id === req.params.id);
    if (freshDuel && freshDuel.status === 'completed' && duel.status === 'active') {
      return res.json(freshDuel);
    }

    // Auto-transition from countdown to active
    if (duel.status === 'countdown' && duel.startAt && new Date(duel.startAt) <= new Date()) {
      const endAt = new Date(new Date(duel.startAt).getTime() + duel.duration * 60 * 1000).toISOString();
      const updated = await updateOne('duels.json', d => d.id === req.params.id, {
        status: 'active',
        endAt
      });
      return res.json(updated);
    }

    // Auto-complete if time is up (uses shared helper which respects forfeitedBy)
    if (duel.status === 'active' && duel.endAt && new Date(duel.endAt) <= new Date()) {
      await completeDuelByTime(req.params.id);
      const completed = await findOne('duels.json', d => d.id === req.params.id);
      return res.json(completed);
    }

    // Re-read in case forfeitedBy was set by cleanup or other player
    const latestDuel = await findOne('duels.json', d => d.id === req.params.id);
    res.json(latestDuel || duel);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/update — submit current word count during active duel
router.post('/:id/update', async (req, res) => {
  try {
    const { wordCount } = req.body;
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.status !== 'active') return res.status(400).json({ error: 'Duel is not active' });

    const update = {};
    if (duel.challengerId === req.user.id) {
      update.challengerWords = wordCount || 0;
      update.challengerLastSeen = new Date().toISOString();
    } else if (duel.opponentId === req.user.id) {
      update.opponentWords = wordCount || 0;
      update.opponentLastSeen = new Date().toISOString();
    } else {
      return res.status(403).json({ error: 'Not your duel' });
    }

    const updated = await updateOne('duels.json', d => d.id === req.params.id, update);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/complete — submit final word count and determine winner
router.post('/:id/complete', async (req, res) => {
  try {
    const { wordCount } = req.body;
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.status !== 'active' && duel.status !== 'completed') {
      return res.status(400).json({ error: 'Duel cannot be completed' });
    }

    // Update final word count
    const update = {};
    if (duel.challengerId === req.user.id) {
      update.challengerWords = wordCount || duel.challengerWords;
    } else if (duel.opponentId === req.user.id) {
      update.opponentWords = wordCount || duel.opponentWords;
    } else {
      return res.status(403).json({ error: 'Not your duel' });
    }

    // Re-read to get latest state
    const latest = await updateOne('duels.json', d => d.id === req.params.id, update);
    const cw = latest.challengerWords || 0;
    const ow = latest.opponentWords || 0;
    const winnerId = cw > ow ? latest.challengerId : ow > cw ? latest.opponentId : null;

    const completed = await updateOne('duels.json', d => d.id === req.params.id, {
      status: 'completed',
      winnerId
    });

    res.json(completed);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/ready — signal ready to skip countdown
router.post('/:id/ready', async (req, res) => {
  try {
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.challengerId !== req.user.id && duel.opponentId !== req.user.id) {
      return res.status(403).json({ error: 'Not your duel' });
    }
    if (duel.status !== 'countdown') return res.status(400).json({ error: 'Duel is not in countdown' });

    const field = duel.challengerId === req.user.id ? 'challengerReady' : 'opponentReady';
    const update = { [field]: true };

    // If both ready, start immediately
    const otherReady = duel.challengerId === req.user.id ? duel.opponentReady : duel.challengerReady;
    if (otherReady) {
      const now = new Date();
      update.startAt = now.toISOString();
      update.status = 'active';
      update.endAt = new Date(now.getTime() + duel.duration * 60 * 1000).toISOString();
    }

    const updated = await updateOne('duels.json', d => d.id === req.params.id, update);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/request-time — request extra time (other side must accept)
router.post('/:id/request-time', async (req, res) => {
  try {
    const { minutes } = req.body;
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.challengerId !== req.user.id && duel.opponentId !== req.user.id) {
      return res.status(403).json({ error: 'Not your duel' });
    }
    if (duel.status !== 'active') return res.status(400).json({ error: 'Duel is not active' });
    if (duel.extraTimeRequest) return res.status(400).json({ error: 'A time request is already pending' });

    const extraMinutes = Math.min(Math.max(parseInt(minutes) || 5, 1), 30);

    // If opponent already left, add time directly — no one to ask
    if (duel.forfeitedBy && duel.forfeitedBy !== req.user.id) {
      const addedMs = extraMinutes * 60 * 1000;
      const newEnd = new Date(new Date(duel.endAt).getTime() + addedMs).toISOString();
      const updated = await updateOne('duels.json', d => d.id === req.params.id, { endAt: newEnd });
      return res.json(updated);
    }

    const requesterName = duel.challengerId === req.user.id ? duel.challengerName : duel.opponentName;
    const updated = await updateOne('duels.json', d => d.id === req.params.id, {
      extraTimeRequest: { requestedBy: req.user.id, requesterName, minutes: extraMinutes }
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/respond-time — accept or reject extra time request
router.post('/:id/respond-time', async (req, res) => {
  try {
    const { accept } = req.body;
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (!duel.extraTimeRequest) return res.status(400).json({ error: 'No time request pending' });
    if (duel.extraTimeRequest.requestedBy === req.user.id) {
      return res.status(400).json({ error: 'Cannot respond to your own request' });
    }

    if (accept) {
      const addedMs = duel.extraTimeRequest.minutes * 60 * 1000;
      const newEnd = new Date(new Date(duel.endAt).getTime() + addedMs).toISOString();
      const updated = await updateOne('duels.json', d => d.id === req.params.id, {
        endAt: newEnd,
        extraTimeRequest: null
      });
      return res.json(updated);
    } else {
      const updated = await updateOne('duels.json', d => d.id === req.params.id, { extraTimeRequest: null });
      return res.json(updated);
    }
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/forfeit — leaving = instant loss, other side wins
router.post('/:id/forfeit', async (req, res) => {
  try {
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.challengerId !== req.user.id && duel.opponentId !== req.user.id) {
      return res.status(403).json({ error: 'Not your duel' });
    }
    if (duel.status !== 'active' && duel.status !== 'completed') {
      return res.status(400).json({ error: 'Duel is not active' });
    }
    // Already completed — no-op
    if (duel.status === 'completed') return res.json(duel);
    // Already forfeited by someone — no-op
    if (duel.forfeitedBy) return res.json(duel);

    // Mark forfeiter — but keep duel ACTIVE so the other person can keep writing
    const winnerId = duel.challengerId === req.user.id ? duel.opponentId : duel.challengerId;
    const updated = await updateOne('duels.json', d => d.id === req.params.id, {
      forfeitedBy: req.user.id,
      winnerId
      // NOTE: status stays 'active', endAt stays the same — other player continues until timer
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/beacon-forfeit — sendBeacon-compatible forfeit (token in body, no auth header)
router.post('/:id/beacon-forfeit', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { SECRET } = require('../middleware/auth');
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: 'Token required' });

    let user;
    try { user = jwt.verify(token, SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });
    if (duel.challengerId !== user.id && duel.opponentId !== user.id) {
      return res.status(403).json({ error: 'Not your duel' });
    }
    if (duel.status === 'completed') return res.json(duel);
    if (duel.status !== 'active') return res.status(400).json({ error: 'Duel is not active' });
    if (duel.forfeitedBy) return res.json(duel); // already forfeited

    // Mark forfeiter but keep duel active for the other player
    const winnerId = duel.challengerId === user.id ? duel.opponentId : duel.challengerId;
    const updated = await updateOne('duels.json', d => d.id === req.params.id, {
      forfeitedBy: user.id,
      winnerId
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:id/set-doc — associate a document with a duel participant
router.post('/:id/set-doc', async (req, res) => {
  try {
    const { docId } = req.body;
    const duel = await findOne('duels.json', d => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });

    const update = {};
    if (duel.challengerId === req.user.id) update.challengerDocId = docId;
    else if (duel.opponentId === req.user.id) update.opponentDocId = docId;
    else return res.status(403).json({ error: 'Not your duel' });

    const updated = await updateOne('duels.json', d => d.id === req.params.id, update);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /history — completed duels for current user (paginated)
router.get('/history', async (req, res) => {
  try {
    await cleanupStaleDuels();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const duels = await findMany('duels.json', d =>
      d.status === 'completed' &&
      (d.challengerId === req.user.id || d.opponentId === req.user.id)
    );
    const sorted = duels.sort((a, b) => new Date(b.endAt || b.createdAt) - new Date(a.endAt || a.createdAt));
    const total = sorted.length;
    const items = sorted.slice((page - 1) * limit, page * limit);
    // Enrich with usernames if not already stored
    const users = await findMany('users.json');
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });
    const enriched = items.map(d => ({
      ...d,
      challengerUsername: d.challengerUsername || (userMap[d.challengerId] ? userMap[d.challengerId].username : null),
      opponentUsername: d.opponentUsername || (userMap[d.opponentId] ? userMap[d.opponentId].username : null),
      challengerPlan: d.challengerPlan || (userMap[d.challengerId] ? userMap[d.challengerId].plan : 'free'),
      opponentPlan: d.opponentPlan || (userMap[d.opponentId] ? userMap[d.opponentId].plan : 'free'),
    }));
    res.json({ items: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /active — active/pending/countdown duels for current user
router.get('/active', async (req, res) => {
  try {
    const duels = await findMany('duels.json', d =>
      ['pending', 'accepted', 'countdown', 'active'].includes(d.status) &&
      (d.challengerId === req.user.id || d.opponentId === req.user.id)
    );
    const users = await findMany('users.json');
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });
    const enriched = duels.map(d => ({
      ...d,
      challengerUsername: d.challengerUsername || (userMap[d.challengerId] ? userMap[d.challengerId].username : null),
      opponentUsername: d.opponentUsername || (userMap[d.opponentId] ? userMap[d.opponentId].username : null),
      challengerPlan: d.challengerPlan || (userMap[d.challengerId] ? userMap[d.challengerId].plan : 'free'),
      opponentPlan: d.opponentPlan || (userMap[d.opponentId] ? userMap[d.opponentId].plan : 'free'),
    }));
    res.json(enriched);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
