/* ============================================================================
 * SafeByte - voice
 * ----------------------------------------------------------------------------
 * Someone standing in a shop holding a packet, squinting at small print, is
 * not in a good position to type. And a label check is useless to a person who
 * cannot read the label - or cannot read English.
 *
 * So: speak to it, and it speaks back, in the language the person picks.
 *
 * Built on the browser's own Web Speech API. No API key, no cost, no extra
 * request to any provider. Recognition quality varies by browser (Chrome is
 * much the best on desktop); synthesis depends on which voices the operating
 * system has installed, which is why pickVoice() degrades carefully rather
 * than assuming a voice exists.
 * ==========================================================================*/

window.SafeByteVoice = (function () {
  'use strict';

  // Indian languages the Web Speech API generally recognises, plus English.
  // `speak` is the BCP-47 tag; `ai` is what we tell the model to write in.
  const LANGUAGES = [
    { code: 'en-IN', label: 'English',    native: 'English',   ai: 'English' },
    { code: 'hi-IN', label: 'Hindi',      native: 'हिन्दी',      ai: 'Hindi (Devanagari script)' },
    { code: 'mr-IN', label: 'Marathi',    native: 'मराठी',      ai: 'Marathi (Devanagari script)' },
    { code: 'bn-IN', label: 'Bengali',    native: 'বাংলা',      ai: 'Bengali' },
    { code: 'ta-IN', label: 'Tamil',      native: 'தமிழ்',      ai: 'Tamil' },
    { code: 'te-IN', label: 'Telugu',     native: 'తెలుగు',     ai: 'Telugu' },
    { code: 'kn-IN', label: 'Kannada',    native: 'ಕನ್ನಡ',      ai: 'Kannada' },
    { code: 'ml-IN', label: 'Malayalam',  native: 'മലയാളം',    ai: 'Malayalam' },
    { code: 'gu-IN', label: 'Gujarati',   native: 'ગુજરાતી',     ai: 'Gujarati' },
    { code: 'pa-IN', label: 'Punjabi',    native: 'ਪੰਜਾਬੀ',      ai: 'Punjabi (Gurmukhi script)' },
    { code: 'ur-IN', label: 'Urdu',       native: 'اردو',       ai: 'Urdu' }
  ];

  const STORE_KEY = 'safebyte_voice_prefs';

  const state = {
    lang: 'en-IN',
    speakReplies: false,   // off until the person asks for it
    listening: false,
    recognition: null,
    voices: []
  };

  // ------------------------------------------------------------- preferences
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (saved.lang && LANGUAGES.some(l => l.code === saved.lang)) state.lang = saved.lang;
    if (typeof saved.speakReplies === 'boolean') state.speakReplies = saved.speakReplies;
  } catch (e) { /* first run, or storage blocked */ }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lang: state.lang, speakReplies: state.speakReplies
      }));
    } catch (e) {}
  }

  const current = () => LANGUAGES.find(l => l.code === state.lang) || LANGUAGES[0];

  // ------------------------------------------------------------ availability
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canListen = !!SR;
  const canSpeak = 'speechSynthesis' in window;

  function loadVoices() {
    if (!canSpeak) return;
    state.voices = window.speechSynthesis.getVoices() || [];
  }
  if (canSpeak) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  /**
   * Find the best installed voice for a language tag. Falls back from the
   * exact tag to the base language, and finally to nothing - in which case the
   * browser uses its default rather than staying silent.
   */
  function pickVoice(tag) {
    if (!state.voices.length) loadVoices();
    const base = tag.split('-')[0];
    return state.voices.find(v => v.lang === tag)
        || state.voices.find(v => v.lang && v.lang.replace('_', '-') === tag)
        || state.voices.find(v => v.lang && v.lang.toLowerCase().startsWith(base))
        || null;
  }

  /** Is there actually a voice installed for the chosen language? */
  function hasVoiceFor(tag) { return !!pickVoice(tag); }

  // ------------------------------------------------------------------ speak
  /**
   * Read text aloud. HTML is stripped first: the agent writes bubbles, not
   * plain strings, and nobody wants to hear a span tag read out.
   */
  function speak(html, opts) {
    if (!canSpeak) return;
    const o = opts || {};
    if (!o.force && !state.speakReplies) return;

    const text = String(html || '')
      .replace(/<br\s*\/?>/gi, '. ')
      .replace(/<\/(p|div|li|tr)>/gi, '. ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();

    if (!text || text.length < 2) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 600));
    const v = pickVoice(state.lang);
    if (v) u.voice = v;
    u.lang = state.lang;
    u.rate = 0.98;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (canSpeak) window.speechSynthesis.cancel();
  }

  // ----------------------------------------------------------------- listen
  /**
   * Listen once and hand the transcript back. onPartial fires as the person
   * is still talking, so the composer can show words appearing.
   */
  function listen(onFinal, onPartial, onEnd) {
    if (!canListen) { if (onEnd) onEnd('unsupported'); return; }
    if (state.listening) { stopListening(); return; }

    stopSpeaking();   // never listen to ourselves

    const r = new SR();
    state.recognition = r;
    r.lang = state.lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;

    let finalText = '';

    r.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (interim && onPartial) onPartial(interim);
    };

    r.onerror = ev => {
      state.listening = false;
      if (onEnd) onEnd(ev.error || 'error');
    };

    r.onend = () => {
      state.listening = false;
      const said = finalText.trim();
      if (said && onFinal) onFinal(said);
      if (onEnd) onEnd(said ? null : 'no-speech');
    };

    try {
      r.start();
      state.listening = true;
    } catch (e) {
      state.listening = false;
      if (onEnd) onEnd('start-failed');
    }
  }

  function stopListening() {
    if (state.recognition && state.listening) {
      try { state.recognition.stop(); } catch (e) {}
    }
    state.listening = false;
  }

  // --------------------------------------------------------- for the model
  /**
   * What to append to a prompt so the reply comes back in the chosen
   * language. Returns '' for English so we do not waste tokens saying
   * "answer in English" to a model that already would.
   */
  function promptSuffix() {
    const l = current();
    if (l.code === 'en-IN') return '';
    return `\n\nIMPORTANT: Write your entire answer in ${l.ai}. Keep brand names, ` +
           `licence numbers, chemical and drug names in their original form, but ` +
           `everything you write around them must be in ${l.ai}. Use plain everyday ` +
           `words that an ordinary shopper would use, not formal or literary register.`;
  }

  return {
    LANGUAGES,
    canListen, canSpeak,
    get lang() { return state.lang; },
    get langInfo() { return current(); },
    get speakReplies() { return state.speakReplies; },
    get listening() { return state.listening; },

    setLang(code) {
      if (!LANGUAGES.some(l => l.code === code)) return;
      state.lang = code;
      stopSpeaking();
      save();
    },
    setSpeakReplies(on) {
      state.speakReplies = !!on;
      if (!on) stopSpeaking();
      save();
    },

    speak, stopSpeaking, listen, stopListening,
    hasVoiceFor, promptSuffix
  };
})();
