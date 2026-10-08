/* ============================================================================
 * SafeByte - conversational shell
 * ----------------------------------------------------------------------------
 * The app is one thread. This file owns the conversation; app-v2.js remains the
 * engine (extraction, compliance rules, FoSCoS verification, report markup).
 * Nothing here re-implements analysis - it sequences it as dialogue and routes
 * whatever the person types to whichever step is currently waiting for it.
 * ==========================================================================*/

(function () {
  'use strict';

  // ---------------------------------------------------------------- state
  // Every typed message is interpreted against `phase`. That is the whole
  // trick: one input box, several meanings.
  const S = {
    phase: 'idle',        // idle | confirming_food | answering | thinking | chatting
    info: null,           // extraction in progress
    queue: [],            // questions still to ask, one at a time
    current: null,        // question on the table right now
    answers: {},          // field -> what the person said
    scans: 0,
    lastData: null        // most recent completed analysis
  };

  // Interface language. Falls through to English if i18n.js is absent.
  const T = k => (window.SafeByteI18N ? SafeByteI18N.t(k) : null);
  const tx = (k, fallback) => T(k) || fallback;
  // Rules engines speak English; the interface speaks whatever the user picked.
  const lbl = en => (window.SafeByteI18N ? SafeByteI18N.label(en) : en);

  const $ = id => document.getElementById(id);
  const thread = () => $('thread');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function setStatus(t) { const e = $('agentStatus'); if (e) e.textContent = t; }

  function scrollDown(smooth) {
    const t = thread();
    if (t) t.scrollTo({ top: t.scrollHeight, behavior: smooth === false ? 'auto' : 'smooth' });
  }

  // ------------------------------------------------------------- messages
  function bubble(role, html, cls) {
    const row = document.createElement('div');
    row.className = 'msg msg-' + role + (cls ? ' ' + cls : '');
    row.innerHTML = role === 'agent'
      ? `<span class="msg-mark" aria-hidden="true"></span><div class="msg-body"></div>`
      : `<div class="msg-body"></div>`;
    const body = row.querySelector('.msg-body');
    // The agent writes its own sentences, so they cannot all be dictionary
    // keys. They go through the translator, which shows English at once and
    // rewrites the bubble in place when the translation lands.
    body.innerHTML = (role === 'agent' && window.SafeByteI18N)
      ? SafeByteI18N.dynamic(body, html)
      : html;
    thread().appendChild(row);
    scrollDown();
    return row;
  }

  const say = html => {
    const row = bubble('agent', html);
    // Anything the agent says should be sayable. Questions especially: the
    // whole point of voice mode is that someone can be asked "can you see an
    // MRP on the pack?" without having to read it. Speak whatever is actually
    // on screen, which may already be the translated wording.
    try {
      if (window.SafeByteVoice) {
        const b = row.querySelector('.msg-body');
        SafeByteVoice.speak(b ? b.innerHTML : html);
      }
    } catch (e) {}
    return row;
  };
  const youSaid = text => bubble('you', `<p>${esc(text)}</p>`);

  /** Agent messages arrive like someone typing, not like a page render. */
  async function says(html, pause) {
    const dots = bubble('agent', '<span class="dots"><i></i><i></i><i></i></span>', 'is-typing');
    setStatus('typing…');
    await sleep(pause || Math.min(1100, 320 + String(html).length * 5));
    dots.remove();
    setStatus('online');
    return say(html);
  }

  /** A step the agent is performing, shown live and then resolved. */
  function work(label) {
    const row = bubble('agent', `<div class="step"><span class="spin"></span><span>${esc(label)}</span></div>`, 'is-step');
    return {
      done(text) {
        row.querySelector('.msg-body').innerHTML =
          `<div class="step step-done"><span class="tick">&#10003;</span><span>${esc(text)}</span></div>`;
        scrollDown();
      },
      fail(text) {
        row.querySelector('.msg-body').innerHTML =
          `<div class="step step-fail"><span class="cross">&times;</span><span>${esc(text)}</span></div>`;
        scrollDown();
      }
    };
  }

  function divider(text) {
    const d = document.createElement('div');
    d.className = 'thread-divider';
    d.innerHTML = `<span>${esc(text)}</span>`;
    thread().appendChild(d);
    scrollDown();
  }

  // --------------------------------------------------------- quick replies
  let chipHandlers = {};
  function chips(options) {
    const box = $('quickReplies');
    chipHandlers = {};
    if (!options || !options.length) { box.innerHTML = ''; box.classList.remove('has-chips'); return; }
    box.classList.add('has-chips');
    box.innerHTML = options.map((o, i) => {
      chipHandlers['c' + i] = o.run;
      return `<button class="chip${o.tone ? ' chip-' + o.tone : ''}" data-h="c${i}">${esc(o.label)}</button>`;
    }).join('');
    box.querySelectorAll('.chip').forEach(b => {
      b.onclick = () => {
        const fn = chipHandlers[b.dataset.h];
        const label = b.textContent;
        chips(null);
        youSaid(label);
        if (fn) fn();
      };
    });
    scrollDown();
  }

  // ------------------------------------------------------------- composer
  function composerEnabled(on, placeholder) {
    const i = $('composerInput'), s = $('composerSend');
    if (!i) return;
    i.disabled = !on;
    if (s) s.disabled = !on;
    if (placeholder) i.placeholder = placeholder;
  }

  window.growComposer = function (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  };

  window.onComposerKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onComposerSubmit(); }
  };

  window.onComposerSubmit = function () {
    const el = $('composerInput');
    const text = (el.value || '').trim();
    if (!text) return;
    el.value = ''; growComposer(el);
    routeMessage(text);
  };

  /** One input box, routed by what the agent is currently waiting for. */
  function routeMessage(text) {
    youSaid(text);
    chips(null);

    if (S.phase === 'awaiting_go') {
      if (/\b(go|start|analys|analyz|yes|done|that.s all|ok|proceed|check)\b/i.test(text)) return beginAnalysis();
      says('Add another photo with the image button, or say "go" and I will work with what I have.');
      return;
    }
    if (S.phase === 'confirming_food') return handleFoodReply(text);
    if (S.phase === 'answering') return handleAnswer(text);
    if (S.phase === 'thinking') {
      says('One moment, still working through the last one.');
      return;
    }
    if (S.phase === 'chatting') return handleChat(text);

    says('Send me a photo of a food package to start, the image button is on the left.');
  }

  // ------------------------------------------------------------- upload
  window.onChatFilePicked = function (e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) receiveImage(f);
  };

  // A pack has more than one face, and the particulars are spread across them.
  // Photos are collected first and analysed together, so a batch number on the
  // back is not reported missing because the front was sent alone.
  let pendingShots = [];
  let shotTimer = null;

  async function receiveImage(file) {
    startConversation();

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const shrunk = await downscaleImage(ev.target.result);

      if (!pendingShots.length) {
        if (S.scans > 0) divider(tx('divider.newScan','New scan'));
        S.scans++;
        currentImages = [];
      }

      pendingShots.push(shrunk);
      currentImages.push({
        base64: shrunk.base64, mimeType: shrunk.mimeType,
        dataUrl: shrunk.dataUrl, label: null
      });
      currentImage = pendingShots[0].base64;
      currentImageMime = pendingShots[0].mimeType;
      currentImageFile = file;

      bubble('you', `<img class="msg-photo" src="${shrunk.dataUrl}" alt="package photo" />`);

      // Wait a beat in case more photos are arriving in the same gesture.
      clearTimeout(shotTimer);
      composerEnabled(false, 'Attaching…');
      chips(null);
      shotTimer = setTimeout(() => offerMoreShots(), 700);
    };
    reader.readAsDataURL(file);
  }

  async function offerMoreShots() {
    const n = pendingShots.length;
    composerEnabled(true, tx('ph.more','add another, or say go...'));
    await says(
      n === 1
        ? `Got it. If the pack has more to show, the back, the strip, the flap with the expiry, add those too and I will read them together. Otherwise I will start.`
        : `${n} photos so far. Add more, or tell me to go.`
    );
    chips([
      { label: tx('chip.analyse','Analyse now'), run: () => beginAnalysis() },
      { label: tx('chip.addPhoto','Add another photo'), tone: 'ghost', run: () => $('chatFileInput').click() }
    ]);
    S.phase = 'awaiting_go';
  }

  function beginAnalysis() {
    chips(null);
    pendingShots = [];
    runFlow();
  }

  // Drag & drop anywhere in the thread
  function wireDrop() {
    const t = thread();
    ['dragenter', 'dragover'].forEach(k => t.addEventListener(k, e => {
      e.preventDefault(); t.classList.add('drop-hot');
    }));
    ['dragleave', 'drop'].forEach(k => t.addEventListener(k, e => {
      e.preventDefault(); t.classList.remove('drop-hot');
    }));
    t.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) receiveImage(f);
    });
  }

  // ==========================================================================
  // THE FLOW
  // ==========================================================================

  async function runFlow() {
    S.phase = 'thinking';
    composerEnabled(false, 'SafeByte is looking at the photo…');
    chips(null);

    const reading = work(tx('step.reading','Reading the label'));
    let info;
    try {
      const raw = await callGeminiExtract();
      info = parseExtractedInfo(raw);
      reading.done(lastProvider ? `${tx('step.read','Label read')} (${lastProvider})` : tx('step.read','Label read'));
    } catch (err) {
      reading.fail(tx('step.failRead','I could not read that image'));
      await says(`Something went wrong reading it: <em>${esc(err.message || 'unknown error')}</em><br><br>Try another photo, or check the terminal if this keeps happening.`);
      S.phase = 'idle';
      composerEnabled(true, tx('ph.another','Send another photo...'));
      return;
    }

    S.info = info;

    // Medicines are a different statute, a different regulator and a different
    // set of mandatory particulars. Branch before the food logic runs.
    if (info.productKind === 'medicine') return runMedicineFlow(info);

    if (info.productKind === 'cosmetic') {
      S.phase = 'confirming_food';
      composerEnabled(true, tx('ph.yesno','yes / no...'));
      await says(
        `This looks like a <strong>cosmetic</strong>, not food or medicine. I check food labels against FSSAI rules and medicine labels against the Drugs and Cosmetics Rules, cosmetics have their own requirements I do not cover yet.`
      );
      chips([
        { label: 'It is a food product', run: confirmFood },
        { label: 'It is a medicine', tone: 'ghost', run: () => { S.info.productKind = 'medicine'; runMedicineFlow(S.info); } },
        { label: 'Never mind', tone: 'ghost', run: abandonScan }
      ]);
      return;
    }

    const a = agentAssess(info);

    // --- Is this even food? -------------------------------------------------
    if (!a.isFood) {
      S.phase = 'confirming_food';
      composerEnabled(true, tx('ph.yesno','yes / no...'));
      await says(
        `This does not look like a food package to me.` +
        (a.notFoodReason ? ` It looks like <strong>${esc(a.notFoodReason)}</strong>.` : '') +
        `<br><br>I check food labels against FSSAI and Legal Metrology rules, which would not mean anything here. Is it actually a packaged food or drink?`
      );
      chips([
        { label: tx('chip.isFood','Yes, it is food'), run: confirmFood },
        { label: tx('chip.notFood','No, my mistake'), tone: 'ghost', run: abandonScan }
      ]);
      return;
    }

    // --- Can I read it at all? ---------------------------------------------
    if (a.confidence === 'low') {
      S.phase = 'confirming_food';
      composerEnabled(true, 'retake / continue…');
      await says(
        (a.qualityIssue ? esc(a.qualityIssue) + ' ' : 'The label is not legible enough for me to be confident. ') +
        `A verdict from this photo would be guesswork, and flagging a violation that is not really there is worse than asking you to try again.`
      );
      chips([
        { label: tx('chip.retake','I will retake it'), run: abandonScan },
        { label: tx('chip.continue','Continue anyway'), tone: 'ghost', run: () => { S.info.packageConfidence = 'medium'; proceed(); } }
      ]);
      return;
    }

    await identified(info);
    proceed();
  }

  async function identified(info) {
    const name = info.productName || 'this product';
    let line = `Yes, this is a food package. I can see <strong>${esc(name)}</strong>`;
    if (info.brand && info.brand !== info.productName) line += ` from <strong>${esc(info.brand)}</strong>`;
    line += '.';
    const n = info.fssaiLicNos?.length || (info.fssaiLicNo ? 1 : 0);
    if (n > 1) line += ` There are ${n} FSSAI licence numbers printed on it.`;
    else if (n === 1) line += ` FSSAI licence <code>${esc(info.fssaiLicNo)}</code> is printed on it.`;
    await says(line);
  }

  /** Ask what is missing, one question at a time, then verify. */
  async function proceed() {
    const a = agentAssess(S.info);
    S.queue = a.questions.slice();
    if (S.queue.length) {
      await says(S.queue.length === 1
        ? `There is one thing I could not read. You are holding the pack, can you check?`
        : `There are ${S.queue.length} things I could not read off the label. You are holding the pack, so let us go through them one at a time.`);
      return askNext();
    }
    return verifyAndReport();
  }

  async function askNext() {
    S.current = S.queue.shift();
    if (!S.current) return verifyAndReport();

    S.phase = 'answering';
    composerEnabled(true, S.current.placeholder || 'Type what it says…');
    await says(
      `${esc(S.current.question)}` +
      (S.current.why ? `<br><span class="msg-why">${esc(S.current.why)}</span>` : '')
    );
    chips([{ label: tx('chip.notPrinted','Not printed on the pack'), tone: 'ghost', run: () => handleAnswer('__ABSENT__') }]);
    $('composerInput').focus();
  }

  async function handleAnswer(text) {
    const q = S.current;
    S.current = null;
    chips(null);

    if (text === '__ABSENT__') {
      S.info.userConfirmedMissing = true;
      (S.info.absentFields = S.info.absentFields || []).push(q.key);
      await says(`Noted, if it genuinely is not printed, that is itself a violation and I will record it as one.`);
    } else {
      S.answers[q.key] = text;
      if (q.key === 'fssaiLicNo') {
        const digits = text.replace(/[^0-9]/g, '');
        S.info.fssaiLicNo = digits;
        if (!Array.isArray(S.info.fssaiLicNos)) S.info.fssaiLicNos = [];
        if (digits && !S.info.fssaiLicNos.some(l => l.licenceNumber === digits)) {
          S.info.fssaiLicNos.unshift({
            licenceNumber: digits, type: 'Provided by user',
            entityName: S.info.manufacturer || null, address: S.info.manufacturerAddress || null
          });
        }
        await says(digits.length === 14
          ? `Got it, 14 digits, that looks like a valid licence format.`
          : `Noted, though <code>${esc(digits)}</code> is ${digits.length} digits and an FSSAI licence should be 14. I will flag that.`);
      } else {
        S.info[q.key] = text;
        await says(`Thanks.`);
      }
      S.info.userSuppliedFields = Object.keys(S.answers);
    }

    if (S.queue.length) return askNext();
    return verifyAndReport();
  }

  async function handleFoodReply(text) {
    const t = text.toLowerCase();
    if (/^(y|yes|yeah|yep|it is|food|haan|ha)\b/.test(t)) return confirmFood();
    if (/^(n|no|nope|nah|not)\b/.test(t)) return abandonScan();
    await says(`Sorry, just so I do not waste your time: is this a packaged food or drink? A yes or no is enough.`);
    chips([
      { label: tx('chip.isFood','Yes, it is food'), run: confirmFood },
      { label: tx('chip.notFood','No, my mistake'), tone: 'ghost', run: abandonScan }
    ]);
  }

  async function confirmFood() {
    S.info.isFoodPackage = true;
    S.info.userConfirmedFood = true;
    await says(`Right, taking your word for it. Carrying on, I will be a bit careful with what I extracted.`);
    proceed();
  }

  async function abandonScan() {
    S.phase = 'idle';
    S.info = null;
    chips(null);
    composerEnabled(true, tx('ph.another','Send another photo...'));
    await says(`No problem. Send me the back of a food package whenever you are ready, the side with the ingredients and the FSSAI number is the useful one.`);
  }

  // ---------------------------------------------------- verify + report
  async function verifyAndReport() {
    S.phase = 'thinking';
    composerEnabled(false, 'Checking the licence…');
    chips(null);

    const info = S.info;
    const compliance = runComplianceChecks(info);

    const licCount = info.fssaiLicNos?.length || (info.fssaiLicNo ? 1 : 0);
    const step = work(licCount > 1
      ? `Checking ${licCount} licences against the FoSCoS government database`
      : 'Checking the licence against the FoSCoS government database');

    let multi, fssaiResult;
    try {
      multi = await fssaiService.verifyAll(info.fssaiLicNos, info.manufacturer, info.manufacturerAddress);
      fssaiResult = multi.primaryResult;
      fssaiResult.multi = multi;
      step.done(`${tx('step.licChecked','Licence checked')}: ${multi.count} (${String(multi.overallResult || '').replace(/_/g, ' ').toLowerCase()})`);
    } catch (err) {
      step.fail('Could not reach the FoSCoS database');
      multi = { results: [], count: 0, overallResult: 'UNVERIFIED' };
      fssaiResult = { overallResult: 'UNVERIFIED', licenceNumber: { normalized: info.fssaiLicNo }, multi };
    }

    const data = {
      info, compliance, fssaiResult,
      fssaiResults: multi.results, fssaiMulti: multi,
      timestamp: Date.now(),
      imageData: 'data:' + (currentImageMime || 'image/jpeg') + ';base64,' + currentImage
    };
    currentAnalysis = data;
    S.lastData = data;

    await postVerdict(data);

    try { saveToHistory(data); } catch (e) { console.warn('[SafeByte] history save:', e); }
    try { SafeByteStore.save(data); } catch (e) { console.warn('[SafeByte] handoff save:', e); }

    await walkChecklist(data);
    await reportPackaging(data);
    await analyseIngredients(data);
    await closingTable(data);

    // Hand over to open conversation
    chatHistory = [];
    S.phase = 'chatting';
    composerEnabled(true, tx('ph.ask','Ask me anything about this product...'));
    await says(agentOpeningMessage(data));
    chips([
      { label: tx('chip.whoEat','Who can eat this?'), run: () => routeAsChat('Who can safely eat this? What should I watch out for?') },
      { label: tx('chip.explain','Explain the verdict'), run: () => routeAsChat('Explain the compliance verdict in plain language.') },
      compliance.failCount
        ? { label: tx('chip.report','How do I report this?'), tone: 'ghost', run: () => offerComplaint() }
        : { label: tx('chip.healthy','How healthy is it?'), tone: 'ghost', run: () => routeAsChat('How healthy is this, based on the actual ingredients and nutrition on this pack?') }
    ]);
  }

  /** Reuse the engine's full report markup, folded into a card in the thread. */
  async function postVerdict(data) {
    const c = data.compliance;
    const verdict = c.overall === 'compliant'
      ? { icon: '&#10003;', tone: 'ok', head: tx('verdict.ok','Compliant'),
          line: tx('verdict.okLine','Every mandatory declaration is present and correctly formed.') }
      : c.overall === 'non-compliant'
        ? { icon: '&times;', tone: 'bad', head: `${c.failCount} ${tx('verdict.bad','violations')}`,
            line: tx('verdict.badLine','This pack does not meet FSSAI / Legal Metrology requirements.') }
        : { icon: '!', tone: 'warn', head: tx('verdict.warn','Needs review'),
            line: `${c.warnCount} thing${c.warnCount === 1 ? '' : 's'} a human should look at.` };

    // The engine still renders its full report into the hidden container so
    // history, the complaint form and the download all keep working - but it
    // is no longer shown here. The walkthrough below covers the same ground
    // line by line, and showing both would just repeat the checklist twice.
    try { renderResults(data); } catch (e) { console.warn('[SafeByte] report render:', e); }
    await says(`
      <div class="verdict verdict-${verdict.tone}">
        <div class="verdict-top">
          <span class="verdict-icon">${verdict.icon}</span>
          <div>
            <strong>${verdict.head}</strong>
            <span>${verdict.line}</span>
          </div>
        </div>
        ${data.fssaiResult && data.fssaiResult.isGovtApproved
          ? '<div class="verdict-gov"> Licence is live on the government FoSCoS database</div>' : ''}
        ${data.fssaiResult && data.fssaiResult.overallResult === 'VERIFIED_MISMATCH'
          ? '<div class="verdict-gov verdict-gov-bad"> Licence is registered to a different company than the brand on this pack</div>' : ''}
      </div>`, 500);
  }

  window.toggleReport = function (id) {
    const box = $(id), btn = $('btn' + id);
    if (!box) return;
    box.hidden = !box.hidden;
    btn.textContent = box.hidden ? 'Show the full breakdown' : 'Hide the breakdown';
    if (!box.hidden) setTimeout(scrollDown, 60);
  };

  // ==========================================================================
  // THE WALKTHROUGH
  // Every judgement below is computed from the extraction, not asked of the
  // person and not invented by a model. Deep dives are the only part that
  // costs a request, and only when someone actually taps one.
  // ==========================================================================

  /** Two or three words. The long version lives behind the tap. */
  function shortNote(chk) {
    const d = (chk.details || '').trim();
    if (chk.status === 'fail') return tx('note.missing','missing');
    if (chk.status === 'warn') return tx('note.review','needs a look');
    if (!d || /^present$/i.test(d)) return tx('note.present','present');
    if (/^\d+ licences/i.test(d)) return d.split('(')[0].trim();
    const clean = d.replace(/\s+/g, ' ');
    return clean.length > 30 ? clean.slice(0, 28).trim() + '…' : clean;
  }

  async function walkChecklist(data) {
    const c = data.compliance;
    const passed = c.checks.filter(x => x.status === 'pass').length;

    await says(
      `Here is the <strong>${c.checks.length}-point label check</strong>. ` +
      `${passed} of ${c.checks.length} cleared. Tap any line and I will explain that one properly.`
    );

    const rows = c.checks.map((chk, i) => `
      <button class="check-row check-${chk.status}" onclick="deepDive(${i})">
        <span class="check-mark">${chk.status === 'pass' ? '&#10003;' : chk.status === 'warn' ? '!' : '&times;'}</span>
        <span class="check-text">
          <span class="check-label">${esc(lbl(chk.label))}</span>
          <span class="check-note">${esc(shortNote(chk))}</span>
        </span>
        <span class="check-chev">&rsaquo;</span>
      </button>`).join('');

    say(`<div class="checklist">${rows}</div>`);
    await sleep(340);
  }

  /** One focused request, only when someone taps a line. */
  window.deepDive = async function (i) {
    const data = S.lastData;
    if (!data) return;
    const chk = data.compliance.checks[i];
    if (!chk) return;

    youSaid(`Tell me more about: ${chk.label}`);
    const dots = bubble('agent', '<span class="dots"><i></i><i></i><i></i></span>', 'is-typing');
    setStatus('thinking…');

    const q = `Explain the label check "${chk.label}" for this specific product.

What I found on this pack: ${chk.details || 'nothing'} (status: ${chk.status}).

Cover, in this order and in plain language a shopper would follow:
1. What this declaration is and why the law requires it.
2. Exactly what is on THIS pack, and whether that satisfies the rule.
3. What it means for the person holding it - does it matter in practice, and what could go wrong without it.
4. If it is missing or wrong: which rule is breached and what the consumer can do.

Keep it under 200 words. No preamble, no restating the question.`;

    try {
      const reply = await callGeminiChat(q + (window.SafeByteVoice ? SafeByteVoice.promptSuffix() : ''));
      dots.remove();
      say(`<div class="deep-head">${esc(lbl(chk.label))}</div>` + formatReply(reply));
    } catch (err) {
      dots.remove();
      say(`<em>Could not fetch that just now, ${esc(err.message || 'providers busy')}.</em>`);
    }
    setStatus('online');
    scrollDown();
  };

  // ------------------------------------------------------------- packaging
  async function reportPackaging(data) {
    const p = assessPackaging(data.info);
    data.packaging = p;

    const toneMap = { yes: 'ok', depends: 'warn', caution: 'bad', unknown: 'warn' };
    const tone = toneMap[p.foodSafe] || 'warn';
    const envWord = { good: 'recyclable', fair: 'partly recyclable', poor: 'not recyclable', unknown: 'unknown' }[p.env];

    await says(
      tx('pack.intro','Now the packaging itself, the part almost nobody reads.') +
      (p.printed ? ` This pack is marked <code>${esc(p.printed)}</code>${p.code ? ` (resin code ${esc(p.code)})` : ''}.` : '')
    );

    say(`
      <div class="pack-card pack-${tone}">
        <div class="pack-name">${esc(p.known ? p.name : 'No material marking found')}</div>
        <div class="pack-verdict">${esc(p.verdict)}</div>
        <div class="pack-grid">
          <div><span>${esc(tx('pack.foodContact','Food contact'))}</span><strong class="pack-${tone}-t">${
            { yes: 'Safe', depends: 'Safe for the food', caution: 'Questionable', unknown: 'Unknown' }[p.foodSafe] || 'Unknown'
          }</strong></div>
          <div><span>${esc(tx('pack.after','After you finish it'))}</span><strong>${esc(envWord)}</strong></div>
        </div>
        <button class="verdict-more" onclick="packDeepDive()">${esc(tx('pack.why','Why does this matter?'))}</button>
      </div>`);
    await sleep(320);
  }

  window.packDeepDive = function () {
    const p = S.lastData && S.lastData.packaging;
    if (!p) return;
    youSaid('Why does the packaging material matter?');
    say(
      `<div class="deep-head">${esc(p.known ? p.name : 'No marking found')}</div>` +
      `<p>${esc(p.detail)}</p>` +
      `<p><strong>What happens to it afterwards.</strong> ${esc(p.recycling)}</p>` +
      (p.foodSafe === 'caution'
        ? `<p><strong>Worth knowing.</strong> This material is one of the few where the plastic itself is a fair question, not just a disposal problem. If the food inside is oily or eaten warm, that is when it matters most.</p>`
        : p.foodSafe === 'depends'
          ? `<p><strong>To be fair to the product:</strong> the layer touching your food is normally an approved food-grade plastic, so this is an environmental problem rather than a safety one. The snack is fine. The wrapper outlives you.</p>`
          : '')
    );
    scrollDown();
  };

  // ----------------------------------------------------------- ingredients
  async function analyseIngredients(data) {
    const info = data.info;
    if (!info.ingredients) {
      await says(`There is no ingredients list I could read, which is itself a violation, it is mandatory on every packaged food. Without it I cannot tell you what is actually in this.`);
      return;
    }

    const step = work(tx('step.ingredients','Reading through the ingredients'));
    const q = `Analyse the ingredients of this specific product for an ordinary Indian shopper.

INGREDIENTS AS PRINTED: ${info.ingredients}
NUTRITION AS PRINTED: ${info.nutritionalInfo || 'not declared on pack'}
NET QUANTITY: ${info.netQuantity || 'not declared'}
ALLERGENS AS PRINTED: ${info.allergens || 'none declared'}
PRODUCT: ${info.productName || 'unknown'} (${info.productType || 'packaged food'})

Write exactly three short labelled paragraphs, no headings beyond the labels:

**What is actually in it** - walk through the real ingredients in order, saying plainly what each one is. Name any palm oil, refined oils, added sugar, salt levels, artificial colours, flavour enhancers such as MSG, or preservatives, and say what they are there for.

**What it does to you** - based on the declared numbers, not generalities. Sodium, fat, sugar per serving against normal daily limits. Be concrete and honest; do not moralise or lecture.

**Who should be careful** - who specifically should watch out, and why. Allergens, children, anyone managing blood pressure or sugar.

Under 220 words total. Plain words, no jargon unless you explain it in the same sentence.`;

    try {
      const reply = await callGeminiChat(q + (window.SafeByteVoice ? SafeByteVoice.promptSuffix() : ''));
      step.done(tx('step.ingredientsDone','Ingredients analysed'));
      say(`<div class="deep-head">What is inside</div>` + formatReply(reply));
    } catch (err) {
      step.fail('Could not analyse the ingredients just now');
    }
    await sleep(320);
  }

  // --------------------------------------------------------- closing table
  async function closingTable(data) {
    const c = data.compliance;
    const p = data.packaging || {};
    const fails = c.checks.filter(x => x.status === 'fail');
    const warns = c.checks.filter(x => x.status === 'warn');

    await says(tx('sum.pulling','So, pulling it together.'));

    const rows = [];
    fails.forEach(f => rows.push([lbl(f.label), tx('sum.missing','Missing'), 'bad']));
    warns.forEach(w => rows.push([lbl(w.label), tx('sum.review','Needs review'), 'warn']));
    if (!rows.length) rows.push([
      tx('sum.allPresent','All 12 mandatory declarations'),
      tx('sum.present','Present'), 'ok']);

    rows.push([
      tx('sum.fssaiLic','FSSAI licence'),
      data.fssaiResult && data.fssaiResult.isGovtApproved
        ? tx('sum.verified','Verified with government')
        : data.fssaiResult && data.fssaiResult.overallResult === 'VERIFIED_MISMATCH'
          ? tx('sum.otherCompany','Registered to another company')
          : tx('sum.notVerified','Not verified'),
      data.fssaiResult && data.fssaiResult.isGovtApproved ? 'ok'
        : data.fssaiResult && data.fssaiResult.overallResult === 'VERIFIED_MISMATCH' ? 'bad' : 'warn'
    ]);

    rows.push([
      tx('sum.packaging','Packaging'),
      p.known ? (p.env === 'poor' ? tx('sum.safeNotRecycl','Safe for food, not recyclable')
              : p.env === 'good' ? tx('sum.safeRecycl','Safe for food, recyclable')
              : tx('sum.safeHard','Safe for food, hard to recycle'))
              : tx('sum.noMarking','No material marking'),
      p.env === 'good' ? 'ok' : 'warn'
    ]);

    const table = `
      <table class="sum-table">
        <thead><tr><th>${esc(tx('sum.what','What I checked'))}</th><th>${esc(tx('sum.where','Where it stands'))}</th></tr></thead>
        <tbody>
          ${rows.map(([a, b, t]) => `
            <tr><td>${esc(a)}</td><td><span class="sum-pill sum-${t}">${esc(b)}</span></td></tr>`).join('')}
        </tbody>
      </table>`;

    const headline = c.failCount
      ? `<strong>${c.failCount} ${esc(tx('close.missing','mandatory declarations missing.'))}</strong> ` +
        esc(tx('close.breach','That is a breach of the Legal Metrology (Packaged Commodities) Rules, 2011, and you can report it.'))
      : c.warnCount
        ? `<strong>${esc(tx('close.nothingIllegal','Nothing illegal, but some items are worth a second look.'))}</strong>`
        : `<strong>${esc(tx('close.inOrder','This label is in order. Every mandatory declaration is present and the licence checks out.'))}</strong>`;

    say(headline + table);
    await sleep(300);

    await says(
      esc(tx('link.onePage','Everything above, on a single page you can scroll, print or keep open beside the pack:')) +
      `<div class="link-card">` +
        `<a class="link-go" href="report.html" target="_blank" rel="noopener">` +
          `` +
          `<span class="link-go-text"><strong>${esc(tx('link.report','Open the full report'))}</strong>` +
          `<span>${esc(tx('link.reportSub','Every check, the FoSCoS licence comparison, extracted label data and the packaging, plus you can keep chatting from there'))}</span></span>` +
          `<span class="link-go-arrow">&rarr;</span>` +
        `</a>` +
      `</div>`
    );
  }

  // ----------------------------------------------------------- free chat
  function routeAsChat(q) { chips(null); youSaid(q); handleChat(q); }

  /** "how do I report this" is an action, not a question for the model. */
  const COMPLAINT_INTENT = /\b(complain|complaint|report(ing)?|grievance|file a|raise a|where (can|do) i|how (can|do) i (report|complain)|fssai complaint|foscos)\b/i;

  async function handleChat(text) {
    if (!currentAnalysis) {
      await says('Send me a package photo first and then I can answer questions about it.');
      return;
    }

    if (COMPLAINT_INTENT.test(text)) return offerComplaint();
    const dots = bubble('agent', '<span class="dots"><i></i><i></i><i></i></span>', 'is-typing');
    setStatus('thinking…');
    composerEnabled(false, 'SafeByte is thinking…');
    try {
      const ask = text + (window.SafeByteVoice ? SafeByteVoice.promptSuffix() : '');
      const reply = await callGeminiChat(ask);
      chatHistory.push({ role: 'user', parts: [{ text }] });
      chatHistory.push({ role: 'model', parts: [{ text: reply }] });
      dots.remove();
      say(formatReply(reply));
    } catch (err) {
      dots.remove();
      say(`<em>I could not get an answer just then, ${esc(err.message || 'the providers are all busy')}.</em> Ask again in a moment.`);
    }
    setStatus('online');
    composerEnabled(true, tx('ph.ask','Ask me anything about this product...'));
    $('composerInput').focus();
  }

  /** Light markdown so answers do not arrive as a wall of asterisks. */
  function formatReply(t) {
    let h = esc(t);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|\n)\s*[-*]\s+(.+)/g, '$1<li>$2</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    h = h.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    return '<p>' + h + '</p>';
  }

  // ==========================================================================
  // MEDICINE FLOW
  // Drugs and Cosmetics Rules 1945 (Rules 96 and 97, as amended 2018).
  // The rules engine is deterministic; the model only supplies perception.
  // ==========================================================================

  async function runMedicineFlow(info) {
    S.phase = 'thinking';
    composerEnabled(false, 'Checking the medicine label…');

    const name = info.genericName || info.brandNameDrug || info.productName || 'this medicine';
    let line = `This is a <strong>medicine</strong>, not a food product, so I am checking it against the Drugs and Cosmetics Rules 1945 instead of the food rules.`;
    await says(line);

    let idLine = `I can see <strong>${esc(name)}</strong>`;
    if (info.brandNameDrug && info.genericName && info.brandNameDrug !== info.genericName) {
      idLine += `, sold as ${esc(info.brandNameDrug)}`;
    }
    if (info.dosageForm) idLine += `, ${esc(info.dosageForm)}`;
    idLine += '.';
    await says(idLine);

    // ---- expiry first: it is the thing a person acts on today --------------
    const exp = expiryStatus(info);
    if (exp.known && exp.expired) {
      say(`<div class="med-alert med-alert-bad">
             <strong>This medicine has expired.</strong>
             <span>Printed expiry: ${esc(exp.raw)}, ${exp.days} day${exp.days === 1 ? '' : 's'} ago. Do not take it. Return it to the pharmacy or dispose of it safely; do not flush it.</span>
           </div>`);
      await sleep(400);
    } else if (exp.known && exp.soon) {
      say(`<div class="med-alert med-alert-warn">
             <strong>Expiring soon.</strong>
             <span>Printed expiry: ${esc(exp.raw)}, about ${exp.days} days left.</span>
           </div>`);
      await sleep(350);
    } else if (!exp.known && info.expiryDate) {
      await says(`The expiry reads "${esc(info.expiryDate)}", which I could not parse into a date, check it yourself before taking any of it.`);
    }

    const compliance = runMedicineChecks(info);

    // ---- schedule ----------------------------------------------------------
    const sch = compliance.schedule;
    if (sch.known) {
      await says(
        `This is a <strong>${esc(sch.name)}</strong> drug. ${esc(sch.plain)}`
      );
    } else if (sch.isPrescription) {
      await says(`There is an Rx symbol but no schedule marking I could read, so I cannot tell you which category it falls under.`);
    }

    const data = {
      kind: 'medicine',
      info, compliance,
      schedule: sch,
      licence: compliance.licence,
      expiry: exp,
      fssaiResult: null,
      timestamp: Date.now()
    };
    currentAnalysis = data;
    S.lastData = data;

    await postMedicineVerdict(data);
    await walkMedicineChecks(data);
    await reportDrugLicence(data);
    await medicineSummary(data);

    try { SafeByteStore.save(data); } catch (e) { console.warn('[SafeByte] handoff:', e); }

    chatHistory = [];
    S.phase = 'chatting';
    composerEnabled(true, tx('ph.askMed','Ask me anything about this medicine...'));

    await says(
      `That is the label. I should be plain about what I am not: I check whether the pack carries what the law requires, ` +
      `and I can explain what the drug is. I am not a doctor or a pharmacist, and nothing here is medical advice about ` +
      `whether you should take it.`
    );

    chips([
      { label: tx('chip.medFor','What is this medicine for?'), run: () => routeAsChat(`What is ${info.genericName || info.productName} used for? Explain simply, based on the composition printed on this pack.`) },
      { label: tx('chip.sideEffects','Side effects to know'), run: () => routeAsChat('What are the common side effects and interactions I should know about for this medicine?') },
      { label: tx('chip.report','How do I report this?'), tone: 'ghost', run: () => offerComplaint() }
    ]);
  }

  async function postMedicineVerdict(data) {
    const c = data.compliance;
    const v = c.overall === 'compliant'
      ? { icon: '&#10003;', tone: 'ok', head: 'Label is compliant', line: 'Every particular Rule 96 requires is present.' }
      : c.failCount
        ? { icon: '&times;', tone: 'bad', head: `${c.failCount} mandatory particular${c.failCount === 1 ? '' : 's'} missing`, line: 'This label does not meet the Drugs and Cosmetics Rules 1945.' }
        : { icon: '!', tone: 'warn', head: 'Needs a closer look', line: `${c.warnCount} item${c.warnCount === 1 ? '' : 's'} I could not confirm from these photos.` };

    await says(`
      <div class="verdict verdict-${v.tone}">
        <div class="verdict-top">
          <span class="verdict-icon">${v.icon}</span>
          <div><strong>${v.head}</strong><span>${v.line}</span></div>
        </div>
        ${data.schedule && data.schedule.known
          ? `<div class="verdict-gov"> ${esc(data.schedule.name)}, prescription only</div>` : ''}
      </div>`, 480);
  }

  async function walkMedicineChecks(data) {
    const c = data.compliance;
    const passed = c.checks.filter(x => x.status === 'pass').length;
    await says(`Here is the label check against Rule 96 and Rule 97. ${passed} of ${c.checks.length} cleared. Tap any line for the detail.`);

    const rows = c.checks.map((chk, i) => `
      <button class="check-row check-${chk.status}" onclick="medDeepDive(${i})">
        <span class="check-mark">${chk.status === 'pass' ? '&#10003;' : chk.status === 'warn' ? '!' : '&times;'}</span>
        <span class="check-text">
          <span class="check-label">${esc(lbl(chk.label))}</span>
          <span class="check-note">${esc(shortNote(chk))}</span>
        </span>
        <span class="check-chev">&rsaquo;</span>
      </button>`).join('');
    say(`<div class="checklist">${rows}</div>`);
    await sleep(320);
  }

  // The medicine deep dive answers from the rule text we already hold, and
  // only asks the model for the part it cannot know.
  window.medDeepDive = async function (i) {
    const data = S.lastData;
    if (!data || !data.compliance) return;
    const chk = data.compliance.checks[i];
    if (!chk) return;

    youSaid(`Tell me more about: ${chk.label}`);
    say(
      `<div class="deep-head">${esc(lbl(chk.label))}</div>` +
      `<p><span class="rule-tag">${esc(chk.rule)}</span></p>` +
      `<p>${esc(chk.why)}</p>` +
      `<p><strong>On this pack:</strong> ${esc(chk.details)}</p>` +
      (chk.status === 'fail'
        ? `<p>That is a breach of the labelling rules. It is reportable to the State Drug Controller for the state where the manufacturer is located.</p>`
        : chk.status === 'warn'
          ? `<p>I could not confirm this from the photos you sent. Another photo of that part of the pack would settle it.</p>`
          : '')
    );
    scrollDown();
  };

  async function reportDrugLicence(data) {
    const lic = data.licence;

    if (!lic.present) {
      say(`<div class="med-alert med-alert-bad">
             <strong>No manufacturing licence number on this pack.</strong>
             <span>${esc(lic.meaning)}</span>
           </div>`);
      await sleep(350);
      return;
    }

    await says(`Now the manufacturing licence, and here I have to be careful with you.`);

    say(`
      <div class="lic-card">
        <div class="lic-num">${esc(lic.number)}</div>
        ${lic.formMeaning ? `<div class="lic-form">${esc(lic.formMeaning)}</div>` : ''}
        <div class="lic-state">${esc(lic.verdict)}</div>
        <p class="lic-why">${esc(lic.meaning)}</p>
        <a class="lic-btn" href="${DRUG_VERIFY_PORTAL}" target="_blank" rel="noopener">
          Verify it yourself on the government portal &rarr;
        </a>
        <button class="lic-copy" onclick="copyLicence('${esc(lic.number)}')">Copy the licence number</button>
      </div>`);
    await sleep(350);

    await says(
      `To be explicit, because this matters: <strong>a licence I cannot look up is not a fake licence.</strong> ` +
      `Food licences sit in one national FSSAI database I can query directly. Drug manufacturing licences do not, ` +
      `they are issued state by state, and the national verification page is behind a captcha I will not bypass. ` +
      `If this number does not appear there, the most likely explanation is that it sits with a State Licensing Authority, ` +
      `not that the medicine is counterfeit.`
    );
  }

  window.copyLicence = function (n) {
    navigator.clipboard.writeText(n).then(() => showToast('Licence number copied', 'success'));
  };

  async function medicineSummary(data) {
    const c = data.compliance;
    const rows = [];
    c.checks.filter(x => x.status === 'fail').forEach(f => rows.push([f.label, tx('sum.missing','Missing'), 'bad']));
    c.checks.filter(x => x.status === 'warn').forEach(w => rows.push([w.label, 'Unconfirmed', 'warn']));
    if (!rows.length) rows.push(['All mandatory particulars', 'Present', 'ok']);

    if (data.expiry && data.expiry.known) {
      rows.push(['Expiry', data.expiry.expired ? 'EXPIRED' : (data.expiry.soon ? 'Expiring soon' : 'In date'),
                 data.expiry.expired ? 'bad' : (data.expiry.soon ? 'warn' : 'ok')]);
    }
    if (data.schedule && data.schedule.known) {
      rows.push([data.schedule.name, 'Prescription only', 'warn']);
    }
    rows.push(['Manufacturing licence',
               data.licence.present ? 'Printed, not verifiable from here' : 'Not printed',
               data.licence.present ? 'warn' : 'bad']);

    await says(tx('sum.pulling','So, pulling it together.'));
    const headline = c.failCount
      ? `<strong>${c.failCount} mandatory particular${c.failCount === 1 ? '' : 's'} missing under the Drugs and Cosmetics Rules 1945.</strong> This is reportable to the State Drug Controller.`
      : `<strong>The label carries what the law requires.</strong>`;

    say(headline + `
      <table class="sum-table">
        <thead><tr><th>${esc(tx('sum.what','What I checked'))}</th><th>${esc(tx('sum.where','Where it stands'))}</th></tr></thead>
        <tbody>${rows.map(([a, b, t]) => `<tr><td>${esc(a)}</td><td><span class="sum-pill sum-${t}">${esc(b)}</span></td></tr>`).join('')}</tbody>
      </table>`);
    await sleep(300);

    await says(
      `Everything above on one page:` +
      `<div class="link-card">` +
        `<a class="link-go" href="report.html" target="_blank" rel="noopener">` +
          `` +
          `<span class="link-go-text"><strong>Open the full report</strong>` +
          `<span>Every particular, the schedule requirements and the licence, and you can keep chatting from there</span></span>` +
          `<span class="link-go-arrow">&rarr;</span>` +
        `</a>` +
      `</div>`
    );
  }

  // ------------------------------------------------------------ complaint
  // Explain what a complaint has to contain before handing over a link - a
  // link on its own leaves the person staring at a government form with no
  // idea what to put in it.

  window.offerComplaint = async function offerComplaint() {
    const data = S.lastData || currentAnalysis;
    if (!data) { await says('Scan a package first and I can prepare the complaint for you.'); return; }

    chips(null);
    const fails = (data.compliance.checks || []).filter(c => c.status === 'fail');

    await says(
      `You report this to <strong>FSSAI</strong>, through the FoSCoS portal, the same government system whose ` +
      `database I just checked the licence against.`
    );

    await says(
      `A complaint that gets acted on has four parts:` +
      `<ul>` +
        `<li><strong>The product</strong>, name, brand, and the FSSAI licence printed on the pack.</li>` +
        `<li><strong>Who is responsible</strong>, the manufacturer or marketer named on the label, with their address.</li>` +
        `<li><strong>What exactly is wrong</strong>, each missing declaration named specifically, not "the label is bad".</li>` +
        `<li><strong>Who you are</strong>, your name, mobile, email and district, so they can come back to you.</li>` +
      `</ul>` +
      (fails.length
        ? `For this pack I already have all four. The ${fails.length} violation${fails.length === 1 ? '' : 's'} ` +
          `I found ${fails.length === 1 ? 'is' : 'are'} written up with the rule ${fails.length === 1 ? 'it breaches' : 'they breach'}.`
        : `This pack passed every check, so there may be nothing to report, but you can still raise something I did not catch, like a misleading claim.`)
    );

    await says(
      `Here is the part that usually makes this painful. The portal will not let me fill it in for you, ` +
      `government forms block that, and they should. So I have put your details and their form side by side ` +
      `in one tab. Copy each field across and submit.` +
      `<div class="link-card">` +
        `<a class="link-go link-go-warn" href="complaint.html" target="_blank" rel="noopener">` +
          `` +
          `<span class="link-go-text"><strong>Open the complaint desk</strong>` +
          `<span>Your prepared complaint on the left, the official FoSCoS form on the right, one tab</span></span>` +
          `<span class="link-go-arrow">&rarr;</span>` +
        `</a>` +
      `</div>`
    );

    chips([
      { label: 'What happens after I submit?', run: () => routeAsChat('What happens after I submit an FSSAI complaint? How long does it take and what can I expect?') },
      { label: 'Back to the product', tone: 'ghost', run: () => routeAsChat('Tell me more about this product.') }
    ]);
  };

  // ------------------------------------------------------------- history
  // ------------------------------------------------------------- settings
  // Verifico is the one part of the licence check that costs money, and it
  // has no API that reports the balance. So the server counts what it spends
  // and this panel shows that count, labelled as a count, with the dashboard
  // one tap away for the real figure.
  window.openSettings = function () {
    $('settingsDrawer').classList.add('open');
    $('settingsDrawer').setAttribute('aria-hidden', 'false');
    $('settingsScrim').classList.add('open');
    loadVerificoUsage();
  };

  window.closeSettings = function () {
    $('settingsDrawer').classList.remove('open');
    $('settingsDrawer').setAttribute('aria-hidden', 'true');
    $('settingsScrim').classList.remove('open');
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('settingsDrawer') && $('settingsDrawer').classList.contains('open')) {
      closeSettings();
    }
  });

  function whenText(iso) {
    if (!iso) return tx('set.never', 'Never');
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    const lang = (window.SafeByteVoice && SafeByteVoice.lang) || 'en-IN';
    try { return d.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return d.toLocaleString(); }
  }

  window.loadVerificoUsage = async function () {
    const box = $('verificoUsage');
    if (!box) return;
    box.innerHTML = `<p class="set-intro">${esc(tx('set.loading', 'Loading...'))}</p>`;

    const proto = window.location.protocol;
    const url = (proto === 'http:' || proto === 'https:')
      ? '/api/verifico/usage'
      : 'http://localhost:3000/api/verifico/usage';

    let u;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      u = await r.json();
    } catch (e) {
      box.innerHTML = `<p class="set-error">${esc(tx('set.loadFail', 'Could not load usage from the server.'))}</p>`;
      return;
    }

    const limit = u.creditLimit || 0;
    // When Verifico itself says the account is empty, the bar is full whatever we counted.
    const pct = u.confirmedByVerifico ? 100 : limit ? Math.min(100, Math.round((u.used / limit) * 100)) : 0;
    const out = u.outOfCredits;
    const low = !out && limit && u.remaining <= Math.max(2, Math.ceil(limit * 0.2));

    let status, tone;
    if (!u.keySet)                 { status = tx('set.keyNo', 'No key set, lookups are off'); tone = 'bad'; }
    else if (u.confirmedByVerifico){ status = tx('set.statusOut', 'Out of credits'); tone = 'bad'; }
    else if (out)                  { status = tx('set.statusOutGuess', 'Probably out of credits'); tone = 'bad'; }
    else if (low)                  { status = tx('set.statusLow', 'Running low'); tone = 'warn'; }
    else                           { status = tx('set.statusOk', 'Working'); tone = 'ok'; }

    const lastResult = {
      verified:       tx('set.rVerified', 'Verified'),
      not_found:      tx('set.rNotFound', 'Not found'),
      out_of_credits: tx('set.statusOut', 'Out of credits'),
      error:          tx('set.rError', 'Failed')
    }[u.lastResult] || '';

    const rupees = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

    box.innerHTML = `
      <div class="set-big">
        <strong>${u.remaining}</strong>
        <span>${esc(tx('set.leftOf', 'lookups left of {limit}').replace('{limit}', limit))}</span>
      </div>
      <div class="set-bar${out ? ' is-out' : low ? ' is-low' : ''}" role="progressbar"
           aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${u.used}">
        <i style="width:${pct}%"></i>
      </div>
      <div class="set-bar-cap">${u.used} / ${limit} ${esc(tx('set.usedLower', 'used'))}</div>

      <span class="set-status ${tone}">${esc(status)}</span>

      <div class="set-rows">
        <div class="set-row"><span>${esc(tx('set.used', 'Lookups used'))}</span><b>${u.used}</b></div>
        <div class="set-row"><span>${esc(tx('set.notCharged', 'Not charged (not found or failed)'))}</span><b>${u.notCharged}</b></div>
        <div class="set-row"><span>${esc(tx('set.price', 'Price after the free 10'))}</span><b>${rupees(u.pricePerLookupInr)}</b></div>
        <div class="set-row"><span>${esc(tx('set.spent', 'Spent so far'))}</span><b>${rupees(u.spentInr)}</b></div>
        <div class="set-row"><span>${esc(tx('set.last', 'Last lookup'))}</span><b>${esc(whenText(u.lastAt))}${lastResult ? ' &middot; ' + esc(lastResult) : ''}</b></div>
        <div class="set-row"><span>${esc(tx('set.key', 'Verifico key'))}</span><b>${esc(u.keySet ? tx('set.keyYes', 'Set') : tx('set.keyNoShort', 'Not set'))}</b></div>
      </div>

      ${u.confirmedByVerifico && u.countedRemaining > 0
        ? `<p class="set-note">${esc(tx('set.mismatch', 'Verifico refused for lack of credits, although this server had only counted part of them. Some lookups were made from somewhere else with the same key.'))}</p>` : ''}

      ${u.lastError && (u.lastResult === 'out_of_credits' || u.lastResult === 'error')
        ? `<p class="set-note"><b>${esc(tx('set.lastErr', 'Verifico said'))}:</b> ${esc(u.lastError)}</p>` : ''}

      <p class="set-note">${esc(tx('set.since', 'Counted by this server since'))} ${esc(whenText(u.since))}.
        ${esc(tx('set.note', 'Verifico has no way to ask for the balance, so this is the app\'s own count. Lookups made anywhere else are not in it, and the count restarts if the server is redeployed. The exact balance is on your Verifico dashboard.'))}</p>
      <a class="set-link" href="${esc(u.dashboard)}" target="_blank" rel="noopener">${esc(tx('set.dashboard', 'Open Verifico dashboard'))} &rarr;</a>`;
  };

  window.openHistoryDrawer = function () {
    const body = $('drawerHistory');
    if (!scanHistory || !scanHistory.length) {
      body.innerHTML = '<p class="drawer-empty">No scans yet. Send a package photo to start.</p>';
    } else {
      body.innerHTML = scanHistory.map((h, i) => `
        <button class="drawer-item" onclick="recallScan(${i})">
          ${h.thumbnail ? `<img src="${h.thumbnail}" alt="" />` : '<span class="drawer-thumb"></span>'}
          <span class="drawer-item-text">
            <strong>${esc(h.productName || 'Unknown product')}</strong>
            <span>${esc(h.brand || '')} &middot; ${new Date(h.timestamp).toLocaleDateString()}</span>
          </span>
          <span class="drawer-pill drawer-${h.overall === 'compliant' ? 'ok' : 'bad'}">${h.overall === 'compliant' ? 'OK' : 'Issue'}</span>
        </button>`).join('');
    }
    $('historyDrawer').classList.add('open');
    $('historyScrim').classList.add('open');
  };
  window.closeHistoryDrawer = function () {
    $('historyDrawer').classList.remove('open');
    $('historyScrim').classList.remove('open');
  };
  window.recallScan = function (i) {
    closeHistoryDrawer();
    const h = scanHistory[i];
    if (!h) return;
    divider(tx('divider.history','From your history'));
    say(`<strong>${esc(h.productName || 'Unknown product')}</strong>${h.brand ? ', ' + esc(h.brand) : ''}<br>
         <span class="msg-why">Scanned ${new Date(h.timestamp).toLocaleString()} &middot; ${h.overall === 'compliant' ? 'compliant' : 'had issues'}</span><br><br>
         Scan it again to ask questions about it, I only keep the summary, not the full label data.`);
  };

  window.startNewScan = function () {
    chips(null);
    S.phase = 'idle'; S.info = null; S.queue = []; S.current = null; S.answers = {};
    currentImage = null; currentAnalysis = null;
    composerEnabled(true, 'Send a photo of a food package…');
    $('chatFileInput').click();
  };

  // ==========================================================================
  // VOICE
  // ==========================================================================

  function fillLanguagePickers() {
    if (!window.SafeByteVoice) return;
    const opts = SafeByteVoice.LANGUAGES.map(l =>
      `<option value="${l.code}"${l.code === SafeByteVoice.lang ? ' selected' : ''}>${l.native}</option>`
    ).join('');
    ['langSelect', 'langSelectLanding'].forEach(id => {
      const el = $(id);
      if (el) { el.innerHTML = opts; el.value = SafeByteVoice.lang; }
    });
  }

  window.onLangChange = async function (code) {
    if (!window.SafeByteVoice) return;
    SafeByteVoice.setLang(code);
    fillLanguagePickers();

    // Translate the interface itself, not just what the model writes back.
    // Hindi and Marathi are built in and swap instantly; the rest are
    // translated once and cached, so only the first switch costs anything.
    if (window.SafeByteI18N) {
      const info = SafeByteVoice.langInfo;
      let note = null;
      const result = await SafeByteI18N.setLanguage(code, info.ai, state => {
        if (state === 'translating') {
          note = bubble('agent',
            `<div class="step"><span class="spin"></span><span>Translating the interface into ${esc(info.native)}...</span></div>`,
            'is-step');
        }
      });
      if (note) note.remove();
      if (result === 'failed') {
        showToast('Could not translate the interface, staying in English', 'error');
      }
      // Re-apply placeholders the layer does not own
      const el = $('composerInput');
      if (el && !el.disabled && currentAnalysis) {
        el.placeholder = tx('ph.ask', 'Ask me anything about this product...');
      }
    }

    const l = SafeByteVoice.langInfo;
    const el = $('composerInput');
    if (el && !el.disabled) {
      el.placeholder = l.code === 'en-IN'
        ? 'Ask me anything about this product...'
        : 'Ask in ' + l.native + '...';
    }

    if (conversationStarted) {
      says(l.code === 'en-IN'
        ? `Switching to English.`
        : `Right, I will answer in ${esc(l.native)} from here.` +
          (SafeByteVoice.canSpeak && !SafeByteVoice.hasVoiceFor(l.code)
            ? `<br><span class="msg-why">Your computer has no ${esc(l.label)} voice installed, so I can write it but not speak it. macOS adds them under System Settings, Accessibility, Spoken Content.</span>`
            : ''));
    }
  };

  window.toggleSpeakReplies = function () {
    if (!window.SafeByteVoice) return;
    const on = !SafeByteVoice.speakReplies;
    SafeByteVoice.setSpeakReplies(on);
    // There are two of these: one in the chat header, one on the landing page.
    ['speakToggle', 'landingSpeak'].forEach(id => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on
        ? tx('tip.speakOff', 'Stop reading answers aloud')
        : tx('tip.speak', 'Read answers aloud');
    });
    if (on) {
      const l = SafeByteVoice.langInfo;
      SafeByteVoice.speak(
        l.code === 'en-IN' ? 'Reading answers aloud.' : 'Voice on.', { force: true });
      if (!SafeByteVoice.hasVoiceFor(SafeByteVoice.lang)) {
        showToast('No ' + l.label + ' voice installed on this computer', 'info');
      }
    }
  };

  window.toggleMic = function () {
    if (!window.SafeByteVoice) return;
    const btn = $('micBtn'), input = $('composerInput');

    if (!SafeByteVoice.canListen) {
      showToast(tx('err.micUnsupported','Speech input needs Chrome, Edge or Safari'), 'error');
      return;
    }
    if (SafeByteVoice.listening) { SafeByteVoice.stopListening(); return; }

    const before = input ? input.placeholder : '';
    btn.classList.add('listening');
    if (input) input.placeholder = tx('ph.listening','Listening...');

    SafeByteVoice.listen(
      // final
      said => {
        if (!input) return;
        // Someone who just spoke expects to be answered out loud. Turning the
        // speaker on here means voice works the moment you use it, instead of
        // only after finding a toggle you had no reason to look for.
        if (!SafeByteVoice.speakReplies) {
          SafeByteVoice.setSpeakReplies(true);
          const sp = $('speakToggle');
          if (sp) { sp.classList.add('on'); sp.setAttribute('aria-pressed', 'true'); }
        }
        input.value = said;
        growComposer(input);
        // A question asked aloud should be answered without another tap.
        setTimeout(() => onComposerSubmit(), 180);
      },
      // partial, so words appear as they are spoken
      interim => { if (input) input.value = interim; },
      // ended
      err => {
        btn.classList.remove('listening');
        if (input) input.placeholder = before;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          showToast(tx('err.micBlocked','Microphone blocked. Allow it in the address bar.'), 'error');
        } else if (err === 'no-speech') {
          showToast(tx('err.noSpeech','I did not catch that'), 'info');
        } else if (err === 'unsupported') {
          showToast('Speech input not supported in this browser', 'error');
        }
      }
    );
  };

  /**
   * The microphone on the landing page, before any thread exists.
   *
   * Someone who cannot read the label is exactly the person who should not
   * have to find their way through an upload screen first. So: say "scan" and
   * the camera opens; say anything else and the agent takes the question.
   */
  window.landingListen = function () {
    if (!window.SafeByteVoice) return;
    const btn = $('landingMic');

    if (!SafeByteVoice.canListen) {
      showToast(tx('err.micUnsupported', 'Speech input needs Chrome, Edge or Safari'), 'error');
      return;
    }
    if (SafeByteVoice.listening) { SafeByteVoice.stopListening(); return; }

    // Someone speaking to it expects to be spoken back to.
    if (!SafeByteVoice.speakReplies) window.toggleSpeakReplies();

    if (btn) btn.classList.add('listening');
    showToast(tx('toast.listening', 'Listening, say what you need'), 'info');

    SafeByteVoice.listen(
      said => {
        // Any language: a spoken instruction to scan should just open the camera.
        if (/\b(scan|upload|photo|picture|camera|check|start|शुरू|स्कैन|फोटो|तपास|फोटो|படம்|ஸ்கேன்)\b/i.test(said)) {
          const inp = $('chatFileInput');
          if (inp) inp.click();
          return;
        }
        // Anything else is a question, and questions belong in the thread.
        startConversation();
        const el = $('composerInput');
        if (el) { el.value = said; growComposer(el); }
        setTimeout(() => onComposerSubmit(), 160);
      },
      null,
      err => {
        if (btn) btn.classList.remove('listening');
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          showToast(tx('err.micBlocked', 'Microphone blocked. Allow it in the address bar.'), 'error');
        } else if (err === 'no-speech') {
          showToast(tx('err.noSpeech', 'I did not catch that'), 'info');
        }
      }
    );
  };

  // -------------------------------------------------------------- opening
  // The landing page is the front door. The thread does not appear - and the
  // agent does not say anything - until there is actually a photo to discuss.
  let conversationStarted = false;

  function startConversation() {
    if (conversationStarted) return;
    conversationStarted = true;
    const landing = $('landing');
    if (landing) {
      landing.classList.add('landing-out');
      setTimeout(() => { landing.style.display = 'none'; }, 260);
    }
    const app = $('chatApp');
    if (app) app.hidden = false;
    document.body.classList.add('in-conversation');
    setStatus('online');
    wireDrop();
  }

  /** Drag & drop onto the landing page, before the thread exists. */
  function wireLandingDrop() {
    const z = $('landingZone');
    if (!z) return;
    ['dragenter', 'dragover'].forEach(k => z.addEventListener(k, e => {
      e.preventDefault(); z.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach(k => z.addEventListener(k, e => {
      e.preventDefault(); z.classList.remove('drag-over');
    }));
    z.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) receiveImage(f);
    });
  }

  function boot() {
    wireLandingDrop();
    fillLanguagePickers();
    // Someone who chose Marathi last time should not land on English.
    if (window.SafeByteI18N && window.SafeByteVoice) {
      const c0 = SafeByteVoice.lang;
      if (c0 !== 'en-IN') {
        SafeByteI18N.setLanguage(c0, SafeByteVoice.langInfo.ai);
      }
    }
    if (window.SafeByteVoice && SafeByteVoice.speakReplies) {
      ['speakToggle', 'landingSpeak'].forEach(id => {
        const b = $(id);
        if (b) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
      });
    }

    if (window.SafeByteVoice && !SafeByteVoice.canListen) {
      // Do not leave a button there that cannot do anything. Say why instead.
      ['micBtn', 'landingMic'].forEach(id => {
        const m = $(id);
        if (m) m.style.display = 'none';
      });
      const note = $('landingVoiceNote');
      if (note) note.hidden = false;
    }
    if (window.SafeByteVoice && !SafeByteVoice.canSpeak) {
      ['speakToggle', 'landingSpeak'].forEach(id => {
        const b = $(id);
        if (b) b.style.display = 'none';
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
