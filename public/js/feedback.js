/* Optional feedback lives inside the saved-session result, never in the editor. */
const SessionFeedback = {
  generation: 0,
  async show(documentId) {
    const generation = ++this.generation;
    const card = document.getElementById('session-feedback');
    card.hidden = true;
    if (!documentId) return;
    try {
      const result = await API.request(`/feedback/${encodeURIComponent(documentId)}/prompt`, { method: 'POST' });
      if (generation !== this.generation || !result.eligible || !document.getElementById('session-complete').classList.contains('active')) return;
      this.documentId = documentId;
      card.innerHTML = `<form id="session-feedback-form">
        <h3 id="feedback-question">How enjoyable was your writing session?</h3>
        <p class="feedback-intro">A quick rating helps us make iWrite better.</p>
        <fieldset class="feedback-stars"><legend class="feedback-sr-only">Rate your experience from 1 to 5 stars</legend>
          ${['Not enjoyable', 'Could be better', 'Okay', 'Enjoyable', 'Loved it'].map((label, i) => `<label><input type="radio" name="rating" value="${i + 1}" required aria-label="${i + 1} ${i ? 'stars' : 'star'} — ${label}"><span aria-hidden="true">★</span></label>`).join('')}
        </fieldset>
        <p id="feedback-rating-label" class="feedback-hint" aria-live="polite">Choose 1–5 stars</p>
        <div id="feedback-comment-wrap" hidden>
          <label for="feedback-comment">Anything you’d like us to know? <span class="feedback-hint">(optional)</span></label>
          <textarea id="feedback-comment" maxlength="1000" rows="2" placeholder="What felt good? What could be better?"></textarea>
          <p class="feedback-hint">Shared privately with the iWrite team · 1,000 characters max</p>
        </div>
        <p id="feedback-error" role="alert"></p>
        <div class="feedback-actions"><button type="submit" class="btn btn-primary" id="feedback-submit" disabled>Send feedback</button><button type="button" class="btn btn-ghost" id="feedback-skip">Not now</button></div>
        <p class="feedback-hint">Optional. After you send, we won’t ask again for 30 days.</p>
      </form>`;
      card.hidden = false;
      const radios = card.querySelectorAll('input[name="rating"]');
      radios.forEach(input => input.addEventListener('change', () => {
        radios.forEach(radio => radio.parentElement.classList.toggle('selected', Number(radio.value) <= Number(input.value)));
        card.querySelector('#feedback-rating-label').textContent = input.getAttribute('aria-label');
        card.querySelector('#feedback-comment-wrap').hidden = false;
        card.querySelector('#feedback-submit').disabled = false;
      }));
      card.querySelector('#feedback-skip').onclick = () => this.hide();
      card.querySelector('form').onsubmit = event => { event.preventDefault(); this.submit(card, generation, documentId); };
    } catch { /* A feedback outage must never interrupt a saved session. */ }
  },
  hide() {
    this.generation++;
    document.getElementById('session-feedback').hidden = true;
  },
  async submit(card, generation, documentId) {
    const rating = Number(card.querySelector('input[name="rating"]:checked')?.value);
    const button = card.querySelector('#feedback-submit');
    if (!rating || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Sending…';
    card.querySelector('#feedback-error').textContent = '';
    try {
      await API.request(`/feedback/${encodeURIComponent(documentId)}`, {
        method: 'POST', body: JSON.stringify({ rating, comment: card.querySelector('textarea').value })
      });
      if (generation !== this.generation) return;
      card.innerHTML = '<p role="status" tabindex="-1"><strong>Thank you — your feedback is saved.</strong><br><span class="feedback-hint">We won’t ask again for 30 days. Happy writing!</span></p>';
      card.querySelector('[role="status"]').focus({ preventScroll: true });
    } catch (err) {
      if (generation !== this.generation) return;
      card.querySelector('#feedback-error').textContent = err.message || 'Could not send. Please try again.';
      button.disabled = false;
      button.textContent = 'Try again';
    }
  }
};
document.addEventListener('DOMContentLoaded', () => {
  ['sc-dashboard', 'sc-new-session'].forEach(id => document.getElementById(id)?.addEventListener('click', () => SessionFeedback.hide()));
});
