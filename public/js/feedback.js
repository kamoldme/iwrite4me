/* Monthly feedback lives inside the saved-session result, never in the editor. */
const SessionFeedback = {
  generation: 0,
  wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
  isCurrent(generation) {
    return generation === this.generation && document.getElementById('session-complete').classList.contains('active');
  },
  prepareSequence() {
    const screen = document.getElementById('session-complete');
    if (!screen.querySelector('.completion-stage')) {
      const stage = document.createElement('div');
      stage.className = 'completion-stage';
      const summary = document.createElement('div');
      summary.className = 'completion-summary';
      [screen.querySelector('h2'), screen.querySelector('.session-stats'), document.getElementById('sc-streak')].forEach(el => summary.appendChild(el));
      stage.appendChild(summary);
      stage.appendChild(document.getElementById('session-feedback'));
      screen.prepend(stage);
      const navigation = document.getElementById('sc-dashboard').parentElement;
      navigation.classList.add('completion-navigation');
      const next = document.createElement('button');
      next.id = 'completion-next';
      next.className = 'btn btn-primary btn-large';
      next.textContent = 'Next';
      summary.appendChild(next);
    }
    screen.classList.add('completion-sequence');
    screen.dataset.phase = 'title';
    document.getElementById('sc-new-session').textContent = 'START AGAIN';
    document.getElementById('sc-dashboard').textContent = 'GO TO DASHBOARD';
    document.getElementById('sc-dashboard').classList.replace('btn-ghost', 'btn-primary');
    this.setNavigation(false);
    document.getElementById('completion-next').hidden = true;
    screen.querySelector('.completion-summary').removeAttribute('aria-hidden');
    return screen;
  },
  async show(documentId) {
    const generation = ++this.generation;
    const card = document.getElementById('session-feedback');
    card.hidden = true;
    const screen = this.prepareSequence();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The entire reveal finishes within two seconds; only Next opens feedback.
    await this.wait(reducedMotion ? 0 : 500);
    if (!this.isCurrent(generation)) return;
    screen.dataset.phase = 'stats';
    await this.wait(reducedMotion ? 0 : 1500);
    if (!this.isCurrent(generation)) return;
    const next = document.getElementById('completion-next');
    next.hidden = false;
    next.disabled = false;
    next.textContent = 'Next';
    next.onclick = () => this.openFeedback(documentId, generation);
  },
  setNavigation(ready) {
    ['sc-dashboard', 'sc-new-session'].forEach(id => {
      document.getElementById(id).hidden = !ready || id === 'sc-new-session';
      document.getElementById(id).disabled = false;
    });
  },
  async openFeedback(documentId, generation) {
    if (!this.isCurrent(generation)) return;
    const screen = document.getElementById('session-complete');
    const card = document.getElementById('session-feedback');
    const next = document.getElementById('completion-next');
    if (next.disabled) return;
    next.disabled = true;
    next.textContent = 'Loading…';
    try {
      this.documentId = documentId;
      // Claim the account's monthly invitation before revealing the form.
      // Other sessions go straight to the dashboard during the quiet period.
      this.invitation = this.prepareInvitation(documentId);
      const result = await this.invitation;
      if (!this.isCurrent(generation)) return;
      if (!result.eligible) {
        document.getElementById('sc-dashboard').click();
        return;
      }
      card.innerHTML = `<form id="session-feedback-form">
        <h3 id="feedback-question">How enjoyable was your writing session?</h3>
        <p class="feedback-intro">A quick rating helps us make iWrite better.</p>
        <fieldset class="feedback-stars"><legend class="feedback-sr-only">Rate your experience from 1 to 5 stars</legend>
          ${['Not enjoyable', 'Could be better', 'Okay', 'Enjoyable', 'Loved it'].map((label, i) => `<label><input type="radio" name="rating" value="${i + 1}" aria-label="${i + 1} ${i ? 'stars' : 'star'} — ${label}"><span aria-hidden="true">★</span></label>`).join('')}
        </fieldset>
        <p id="feedback-rating-label" class="feedback-hint" aria-live="polite">Choose 1–5 stars (optional)</p>
        <div id="feedback-comment-wrap">
          <label for="feedback-comment">Anything you’d like us to know? <span class="feedback-hint">(optional)</span></label>
          <textarea id="feedback-comment" maxlength="1000" rows="2" placeholder="What felt good? What could be better?"></textarea>
          <div class="feedback-meta feedback-hint"><span>Shared privately with the iWrite team</span><span>1,000 characters max</span></div>
        </div>
        <p id="feedback-error" role="alert"></p>
      </form>`;
      screen.querySelector('.completion-summary').setAttribute('aria-hidden', 'true');
      card.hidden = false;
      screen.dataset.phase = 'feedback';
      const radios = card.querySelectorAll('input[name="rating"]');
      radios.forEach(input => input.addEventListener('change', () => {
        radios.forEach(radio => radio.parentElement.classList.toggle('selected', Number(radio.value) <= Number(input.value)));
        card.querySelector('#feedback-rating-label').textContent = input.getAttribute('aria-label');
        card.querySelector('#feedback-comment-wrap').hidden = false;
        if (card.querySelector('#feedback-error').textContent.startsWith('Choose a star rating')) {
          card.querySelector('#feedback-error').textContent = '';
        }

      }));
      card.querySelector('form').onsubmit = event => event.preventDefault();
      next.hidden = true;
      this.setNavigation(true);
    } catch {
      if (this.isCurrent(generation)) {
        next.disabled = false;
        next.textContent = 'Try again';
        document.getElementById('sc-dashboard').textContent = 'GO TO DASHBOARD';
        this.setNavigation(true);
      }
    }
    finally {
      if (this.isCurrent(generation) && screen.dataset.phase === 'feedback') {
        next.hidden = true;
        this.setNavigation(true);
      }
    }
  },
  prepareInvitation(documentId) {
    return API.request(`/feedback/${encodeURIComponent(documentId)}/prompt`, {
      method: 'POST', signal: AbortSignal.timeout(8000)
    });
  },
  hide() {
    this.generation++;
    document.getElementById('session-feedback').hidden = true;
    const screen = document.getElementById('session-complete');
    screen.dataset.phase = 'stats';
    screen.querySelector('.completion-summary')?.removeAttribute('aria-hidden');
  },
  async continueTo(button) {
    const card = document.getElementById('session-feedback');
    if (this.sending) return;
    const rating = Number(card.querySelector('input[name="rating"]:checked')?.value);
    const comment = card.querySelector('textarea')?.value || '';
    if (rating) {
      this.sending = true;
      const generation = this.generation;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      ['sc-dashboard', 'sc-new-session'].forEach(id => document.getElementById(id).disabled = true);
      card.querySelector('#feedback-error').textContent = 'Sending your feedback…';
      try {
        // If the initial invitation failed, retry it while retaining the draft.
        await this.invitation.catch(() => this.prepareInvitation(this.documentId));
        if (!this.isCurrent(generation)) return;
        await API.request(`/feedback/${encodeURIComponent(this.documentId)}`, {
          method: 'POST', body: JSON.stringify({ rating, comment }), signal: controller.signal
        });
        if (!this.isCurrent(generation)) return;
      } catch {
        if (!this.isCurrent(generation)) return;
        const error = card.querySelector('#feedback-error');
        error.textContent = 'Could not send. Please try again.';
        error.textContent = 'Could not send. Try again, or ';
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'feedback-skip-error';
        skip.textContent = 'continue without sending';
        skip.onclick = () => this.navigate(button);
        error.appendChild(skip);
        return;
      } finally {
        clearTimeout(timeout);
        this.sending = false;
        if (this.isCurrent(generation)) this.setNavigation(true);
      }
    }
    this.navigate(button);
  },
  navigate(button) {
    // A nested click on the same button is ignored by browsers. Resume after
    // the original click finishes, including the blank-feedback path.
    queueMicrotask(() => {
      this.allowNavigation = true;
      try { button.click(); } finally { this.allowNavigation = false; }
    });
  }
};
// Capture before the app's existing navigation listeners so chosen feedback is
// persisted first. Blank feedback still uses the original navigation immediately.
document.addEventListener('click', event => {
  const button = event.target.closest?.('#sc-dashboard, #sc-new-session');
  if (!button || SessionFeedback.allowNavigation) return;
  if (document.getElementById('session-complete').dataset.phase !== 'feedback') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  SessionFeedback.continueTo(button);
}, true);
document.addEventListener('DOMContentLoaded', () => {
  ['sc-dashboard', 'sc-new-session'].forEach(id => document.getElementById(id)?.addEventListener('click', () => SessionFeedback.hide()));
});
