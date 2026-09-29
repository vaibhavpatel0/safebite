/* ============================================================================
 * SafeByte - medicine mode
 * ----------------------------------------------------------------------------
 * Different product, different law, different regulator.
 *
 * Food labelling sits under the Legal Metrology (Packaged Commodities) Rules
 * 2011 and the FSS (Labelling and Display) Regulations 2020, and FSSAI runs a
 * central licence registry anyone can query.
 *
 * Medicines sit under the Drugs and Cosmetics Rules 1945 - Rules 96 and 97 in
 * particular, as amended in 2018 - and manufacturing licences are issued by
 * STATE Licensing Authorities, not by one central body. That single fact
 * drives the most important design decision in this file: a licence we cannot
 * find is not evidence of anything. See assessDrugLicence().
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// What the law requires on a medicine label (Rule 96)
// ---------------------------------------------------------------------------
// Each entry is deterministic: it reads the extraction, it does not ask a
// model. `severity` separates an outright breach from something a pharmacist
// would want to look at.

const MEDICINE_CHECKS = [
  {
    key: 'genericName',
    label: 'Generic (proper) name',
    rule: 'Rule 96(1)(i)',
    test: i => !!i.genericName,
    detail: i => i.genericName || 'No generic / proper name found',
    why: 'The proper name is what the drug actually is. Rule 96 requires it to be printed more conspicuously than the brand name, and since the 2018 amendment at least two font sizes larger, so you can tell what you are taking regardless of what it is being sold as.'
  },
  {
    key: 'genericProminence',
    label: 'Generic name more prominent than brand',
    rule: 'Rule 96(1)(i), 2018 amendment',
    severity: 'warn',
    test: i => i.genericMoreProminent !== false,
    detail: i => i.genericMoreProminent === false
      ? 'Brand name appears larger than the generic name'
      : 'Generic name appears at least as prominent',
    why: 'Since 2018 the proper name must be at least two font sizes larger than the trade name for single and two-ingredient formulations. Brand-dominant labelling is how two different drugs end up looking like the same product.'
  },
  {
    key: 'composition',
    label: 'Composition with strengths',
    rule: 'Rule 96(1)(iii)',
    test: i => !!i.composition,
    detail: i => i.composition || 'Active ingredient content not declared',
    why: 'The amount of each active ingredient must be stated - per tablet, per 5 ml for oral liquids, per ml or as a percentage for injections. Without it a dose cannot be checked.'
  },
  {
    key: 'manufacturer',
    label: 'Manufacturer name',
    rule: 'Rule 96(1)(vi)',
    test: i => !!i.manufacturer,
    detail: i => i.manufacturer || 'Manufacturer not named',
    why: 'Someone must be legally accountable for the product, by name.'
  },
  {
    key: 'manufacturerAddress',
    label: 'Address of manufacturing premises',
    rule: 'Rule 96(1)(vi)',
    test: i => !!i.manufacturerAddress,
    detail: i => i.manufacturerAddress || 'Manufacturing address not printed',
    why: 'The rule requires the address of the premises where the drug was actually made, not merely a head office. It is what ties the batch to an inspectable site.'
  },
  {
    key: 'mfgLicNo',
    label: 'Manufacturing licence number',
    rule: 'Rule 96(1)(vii)',
    test: i => !!i.mfgLicNo,
    detail: i => i.mfgLicNo || 'No Mfg. Lic. No. / M.L. found',
    why: 'Must be printed and preceded by "Manufacturing Licence Number", "Mfg. Lic. No." or "M.L.". It identifies which State Licensing Authority permitted this factory to make this category of drug.'
  },
  {
    key: 'batchNo',
    label: 'Batch number',
    rule: 'Rule 96(1)(viii)',
    test: i => !!i.batchNo,
    detail: i => i.batchNo || 'No B. No. / Batch No. / Lot No. found',
    why: 'Preceded by "Batch No.", "B. No." or "Lot No.". Without it a recall cannot reach this pack - regulators withdraw by batch, not by brand.'
  },
  {
    key: 'mfgDate',
    label: 'Date of manufacture',
    rule: 'Rule 96(1)(ix)',
    test: i => !!i.mfgDate,
    detail: i => i.mfgDate || 'Manufacturing date not printed',
    why: 'Required alongside expiry so the shelf life actually granted can be checked.'
  },
  {
    key: 'expiryDate',
    label: 'Date of expiry',
    rule: 'Rule 96(1)(ix)',
    test: i => !!i.expiryDate,
    detail: i => i.expiryDate || 'EXPIRY DATE NOT PRINTED',
    why: 'The single most safety-critical particular on the pack. Shelf life may not exceed 60 months for most drugs. A medicine with no expiry date should not be taken.'
  },
  {
    key: 'netContent',
    label: 'Net contents',
    rule: 'Rule 96(1)(ii)',
    test: i => !!i.netContent,
    detail: i => i.netContent || 'Net quantity not declared',
    why: 'Number of tablets, or weight/volume in metric units.'
  },
  {
    key: 'mrp',
    label: 'Maximum retail price',
    rule: 'DPCO 2013',
    test: i => !!i.mrp,
    detail: i => i.mrp || 'MRP not printed',
    why: 'Required inclusive of all taxes under the Drugs (Prices Control) Order. Scheduled formulations additionally have a ceiling price set by the NPPA.'
  },
  {
    key: 'storage',
    label: 'Storage conditions',
    rule: 'Rule 96(1)',
    severity: 'warn',
    test: i => !!i.storageInstructions,
    detail: i => i.storageInstructions || 'No storage instruction printed',
    why: 'Many drugs lose potency above 25-30 degrees. Without an instruction you cannot know whether this one needed protecting.'
  }
];

// ---------------------------------------------------------------------------
// Schedule warnings - the part people actually get wrong
// ---------------------------------------------------------------------------

const DRUG_SCHEDULES = {
  H: {
    name: 'Schedule H',
    symbol: 'Rx',
    warning: 'Not to be sold by retail without the prescription of a Registered Medical Practitioner.',
    redLine: true,
    plain: 'Prescription-only. A pharmacist selling this without a prescription is breaking the law.'
  },
  H1: {
    name: 'Schedule H1',
    symbol: 'Rx',
    warning: 'It is dangerous to take this preparation except in accordance with the medical advice. Not to be sold by retail without the prescription of a Registered Medical Practitioner.',
    redLine: true,
    plain: 'Prescription-only and separately register-recorded. H1 covers most antibiotics and anti-TB drugs, where casual use drives resistance. The chemist must log the sale in a dedicated register kept for three years.'
  },
  X: {
    name: 'Schedule X',
    symbol: 'XRx',
    warning: 'To be sold by retail on the prescription of a Registered Medical Practitioner only.',
    redLine: true,
    plain: 'The most tightly controlled category - narcotic and psychotropic substances. The symbol must be in red, the prescription is retained by the chemist, and records are kept for two years.'
  },
  G: {
    name: 'Schedule G',
    symbol: null,
    warning: 'Caution: it is dangerous to take this preparation except under medical supervision.',
    redLine: true,
    plain: 'Requires medical supervision. Mostly cytotoxic and hormone preparations.'
  }
};

/**
 * Work out which schedule this pack declares, and whether it carries the
 * markings that schedule demands.
 */
