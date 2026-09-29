/* ============================================================================
 * SafeByte - handoff between pages
 * ----------------------------------------------------------------------------
 * The chat, the full report and the complaint desk are three pages on one
 * origin. This is how the current scan travels between them.
 *
 * The scan image is deliberately NOT stored: a downscaled photo is still a few
 * hundred KB of base64 and localStorage gives about 5MB for everything. Storing
 * it is the quickest way to make saving fail silently and lose the scan.
 * ==========================================================================*/

window.SafeByteStore = (function () {
  'use strict';

  const KEY = 'safebyte_current_scan';

  /** Strip anything heavy or circular before handing it to localStorage. */
  function slim(data) {
    if (!data) return null;
    const out = {
      info: data.info,
      compliance: data.compliance,
      fssaiResult: data.fssaiResult,
      fssaiResults: data.fssaiResults,
      fssaiMulti: data.fssaiMulti,
      packaging: data.packaging || null,
      timestamp: data.timestamp || Date.now()
    };
    return out;
  }

  // fssaiResult.multi points back at fssaiMulti, whose primaryResult IS
  // fssaiResult - a cycle that makes JSON.stringify throw and the save fail
  // silently. Dropping every `multi` key anywhere in the tree breaks it
  // wherever it appears, rather than only on the copy we happen to hold.
  function dropCycles(key, value) {
    if (key === 'multi') return undefined;
    return value;
  }

  return {
    save(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(slim(data), dropCycles));
        return true;
      } catch (e) {
        console.warn('[SafeByte] could not save scan for handoff:', e);
        return false;
      }
    },

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        // Put the back-reference the report renderer expects
        if (d && d.fssaiResult && d.fssaiMulti) d.fssaiResult.multi = d.fssaiMulti;
        return d;
      } catch (e) {
        console.warn('[SafeByte] could not read saved scan:', e);
        return null;
      }
    },

    clear() {
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
  };
})();
