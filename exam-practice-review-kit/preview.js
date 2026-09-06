(() => {
  'use strict';
  const worker = 'https://exam-practice-review-kit.lipmichal.workers.dev';
  const params = new URLSearchParams(location.search);
  let qa = params.get('qa') === '1';
  try {
    if (qa) sessionStorage.setItem('exam-practice-review-kit-qa', '1');
    qa = qa || sessionStorage.getItem('exam-practice-review-kit-qa') === '1';
  } catch (_) { /* The page still works when browser storage is unavailable. */ }
  const allowed = new Set(['offer_view', 'preview_used', 'checkout_click', 'entry_menu', 'entry_home', 'entry_ap', 'entry_sat', 'entry_act']);
  const sent = new Set();
  function event(name) {
    if (qa || !allowed.has(name) || sent.has(name)) return;
    sent.add(name);
    fetch(worker + '/event', {
      method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ event: name })
    }).catch(() => {});
  }
  event('offer_view');
  const entry = params.get('from');
  if (entry) event(entry.startsWith('entry_') ? entry : 'entry_' + entry);
  const entrySource = new Set(['menu', 'home', 'ap', 'sat', 'act']).has(entry) ? entry : 'direct';
  let checkoutReady = false;
  const checkoutForms = document.querySelectorAll('.checkout-form');
  checkoutForms.forEach(form => {
    form.elements.namedItem('entry_source').value = entrySource;
    form.addEventListener('submit', e => {
      if (!checkoutReady) { e.preventDefault(); return; }
      event('checkout_click');
    });
  });

  fetch(worker + '/health', { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .then(response => response.ok ? response.json() : null)
    .then(status => {
      checkoutReady = status?.service === 'exam-practice-review-kit' && status.mode === 'live' && status.checkout_enabled === true;
      checkoutForms.forEach(form => {
        form.querySelector('button[type="submit"]').disabled = !checkoutReady;
        form.querySelector('.checkout-status').textContent = checkoutReady
          ? 'Secure checkout is available.'
          : 'Checkout is currently unavailable. You can still try the example.';
      });
    }).catch(() => {});

  const byId = id => document.getElementById(id);
  const attemptStage = byId('attempt-stage');
  const correctionStage = byId('correction-stage');
  const resultStage = byId('result-stage');
  const usedHelp = byId('used-help');
  let assisted = true;
  function reveal(withHelp) {
    event('preview_used');
    assisted = withHelp;
    usedHelp.checked = withHelp;
    usedHelp.disabled = withHelp;
    attemptStage.hidden = true;
    correctionStage.hidden = false;
    byId('attempt-note').textContent = withHelp
      ? 'You opened the correction without declaring an unaided attempt. This example will count the retry as assisted.'
      : 'You attempted it before opening the correction. Compare your answer honestly. If you used help, mark it above.';
    byId('result-correct').focus({ preventScroll: true });
  }
  byId('attempt-unaided').addEventListener('click', () => reveal(false));
  byId('attempt-assisted').addEventListener('click', () => reveal(true));
  function result(correct) {
    const helped = assisted || usedHelp.checked;
    correctionStage.hidden = true;
    resultStage.hidden = false;
    byId('result-title').textContent = helped
      ? (correct ? 'Correct, with help' : 'Another pass, with help')
      : (correct ? 'Correct, without help' : 'Another unaided attempt needed');
    byId('result-copy').textContent = helped
      ? 'An explanation helped with this attempt. Keep it separate from an unaided retry, then choose a date to try again without your notes.'
      : (correct ? 'You reported a correct answer before checking. In the full app, save the retry and choose when you want to return.' : 'Keep the correction specific. In the full app, save this retry and choose a new date to try the operation again.');
    resultStage.querySelector('[role="status"]').focus({ preventScroll: true });
  }
  byId('result-correct').addEventListener('click', () => result(true));
  byId('result-wrong').addEventListener('click', () => result(false));
  byId('reset-preview').addEventListener('click', () => {
    resultStage.hidden = true;
    correctionStage.hidden = true;
    attemptStage.hidden = false;
    usedHelp.checked = false;
    usedHelp.disabled = false;
    assisted = true;
    byId('attempt-unaided').focus({ preventScroll: true });
  });

  const tasks = ['Reverse an operation', 'Explain a graph'];
  function plan() {
    const today = Number(byId('available-minutes').value);
    const tomorrow = byId('tomorrow-room').checked ? 20 : 0;
    let availableToday = today, availableTomorrow = tomorrow, overflow = 0, plannedToday = 0, plannedTomorrow = 0;
    byId('minutes-value').value = today + ' min';
    byId('plan-tasks').replaceChildren(...tasks.map((task, index) => {
      let place;
      if (availableToday >= 20) { availableToday -= 20; plannedToday += 20; place = 'Today'; }
      else if (availableTomorrow >= 20) { availableTomorrow -= 20; plannedTomorrow += 20; place = 'Tomorrow'; }
      else { overflow++; place = 'Needs room'; }
      const row = document.createElement('div'); row.className = 'plan-task';
      const marker = document.createElement('span'); marker.className = 'task-marker'; marker.textContent = String(index + 1); marker.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'task-name'; name.textContent = task;
      const duration = document.createElement('span'); duration.textContent = '20-minute review'; name.append(duration);
      const status = document.createElement('span'); status.className = 'task-place' + (place === 'Needs room' ? ' overflow' : ''); status.textContent = place;
      row.append(marker, name, status); return row;
    }));
    byId('capacity-summary').textContent = plannedToday + ' of ' + today + ' minutes today' + (tomorrow ? ' · ' + plannedTomorrow + ' tomorrow' : '');
    byId('overflow-count').textContent = overflow ? overflow + (overflow === 1 ? ' task needs room' : ' tasks need room') : 'Both tasks fit';
  }
  byId('available-minutes').addEventListener('input', () => { event('preview_used'); plan(); });
  byId('tomorrow-room').addEventListener('change', () => { event('preview_used'); plan(); });
  plan();
})();