function assessSchedule(info) {
  const text = [info.scheduleDeclared, info.warnings, info.rxSymbol, info.composition, info.rawScheduleText]
    .filter(Boolean).join(' ');

  let code = null;
  if (/schedule\s*h\s*1|schedule\s*h1|\bh1\b/i.test(text)) code = 'H1';
  else if (/schedule\s*x|\bxrx\b/i.test(text)) code = 'X';
  else if (/schedule\s*h\b/i.test(text)) code = 'H';
  else if (/schedule\s*g\b/i.test(text)) code = 'G';

  if (!code) {
    return {
      known: false,
      isPrescription: /\brx\b/i.test(text) || info.rxSymbol === true,
      note: 'No schedule marking found on the pack. Over-the-counter medicines carry none, so this may be perfectly correct - but if this is an antibiotic or a sedative, the absence is itself a problem.'
    };
  }

  const sch = DRUG_SCHEDULES[code];
  const declared = String(info.warnings || '') + ' ' + String(info.scheduleDeclared || '');

  // Compare loosely: wording varies in punctuation and case, and OCR is noisy.
  const key = sch.warning.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(w => w.length > 4);
  const got = declared.toLowerCase().replace(/[^a-z ]/g, '');
  const hits = key.filter(w => got.includes(w)).length;
  const warningPresent = key.length ? (hits / key.length) >= 0.5 : false;

  return {
    known: true,
    code,
    name: sch.name,
    symbol: sch.symbol,
    isPrescription: true,
    requiredWarning: sch.warning,
    warningPresent,
    symbolPresent: info.rxSymbol === true || new RegExp(sch.symbol === 'XRx' ? 'xrx' : '\\brx\\b', 'i').test(text),
    redLineRequired: sch.redLine,
    redLinePresent: info.redLinePresent === true,
    plain: sch.plain
  };
}

// ---------------------------------------------------------------------------
// The manufacturing licence
// ---------------------------------------------------------------------------

/**
 * Indian drug manufacturing licences are granted by STATE Licensing
 * Authorities under Forms 25 / 28 (and 20B / 21B for sale). There is no single
 * public central registry covering every one of them, and the national
 * verification portal is behind a captcha we must not and will not bypass.
 *
 * So this function deliberately does NOT return a verdict on authenticity.
 * It reports the shape of the number and points at the authority that can
 * actually answer. Telling someone their medicine is counterfeit on the basis
 * of a failed lookup would be reckless; so would telling them it is genuine.
 */
function assessDrugLicence(info) {
  const raw = (info.mfgLicNo || '').trim();

  if (!raw) {
    return {
      present: false,
      verdict: 'No manufacturing licence number printed',
      meaning: 'Rule 96(1)(vii) requires it. Its absence is a labelling breach in itself, and it also means there is no way to trace which authority permitted this product to be made.',
      action: 'report'
    };
  }

  // Forms seen in practice: "MFG/25/2019", "KTK/25/2018", "MNB/07/33/2015",
  // "25/UA/2020", plain numerics. Too varied for a strict pattern - so we
  // check only that it is plausible, and say so honestly.
  const looksPlausible = /[0-9]/.test(raw) && raw.replace(/[^A-Za-z0-9]/g, '').length >= 4;

  // Form 25 = manufacture for sale of allopathic drugs; 28 = specified drugs
  // needing additional conditions; 20B/21B = wholesale; 25D/28D = repacking.
  const formMatch = raw.match(/\b(25D?|28D?|20B|21B|MFG)\b/i);

  return {
    present: true,
    number: raw,
    looksPlausible,
    form: formMatch ? formMatch[1].toUpperCase() : null,
    formMeaning: formMatch ? ({
      '25': 'Form 25, licence to manufacture allopathic drugs for sale',
      '25D': 'Form 25D, licence to repack drugs for sale',
      '28': 'Form 28, licence to manufacture drugs requiring additional conditions',
      '28D': 'Form 28D, repacking under additional conditions',
      '20B': 'Form 20B, wholesale licence',
      '21B': 'Form 21B, wholesale licence (Schedule C/C1)',
      'MFG': 'Manufacturing licence'
    })[formMatch[1].toUpperCase()] || null : null,

    // The honest position, stated plainly and repeated in the UI.
    verdict: 'Printed, not independently verified',
    meaning: 'Drug manufacturing licences in India are issued by State Licensing Authorities, not by one central registry. There is no open national database I can query, and the official verification page is protected by a captcha that I will not work around. So I can confirm the number is printed and see what form it looks like, I cannot confirm from here that it is genuine, and I will not suggest that it is not.',
    action: 'verify-yourself'
  };
}

const DRUG_VERIFY_PORTAL = 'https://statedrugs.gov.in/SFDA/third-part-licence-verification.html';
const CDSCO_PORTAL = 'https://cdscoonline.gov.in/CDSCO/homepage';

// ---------------------------------------------------------------------------
// Run everything
// ---------------------------------------------------------------------------

function runMedicineChecks(info) {
  const checks = MEDICINE_CHECKS.map(c => {
    const passed = !!c.test(info);
    return {
      key: c.key,
      label: c.label,
      rule: c.rule,
      why: c.why,
      status: passed ? 'pass' : (c.severity === 'warn' ? 'warn' : 'fail'),
      details: c.detail(info)
    };
  });

  const schedule = assessSchedule(info);

  // Schedule markings become checks only when the pack declares a schedule -
  // an OTC medicine legitimately has none, and flagging that would be wrong.
  if (schedule.known) {
    checks.push({
      key: 'scheduleWarning',
      label: `${schedule.name} warning text`,
      rule: 'Rule 97',
      why: `A ${schedule.name} drug must carry, in black on a red rectangular box: "${schedule.requiredWarning}"`,
      status: schedule.warningPresent ? 'pass' : 'fail',
      details: schedule.warningPresent ? 'Required warning found' : 'Required warning text not found on the pack'
    });
    checks.push({
      key: 'scheduleSymbol',
      label: `${schedule.symbol} symbol`,
      rule: 'Rule 97',
      why: `${schedule.name} requires the ${schedule.symbol} symbol at the top left corner${schedule.code === 'X' ? ', printed in red' : ''}.`,
      status: schedule.symbolPresent ? 'pass' : 'warn',
      details: schedule.symbolPresent ? 'Symbol visible' : 'Symbol not seen in these photos'
    });
    if (schedule.redLineRequired) {
      checks.push({
        key: 'redLine',
        label: 'Red vertical line',
        rule: 'Rule 97(1)(d)',
        why: 'Schedule G, H and X drugs must carry a conspicuous red vertical line on the left side of the pack, at least 1 mm wide. It is the marking a pharmacist reads at a glance.',
        status: schedule.redLinePresent ? 'pass' : 'warn',
        details: schedule.redLinePresent ? 'Red line visible' : 'Red line not visible in these photos'
      });
    }
  }

  const licence = assessDrugLicence(info);
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  return {
    kind: 'medicine',
    checks,
    schedule,
    licence,
    violations: checks.filter(c => c.status === 'fail').map(c => c.label),
    failCount,
    warnCount,
    overall: failCount === 0 && warnCount === 0 ? 'compliant'
           : failCount === 0 ? 'potential' : 'non-compliant'
  };
}

// Expiry is worth its own answer, because it is the one a person acts on today.
function expiryStatus(info) {
  const raw = (info.expiryDate || '').trim();
  if (!raw) return { known: false, message: 'No expiry date printed on this pack.' };

  let month = null, year = null;

  // Numeric: 11/2027, 03-27, 12.2026
  const num = raw.match(/(0?[1-9]|1[0-2])\s*[\/\-. ]\s*(20\d{2}|\d{2})/);
  if (num) { month = parseInt(num[1], 10); year = parseInt(num[2], 10); }

  // Alphabetic: SEP 2026, Sept 26, DEC/2027 - at least as common on Indian
  // medicine packs as the numeric form, and worth reading properly.
  if (month === null) {
    const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const alpha = raw.match(/([a-z]{3,9})\s*[\/\-. ]?\s*(20\d{2}|\d{2})\b/i);
    if (alpha) {
      const idx = MONTHS.indexOf(alpha[1].slice(0, 3).toLowerCase());
      if (idx >= 0) { month = idx + 1; year = parseInt(alpha[2], 10); }
    }
  }

  if (month === null || year === null) {
    return { known: false, raw, message: `Expiry printed as "${raw}", I could not read it as a date.` };
  }
  if (year < 100) year += 2000;
  const end = new Date(year, month, 0, 23, 59, 59);   // last day of that month
  const now = new Date();
  const days = Math.round((end - now) / 86400000);

  if (days < 0) return { known: true, expired: true, days: -days, raw, message: `Expired ${-days} day${-days === 1 ? '' : 's'} ago. Do not take it.` };
  if (days <= 60) return { known: true, expired: false, soon: true, days, raw, message: `Expires in ${days} day${days === 1 ? '' : 's'}.` };
  return { known: true, expired: false, days, raw, message: `Valid for about ${Math.round(days / 30)} more months.` };
}

if (typeof window !== 'undefined') {
  window.MEDICINE_CHECKS = MEDICINE_CHECKS;
  window.DRUG_SCHEDULES = DRUG_SCHEDULES;
  window.assessSchedule = assessSchedule;
  window.assessDrugLicence = assessDrugLicence;
  window.runMedicineChecks = runMedicineChecks;
  window.expiryStatus = expiryStatus;
  window.DRUG_VERIFY_PORTAL = DRUG_VERIFY_PORTAL;
  window.CDSCO_PORTAL = CDSCO_PORTAL;
}
