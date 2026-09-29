/* ============================================================================
 * SafeByte - interface language
 * ----------------------------------------------------------------------------
 * Choosing Hindi and then reading an English interface helps nobody. This
 * translates the whole surface: headings, buttons, placeholders, the agent's
 * own scripted lines, the checklist labels, the summary table.
 *
 * Hindi and Marathi are written out in full below, so they are instant and
 * work with no network. The remaining languages are translated once by the
 * model and cached in localStorage; after the first switch they are instant
 * too. If that call fails the interface stays English rather than ending up
 * half-translated.
 *
 * Product names, brand names, licence numbers, drug names and the names of
 * laws are deliberately NOT translated.
 * ==========================================================================*/

window.SafeByteI18N = (function () {
  'use strict';

  // The English source. Every user-visible string in the interface lives here
  // under a stable key, so a translation is a value swap and nothing else.
  const EN = {
    "tip.landingMic": "Speak to it",
    "voice.noRecog": "Speaking to it needs Chrome, Edge or Safari. Everything else works here.",
    "toast.listening": "Listening, say what you need",
    // -- landing --
    'badge':            'AI Food Packaging Compliance',
    'tagline':          'What is SafeByte? An AI agent that looks at a photo of any food package and instantly verifies its government-approved license.',
    'upload.title':     'Upload package image',
    'upload.hint':      'or drag & drop here, JPG, PNG',
    'upload.or':        'or',
    'upload.camera':    'Capture with Camera',
    'landing.history':  'See your history',
    'lang.label':       'Language',

    // -- chrome --
    'status.online':    'online',
    'status.typing':    'typing...',
    'status.thinking':  'thinking...',
    'tip.history':      'Past scans',
    'tip.newscan':      'New scan',
    'tip.speak':        'Read answers aloud',
    'tip.speakOff':     'Stop reading answers aloud',
    'tip.mic':          'Speak instead of typing',
    'tip.attach':       'Add a package photo',
    'tip.send':         'Send',

    // -- composer --
    'ph.start':         'Send a photo of a food package to begin...',
    'ph.ask':           'Ask me anything about this product...',
    'ph.askMed':        'Ask me anything about this medicine...',
    'ph.listening':     'Listening...',
    'ph.more':          'add another, or say go...',
    'ph.another':       'Send another photo...',
    'ph.yesno':         'yes / no...',

    // -- collecting photos --
    'shots.one':        'Got it. If the pack has more to show, the back, the strip, the flap with the expiry, add those too and I will read them together. Otherwise I will start.',
    'shots.many':       'photos so far. Add more, or tell me to go.',
    'chip.analyse':     'Analyse now',
    'chip.addPhoto':    'Add another photo',

    // -- steps --
    'step.reading':     'Reading the label',
    'step.read':        'Label read',
    'step.failRead':    'I could not read that image',
    'step.checkingLic': 'Checking the licence against the FoSCoS government database',
    'step.licChecked':  'Licence checked',
    'step.ingredients': 'Reading through the ingredients',
    'step.ingredientsDone': 'Ingredients analysed',

    // -- classification --
    'notfood.title':    'This does not look like a food package to me.',
    'notfood.ask':      'I check food labels against FSSAI and Legal Metrology rules, which would not mean anything here. Is it actually a packaged food or drink?',
    'chip.isFood':      'Yes, it is food',
    'chip.notFood':     'No, my mistake',
    'blurry':           'The label is not legible enough for me to be confident. A verdict from this photo would be guesswork, and flagging a violation that is not really there is worse than asking you to try again.',
    'chip.retake':      'I will retake it',
    'chip.continue':    'Continue anyway',

    // -- verdicts --
    'verdict.ok':       'Compliant',
    'verdict.okLine':   'Every mandatory declaration is present and correctly formed.',
    'verdict.bad':      'violations',
    'verdict.badLine':  'This pack does not meet FSSAI / Legal Metrology requirements.',
    'verdict.warn':     'Needs review',
    'verdict.govOk':    'Licence is live on the government FoSCoS database',
    'verdict.govBad':   'Licence is registered to a different company than the brand on this pack',

    // -- checklist --
    'check.intro':      'Here is the',
    'check.introEnd':   'point label check. Tap any line and I will explain that one properly.',
    'check.cleared':    'cleared',
    'note.missing':     'missing',
    'note.present':     'present',
    'note.review':      'needs a look',

    // -- packaging --
    'pack.intro':       'Now the packaging itself, the part almost nobody reads.',
    'pack.foodContact': 'Food contact',
    'pack.after':       'After you finish it',
    'pack.why':         'Why does this matter?',
    'pack.safe':        'Safe',
    'pack.safeFood':    'Safe for the food',
    'pack.question':    'Questionable',
    'pack.unknown':     'Unknown',
    'pack.recyclable':  'recyclable',
    'pack.partly':      'partly recyclable',
    'pack.notRecycl':   'not recyclable',

    // -- summary --
    'sum.pulling':      'So, pulling it together.',
    'sum.what':         'What I checked',
    'sum.where':        'Where it stands',
    'sum.missing':      'Missing',
    'sum.review':       'Needs review',
    'sum.present':      'Present',
    'sum.notVerified':  'Not verified',
    'sum.verified':     'Verified with government',
    'sum.otherCompany': 'Registered to another company',
    'sum.inDate':       'In date',
    'sum.expired':      'EXPIRED',
    'sum.expiringSoon': 'Expiring soon',
    'sum.rxOnly':       'Prescription only',

    // -- links --
    'link.onePage':     'Everything above, on a single page you can scroll, print or keep open beside the pack:',
    'link.report':      'Open the full report',
    'link.reportSub':   'Every check, the FoSCoS licence comparison, extracted label data and the packaging, plus you can keep chatting from there',
    'link.complaint':   'Open the complaint desk',
    'link.complaintSub':'Your prepared complaint on the left, the official FoSCoS form on the right, one tab',

    // -- chips --
    'chip.whoEat':      'Who can eat this?',
    'chip.explain':     'Explain the verdict',
    'chip.report':      'How do I report this?',
    'chip.healthy':     'How healthy is it?',
    'chip.medFor':      'What is this medicine for?',
    'chip.sideEffects': 'Side effects to know',
    'chip.notPrinted':  'Not printed on the pack',
    'chip.choosePhoto': 'Choose a photo',

    // -- medicine --
    'med.isMedicine':   'This is a medicine, not a food product, so I am checking it against the Drugs and Cosmetics Rules 1945 instead of the food rules.',
    'med.expired':      'This medicine has expired.',
    'med.expiringSoon': 'Expiring soon.',
    'med.doNotTake':    'Do not take it. Return it to the pharmacy or dispose of it safely; do not flush it.',
    'med.labelOk':      'Label is compliant',
    'med.missing':      'mandatory particulars missing',
    'med.notDoctor':    'That is the label. I should be plain about what I am not: I check whether the pack carries what the law requires, and I can explain what the drug is. I am not a doctor or a pharmacist, and nothing here is medical advice about whether you should take it.',
    'med.licenceTitle': 'Now the manufacturing licence, and here I have to be careful with you.',
    'med.verifySelf':   'Verify it yourself on the government portal',
    'med.copyLicence':  'Copy the licence number',

    // -- errors --
    'err.readFailed':   'Something went wrong reading it',
    'err.tryAnother':   'Try another photo, or check the terminal if this keeps happening.',
    'err.noAnswer':     'I could not get an answer just then',
    'err.askAgain':     'Ask again in a moment.',
    'err.micBlocked':   'Microphone blocked. Allow it in the address bar.',
    'err.noSpeech':     'I did not catch that',
    'err.micUnsupported':'Speech input needs Chrome, Edge or Safari',

    // -- history drawer --
    'chk.manufacturer': 'Manufacturer / Packer Name',
    'chk.address': 'Manufacturer Address',
    'chk.netqty': 'Net Quantity Declaration',
    'chk.mrp': 'MRP (Inclusive of all taxes)',
    'chk.mfgdate': 'Date of Manufacturing',
    'chk.expiry': 'Best Before / Expiry Date',
    'chk.batch': 'Batch / Lot Number',
    'chk.care': 'Consumer Care Details',
    'chk.fssai': 'FSSAI Licence Number Present',
    'chk.ingredients': 'Ingredients List',
    'chk.font': 'Font Size & Readability',
    'chk.claims': 'Misleading / Non-standard Claims',
    'sum.fssaiLic': 'FSSAI licence',
    'sum.packaging': 'Packaging',
    'sum.safeNotRecycl': 'Safe for food, not recyclable',
    'sum.safeRecycl': 'Safe for food, recyclable',
    'sum.safeHard': 'Safe for food, hard to recycle',
    'sum.noMarking': 'No material marking',
    'sum.allPresent': 'All 12 mandatory declarations',
    'close.missing': 'mandatory declarations missing.',
    'close.breach': 'That is a breach of the Legal Metrology (Packaged Commodities) Rules, 2011, and you can report it.',
    'close.nothingIllegal': 'Nothing illegal, but some items are worth a second look.',
    'close.inOrder': 'This label is in order. Every mandatory declaration is present and the licence checks out.',
    'drawer.title':     'Past scans',
    'drawer.empty':     'No scans yet. Send a package photo to start.',
    'drawer.close':     'Close',
    'divider.newScan':  'New scan',
    'divider.history':  'From your history'
  };

  // Hand-written so the two most likely demo languages need no network and
  // cannot half-load. Checked for register: plain spoken Hindi/Marathi, not
  // literary or officialese.
  const HI = {
    "tip.landingMic": "बोलकर बताइए",
    "voice.noRecog": "बोलकर बताने के लिए Chrome, Edge या Safari चाहिए। बाकी सब यहाँ चलता है।",
    "toast.listening": "सुन रहा हूँ, बोलिए",
    'badge': 'AI खाद्य पैकेजिंग अनुपालन',
    'tagline': 'SafeByte क्या है? एक AI एजेंट जो किसी भी खाद्य पैकेट की फोटो देखकर उसका सरकारी लाइसेंस तुरंत जाँचता है।',
    'upload.title': 'पैकेट की फोटो अपलोड करें',
    'upload.hint': 'या यहाँ खींचकर छोड़ें, JPG, PNG',
    'upload.or': 'या',
    'upload.camera': 'कैमरे से फोटो लें',
    'landing.history': 'अपना इतिहास देखें',
    'lang.label': 'भाषा',
    'status.online': 'ऑनलाइन',
    'status.typing': 'लिख रहा हूँ...',
    'status.thinking': 'सोच रहा हूँ...',
    'tip.history': 'पुरानी जाँच',
    'tip.newscan': 'नई जाँच',
    'tip.speak': 'जवाब बोलकर सुनाएँ',
    'tip.speakOff': 'बोलना बंद करें',
    'tip.mic': 'टाइप करने के बजाय बोलें',
    'tip.attach': 'पैकेट की फोटो जोड़ें',
    'tip.send': 'भेजें',
    'ph.start': 'शुरू करने के लिए खाद्य पैकेट की फोटो भेजें...',
    'ph.ask': 'इस उत्पाद के बारे में कुछ भी पूछें...',
    'ph.askMed': 'इस दवा के बारे में कुछ भी पूछें...',
    'ph.listening': 'सुन रहा हूँ...',
    'ph.more': 'और जोड़ें, या कहें शुरू करो...',
    'ph.another': 'दूसरी फोटो भेजें...',
    'ph.yesno': 'हाँ / नहीं...',
    'shots.one': 'मिल गई। अगर पैकेट पर और कुछ दिखाना है, जैसे पीछे का हिस्सा या एक्सपायरी वाली जगह, तो वो भी भेजें, मैं सब एक साथ पढ़ूँगा। वरना मैं शुरू करता हूँ।',
    'shots.many': 'फोटो अब तक। और भेजें, या कहें शुरू करो।',
    'chip.analyse': 'अभी जाँचें',
    'chip.addPhoto': 'एक और फोटो जोड़ें',
    'step.reading': 'लेबल पढ़ रहा हूँ',
    'step.read': 'लेबल पढ़ लिया',
    'step.failRead': 'मैं यह फोटो नहीं पढ़ सका',
    'step.checkingLic': 'FoSCoS सरकारी डेटाबेस में लाइसेंस जाँच रहा हूँ',
    'step.licChecked': 'परवाना जाँचा',
    'step.ingredients': 'सामग्री पढ़ रहा हूँ',
    'step.ingredientsDone': 'सामग्री की जाँच पूरी',
    'notfood.title': 'यह मुझे खाद्य पैकेट नहीं लग रहा।',
    'notfood.ask': 'मैं खाद्य लेबल को FSSAI और लीगल मेट्रोलॉजी नियमों से जाँचता हूँ, जो यहाँ लागू नहीं होंगे। क्या यह सचमुच पैकेट बंद खाना या पेय है?',
    'chip.isFood': 'हाँ, यह खाना है',
    'chip.notFood': 'नहीं, मेरी गलती',
    'blurry': 'लेबल इतना साफ नहीं है कि मैं भरोसे से कुछ कह सकूँ। इस फोटो से निकाला नतीजा अंदाज़ा ही होगा, और झूठा उल्लंघन बताने से बेहतर है कि मैं आपसे दोबारा फोटो माँगूँ।',
    'chip.retake': 'मैं दोबारा फोटो लूँगा',
    'chip.continue': 'फिर भी आगे बढ़ें',
    'verdict.ok': 'नियमों के अनुसार सही',
    'verdict.okLine': 'हर ज़रूरी जानकारी पैकेट पर मौजूद है और सही ढंग से लिखी है।',
    'verdict.bad': 'उल्लंघन',
    'verdict.badLine': 'यह पैकेट FSSAI / लीगल मेट्रोलॉजी की शर्तें पूरी नहीं करता।',
    'verdict.warn': 'जाँच की ज़रूरत',
    'verdict.govOk': 'लाइसेंस सरकारी FoSCoS डेटाबेस में चालू है',
    'verdict.govBad': 'लाइसेंस पैकेट पर लिखे ब्रांड से अलग कंपनी के नाम पर है',
    'check.intro': 'यह रहा',
    'check.introEnd': 'बिंदुओं की लेबल जाँच। किसी भी लाइन पर टैप करें, मैं उसे ठीक से समझाऊँगा।',
    'check.cleared': 'सही पाए गए',
    'note.missing': 'गायब',
    'note.present': 'मौजूद',
    'note.review': 'देखने लायक',
    'pack.intro': 'अब पैकेजिंग की बात, जिसे लगभग कोई नहीं पढ़ता।',
    'pack.foodContact': 'खाने के संपर्क में',
    'pack.after': 'इस्तेमाल के बाद',
    'pack.why': 'यह क्यों मायने रखता है?',
    'pack.safe': 'सुरक्षित',
    'pack.safeFood': 'खाने के लिए सुरक्षित',
    'pack.question': 'संदेहजनक',
    'pack.unknown': 'पता नहीं',
    'pack.recyclable': 'रीसायकल हो सकता है',
    'pack.partly': 'आंशिक रूप से रीसायकल',
    'pack.notRecycl': 'रीसायकल नहीं हो सकता',
    'sum.pulling': 'तो, सब मिलाकर।',
    'sum.what': 'मैंने क्या जाँचा',
    'sum.where': 'क्या स्थिति है',
    'sum.missing': 'गायब',
    'sum.review': 'जाँच ज़रूरी',
    'sum.present': 'मौजूद',
    'sum.notVerified': 'जाँच नहीं हुई',
    'sum.verified': 'सरकार से सत्यापित',
    'sum.otherCompany': 'दूसरी कंपनी के नाम पर',
    'sum.inDate': 'चालू है',
    'sum.expired': 'एक्सपायर हो चुकी',
    'sum.expiringSoon': 'जल्द एक्सपायर',
    'sum.rxOnly': 'सिर्फ डॉक्टर की पर्ची पर',
    'link.onePage': 'ऊपर की सारी जानकारी एक ही पेज पर, जिसे आप पढ़ सकते हैं, प्रिंट कर सकते हैं या पैकेट के साथ खुला रख सकते हैं:',
    'link.report': 'पूरी रिपोर्ट खोलें',
    'link.reportSub': 'हर जाँच, FoSCoS लाइसेंस की तुलना, लेबल से निकाली जानकारी और पैकेजिंग, और वहाँ से बातचीत भी जारी रख सकते हैं',
    'link.complaint': 'शिकायत डेस्क खोलें',
    'link.complaintSub': 'बाईं ओर आपकी तैयार शिकायत, दाईं ओर सरकारी FoSCoS फॉर्म, एक ही टैब में',
    'chip.whoEat': 'इसे कौन खा सकता है?',
    'chip.explain': 'नतीजा समझाइए',
    'chip.report': 'शिकायत कैसे करूँ?',
    'chip.healthy': 'यह कितना सेहतमंद है?',
    'chip.medFor': 'यह दवा किस लिए है?',
    'chip.sideEffects': 'साइड इफेक्ट क्या हैं?',
    'chip.notPrinted': 'पैकेट पर छपा ही नहीं है',
    'chip.choosePhoto': 'फोटो चुनें',
    'med.isMedicine': 'यह दवा है, खाद्य उत्पाद नहीं, इसलिए मैं इसे खाद्य नियमों के बजाय ड्रग्स एंड कॉस्मेटिक्स रूल्स 1945 से जाँच रहा हूँ।',
    'med.expired': 'यह दवा एक्सपायर हो चुकी है।',
    'med.expiringSoon': 'जल्द एक्सपायर हो रही है।',
    'med.doNotTake': 'इसे न लें। दवा दुकान पर वापस करें या सुरक्षित तरीके से फेंकें; नाली में न बहाएँ।',
    'med.labelOk': 'लेबल नियमों के अनुसार सही है',
    'med.missing': 'ज़रूरी जानकारी गायब',
    'med.notDoctor': 'यह रही लेबल की जाँच। मैं साफ कह दूँ कि मैं क्या नहीं हूँ: मैं देखता हूँ कि पैकेट पर कानून के मुताबिक सब लिखा है या नहीं, और दवा क्या है यह समझा सकता हूँ। मैं डॉक्टर या फार्मासिस्ट नहीं हूँ, और यह सलाह नहीं है कि आपको दवा लेनी चाहिए या नहीं।',
    'med.licenceTitle': 'अब निर्माण लाइसेंस की बात, और यहाँ मुझे आपके साथ सावधान रहना होगा।',
    'med.verifySelf': 'सरकारी पोर्टल पर खुद जाँचें',
    'med.copyLicence': 'लाइसेंस नंबर कॉपी करें',
    'err.readFailed': 'इसे पढ़ने में कुछ गड़बड़ हुई',
    'err.tryAnother': 'दूसरी फोटो आज़माएँ, या अगर बार-बार हो रहा है तो टर्मिनल देखें।',
    'err.noAnswer': 'अभी जवाब नहीं मिल सका',
    'err.askAgain': 'थोड़ी देर में दोबारा पूछें।',
    'err.micBlocked': 'माइक्रोफोन बंद है। एड्रेस बार से अनुमति दें।',
    'err.noSpeech': 'मैं सुन नहीं पाया',
    'err.micUnsupported': 'बोलकर पूछने के लिए Chrome, Edge या Safari चाहिए',
    'chk.manufacturer': 'निर्माता / पैकर का नाम',
    'chk.address': 'निर्माता का पता',
    'chk.netqty': 'शुद्ध मात्रा',
    'chk.mrp': 'अधिकतम खुदरा मूल्य (सभी करों सहित)',
    'chk.mfgdate': 'निर्माण की तारीख',
    'chk.expiry': 'बेस्ट बिफोर / एक्सपायरी',
    'chk.batch': 'बैच / लॉट नंबर',
    'chk.care': 'ग्राहक सेवा जानकारी',
    'chk.fssai': 'FSSAI लाइसेंस नंबर',
    'chk.ingredients': 'सामग्री सूची',
    'chk.font': 'अक्षरों का आकार और पठनीयता',
    'chk.claims': 'भ्रामक / गैर-मानक दावे',
    'sum.fssaiLic': 'FSSAI लाइसेंस',
    'sum.packaging': 'पैकेजिंग',
    'sum.safeNotRecycl': 'खाने के लिए सुरक्षित, रीसायकल नहीं',
    'sum.safeRecycl': 'खाने के लिए सुरक्षित, रीसायकल योग्य',
    'sum.safeHard': 'सुरक्षित, रीसायकल मुश्किल',
    'sum.noMarking': 'कोई सामग्री चिह्न नहीं',
    'sum.allPresent': 'सभी 12 अनिवार्य जानकारियाँ',
    'close.missing': 'अनिवार्य जानकारियाँ गायब हैं।',
    'close.breach': 'यह लीगल मेट्रोलॉजी (पैकेज्ड कमोडिटीज) रूल्स, 2011 का उल्लंघन है, और आप इसकी शिकायत कर सकते हैं।',
    'close.nothingIllegal': 'कुछ भी गैरकानूनी नहीं, पर कुछ बातें दोबारा देखने लायक हैं।',
    'close.inOrder': 'यह लेबल ठीक है। हर अनिवार्य जानकारी मौजूद है और लाइसेंस भी सही है।',
    'drawer.title': 'पुरानी जाँच',
    'drawer.empty': 'अभी कोई जाँच नहीं। शुरू करने के लिए पैकेट की फोटो भेजें।',
    'drawer.close': 'बंद करें',
    'divider.newScan': 'नई जाँच',
    'divider.history': 'आपके इतिहास से'
  };

  const MR = {
    "tip.landingMic": "बोलून सांगा",
    "voice.noRecog": "बोलून सांगण्यासाठी Chrome, Edge किंवा Safari लागतो. बाकी सगळं येथे चालतं.",
    "toast.listening": "ऐकत आहे, सांगा",
    'badge': 'AI अन्न पॅकेजिंग अनुपालन',
    'tagline': 'SafeByte म्हणजे काय? एक AI एजंट जो कोणत्याही अन्न पॅकेटचा फोटो पाहून त्याचा सरकारी परवाना लगेच तपासतो.',
    'upload.title': 'पॅकेटचा फोटो अपलोड करा',
    'upload.hint': 'किंवा इथे ओढून सोडा, JPG, PNG',
    'upload.or': 'किंवा',
    'upload.camera': 'कॅमेऱ्याने फोटो घ्या',
    'landing.history': 'तुमचा इतिहास पहा',
    'lang.label': 'भाषा',
    'status.online': 'ऑनलाइन',
    'status.typing': 'लिहीत आहे...',
    'status.thinking': 'विचार करत आहे...',
    'tip.history': 'जुन्या तपासण्या',
    'tip.newscan': 'नवी तपासणी',
    'tip.speak': 'उत्तरे मोठ्याने वाचा',
    'tip.speakOff': 'बोलणे थांबवा',
    'tip.mic': 'टाइप करण्याऐवजी बोला',
    'tip.attach': 'पॅकेटचा फोटो जोडा',
    'tip.send': 'पाठवा',
    'ph.start': 'सुरू करण्यासाठी अन्न पॅकेटचा फोटो पाठवा...',
    'ph.ask': 'या उत्पादनाबद्दल काहीही विचारा...',
    'ph.askMed': 'या औषधाबद्दल काहीही विचारा...',
    'ph.listening': 'ऐकत आहे...',
    'ph.more': 'आणखी जोडा, किंवा सुरू करा म्हणा...',
    'ph.another': 'दुसरा फोटो पाठवा...',
    'ph.yesno': 'होय / नाही...',
    'shots.one': 'मिळाला. पॅकेटवर आणखी काही दाखवायचे असेल, जसे मागची बाजू किंवा एक्सपायरीची जागा, तर तेही पाठवा, मी सगळे एकत्र वाचेन. नाहीतर मी सुरू करतो.',
    'shots.many': 'फोटो आतापर्यंत. आणखी पाठवा, किंवा सुरू करा म्हणा.',
    'chip.analyse': 'आता तपासा',
    'chip.addPhoto': 'आणखी एक फोटो जोडा',
    'step.reading': 'लेबल वाचत आहे',
    'step.read': 'लेबल वाचले',
    'step.failRead': 'मला हा फोटो वाचता आला नाही',
    'step.checkingLic': 'FoSCoS सरकारी डेटाबेसमध्ये परवाना तपासत आहे',
    'step.licChecked': 'परवाना तपासला',
    'step.ingredients': 'घटक वाचत आहे',
    'step.ingredientsDone': 'घटकांची तपासणी पूर्ण',
    'notfood.title': 'हे मला अन्न पॅकेट वाटत नाही.',
    'notfood.ask': 'मी अन्न लेबल FSSAI आणि लीगल मेट्रोलॉजी नियमांनुसार तपासतो, जे इथे लागू होणार नाहीत. हे खरेच पॅकबंद अन्न किंवा पेय आहे का?',
    'chip.isFood': 'होय, हे अन्न आहे',
    'chip.notFood': 'नाही, माझी चूक',
    'blurry': 'लेबल इतके स्पष्ट नाही की मी खात्रीने काही सांगू शकेन. या फोटोवरून काढलेला निष्कर्ष अंदाजच असेल, आणि नसलेले उल्लंघन सांगण्यापेक्षा तुम्हाला पुन्हा फोटो मागणे बरे.',
    'chip.retake': 'मी पुन्हा फोटो घेतो',
    'chip.continue': 'तरीही पुढे चला',
    'verdict.ok': 'नियमांनुसार योग्य',
    'verdict.okLine': 'प्रत्येक आवश्यक माहिती पॅकेटवर आहे आणि योग्य प्रकारे लिहिली आहे.',
    'verdict.bad': 'उल्लंघने',
    'verdict.badLine': 'हे पॅकेट FSSAI / लीगल मेट्रोलॉजीच्या अटी पूर्ण करत नाही.',
    'verdict.warn': 'तपासणी आवश्यक',
    'verdict.govOk': 'परवाना सरकारी FoSCoS डेटाबेसमध्ये चालू आहे',
    'verdict.govBad': 'परवाना पॅकेटवरील ब्रँडपेक्षा वेगळ्या कंपनीच्या नावावर आहे',
    'check.intro': 'ही आहे',
    'check.introEnd': 'मुद्द्यांची लेबल तपासणी. कोणत्याही ओळीवर टॅप करा, मी ती नीट समजावून सांगेन.',
    'check.cleared': 'योग्य आढळले',
    'note.missing': 'गहाळ',
    'note.present': 'आहे',
    'note.review': 'पाहण्यासारखे',
    'pack.intro': 'आता पॅकेजिंगबद्दल, जे जवळपास कोणीच वाचत नाही.',
    'pack.foodContact': 'अन्नाच्या संपर्कात',
    'pack.after': 'वापरल्यानंतर',
    'pack.why': 'हे का महत्त्वाचे आहे?',
    'pack.safe': 'सुरक्षित',
    'pack.safeFood': 'अन्नासाठी सुरक्षित',
    'pack.question': 'शंकास्पद',
    'pack.unknown': 'माहीत नाही',
    'pack.recyclable': 'पुनर्वापर शक्य',
    'pack.partly': 'अंशतः पुनर्वापर',
    'pack.notRecycl': 'पुनर्वापर अशक्य',
    'sum.pulling': 'तर, सगळे मिळून.',
    'sum.what': 'मी काय तपासले',
    'sum.where': 'काय स्थिती आहे',
    'sum.missing': 'गहाळ',
    'sum.review': 'तपासणी आवश्यक',
    'sum.present': 'आहे',
    'sum.notVerified': 'तपासले नाही',
    'sum.verified': 'सरकारकडून पडताळले',
    'sum.otherCompany': 'दुसऱ्या कंपनीच्या नावावर',
    'sum.inDate': 'वैध आहे',
    'sum.expired': 'मुदत संपली',
    'sum.expiringSoon': 'लवकरच मुदत संपेल',
    'sum.rxOnly': 'फक्त डॉक्टरांच्या चिठ्ठीवर',
    'link.onePage': 'वरील सर्व माहिती एकाच पानावर, जी तुम्ही वाचू शकता, प्रिंट करू शकता किंवा पॅकेटसोबत उघडी ठेवू शकता:',
    'link.report': 'संपूर्ण अहवाल उघडा',
    'link.reportSub': 'प्रत्येक तपासणी, FoSCoS परवान्याची तुलना, लेबलमधून काढलेली माहिती आणि पॅकेजिंग, तिथूनही संवाद सुरू ठेवता येईल',
    'link.complaint': 'तक्रार डेस्क उघडा',
    'link.complaintSub': 'डावीकडे तुमची तयार तक्रार, उजवीकडे सरकारी FoSCoS फॉर्म, एकाच टॅबमध्ये',
    'chip.whoEat': 'हे कोण खाऊ शकते?',
    'chip.explain': 'निष्कर्ष समजावून सांगा',
    'chip.report': 'तक्रार कशी करू?',
    'chip.healthy': 'हे किती आरोग्यदायी आहे?',
    'chip.medFor': 'हे औषध कशासाठी आहे?',
    'chip.sideEffects': 'दुष्परिणाम काय आहेत?',
    'chip.notPrinted': 'पॅकेटवर छापलेलेच नाही',
    'chip.choosePhoto': 'फोटो निवडा',
    'med.isMedicine': 'हे औषध आहे, अन्न उत्पादन नाही, म्हणून मी ते अन्न नियमांऐवजी ड्रग्ज अँड कॉस्मेटिक्स रूल्स 1945 नुसार तपासत आहे.',
    'med.expired': 'या औषधाची मुदत संपली आहे.',
    'med.expiringSoon': 'लवकरच मुदत संपत आहे.',
    'med.doNotTake': 'हे घेऊ नका. औषध दुकानात परत करा किंवा सुरक्षितपणे टाका; नाल्यात टाकू नका.',
    'med.labelOk': 'लेबल नियमांनुसार योग्य आहे',
    'med.missing': 'आवश्यक माहिती गहाळ',
    'med.notDoctor': 'ही झाली लेबलची तपासणी. मी स्पष्ट सांगतो की मी काय नाही: पॅकेटवर कायद्यानुसार सर्व लिहिले आहे का हे मी पाहतो, आणि औषध काय आहे ते समजावू शकतो. मी डॉक्टर किंवा फार्मासिस्ट नाही, आणि तुम्ही औषध घ्यावे की नाही हा सल्ला इथे नाही.',
    'med.licenceTitle': 'आता उत्पादन परवान्याबद्दल, आणि इथे मला तुमच्याशी काळजीपूर्वक बोलावे लागेल.',
    'med.verifySelf': 'सरकारी पोर्टलवर स्वतः तपासा',
    'med.copyLicence': 'परवाना क्रमांक कॉपी करा',
    'err.readFailed': 'हे वाचताना काहीतरी बिघडले',
    'err.tryAnother': 'दुसरा फोटो वापरून पहा, किंवा वारंवार होत असल्यास टर्मिनल पहा.',
    'err.noAnswer': 'आत्ता उत्तर मिळाले नाही',
    'err.askAgain': 'थोड्या वेळाने पुन्हा विचारा.',
    'err.micBlocked': 'मायक्रोफोन बंद आहे. अॅड्रेस बारमधून परवानगी द्या.',
    'err.noSpeech': 'मला ऐकू आले नाही',
    'err.micUnsupported': 'बोलून विचारण्यासाठी Chrome, Edge किंवा Safari हवे',
    'chk.manufacturer': 'उत्पादक / पॅकरचे नाव',
    'chk.address': 'उत्पादकाचा पत्ता',
    'chk.netqty': 'निव्वळ वजन',
    'chk.mrp': 'कमाल किरकोळ किंमत (सर्व करांसह)',
    'chk.mfgdate': 'उत्पादनाची तारीख',
    'chk.expiry': 'बेस्ट बिफोर / मुदत',
    'chk.batch': 'बॅच / लॉट क्रमांक',
    'chk.care': 'ग्राहक सेवा माहिती',
    'chk.fssai': 'FSSAI परवाना क्रमांक',
    'chk.ingredients': 'घटकांची यादी',
    'chk.font': 'अक्षरांचा आकार आणि वाचनीयता',
    'chk.claims': 'दिशाभूल करणारे / अमानक दावे',
    'sum.fssaiLic': 'FSSAI परवाना',
    'sum.packaging': 'पॅकेजिंग',
    'sum.safeNotRecycl': 'अन्नासाठी सुरक्षित, पुनर्वापर अशक्य',
    'sum.safeRecycl': 'अन्नासाठी सुरक्षित, पुनर्वापर शक्य',
    'sum.safeHard': 'सुरक्षित, पुनर्वापर अवघड',
    'sum.noMarking': 'सामग्रीची खूण नाही',
    'sum.allPresent': 'सर्व 12 अनिवार्य माहिती',
    'close.missing': 'अनिवार्य माहिती गहाळ आहे.',
    'close.breach': 'हे लीगल मेट्रोलॉजी (पॅकेज्ड कमोडिटीज) रूल्स, 2011 चे उल्लंघन आहे, आणि तुम्ही याची तक्रार करू शकता.',
    'close.nothingIllegal': 'बेकायदेशीर काही नाही, पण काही गोष्टी पुन्हा पाहण्यासारख्या आहेत.',
    'close.inOrder': 'हे लेबल व्यवस्थित आहे. प्रत्येक अनिवार्य माहिती आहे आणि परवानाही बरोबर आहे.',
    'drawer.title': 'जुन्या तपासण्या',
    'drawer.empty': 'अजून कोणतीही तपासणी नाही. सुरू करण्यासाठी पॅकेटचा फोटो पाठवा.',
    'drawer.close': 'बंद करा',
    'divider.newScan': 'नवी तपासणी',
    'divider.history': 'तुमच्या इतिहासातून'
  };

  // The rules engine produces English labels; map them to keys so the
  // checklist and the summary table translate with everything else.
  const LABEL_KEYS = {
    'Manufacturer / Packer Name': 'chk.manufacturer',
    'Manufacturer Address': 'chk.address',
    'Net Quantity Declaration': 'chk.netqty',
    'MRP (Inclusive of all taxes)': 'chk.mrp',
    'Date of Manufacturing': 'chk.mfgdate',
    'Best Before / Expiry Date': 'chk.expiry',
    'Batch / Lot Number': 'chk.batch',
    'Consumer Care Details': 'chk.care',
    'FSSAI Licence Number Present': 'chk.fssai',
    'Ingredients List': 'chk.ingredients',
    'Font Size & Readability': 'chk.font',
    'Misleading / Non-standard Claims': 'chk.claims'
  };

  const BUILT_IN = { 'en-IN': EN, 'hi-IN': HI, 'mr-IN': MR };
  const CACHE_PREFIX = 'safebyte_ui_';

  let active = EN;
  let activeCode = 'en-IN';

  function cached(code) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + code);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function cache(code, dict) {
    try { localStorage.setItem(CACHE_PREFIX + code, JSON.stringify(dict)); } catch (e) {}
  }

  /** Look up a string. Falls back to English, then to the key itself. */
  function t(key) {
    return (active && active[key]) || EN[key] || key;
  }

  /**
   * Translate the whole interface once via the model, then cache it. Only used
   * for languages without a built-in dictionary. Returns null on any failure,
   * so the caller can keep English rather than show a half-translated screen.
   */
  async function translateViaModel(code, langName) {
    const payload = JSON.stringify(EN);
    const prompt = `Translate this JSON object of user interface strings into ${langName}.

${payload}

Rules:
- Return ONLY the JSON object, same keys, translated values. No markdown, no commentary.
- Do NOT translate: SafeByte, FSSAI, FoSCoS, JPG, PNG, AI, Chrome, Edge, Safari, or the names of laws and regulations.
- Use plain everyday spoken ${langName}, the register an ordinary shopper uses. Not literary, not officialese.
- Keep each translation roughly the same length as the English.`;

    try {
      const dict = JSON.parse(unfence(await askModel(prompt)));
      if (!dict || typeof dict !== 'object' || !dict['upload.title']) return null;
      cache(code, dict);
      return dict;
    } catch (e) {
      console.warn('[SafeByte] UI translation failed, staying in English:', e.message);
      return null;
    }
  }

  /* --------------------------------------------------------------------------
   * Asking the model, without dragging the rest of the app along
   * --------------------------------------------------------------------------
   * engine.js has callGeminiChat(), but it wraps every message in the scanned
   * product's whole context and reads `currentAnalysis` on the first line - so
   * on the landing page, before anything has been scanned, it throws. Which is
   * exactly when someone picks their language. So this layer talks to the
   * server itself, with nothing but the text it wants translated.
   * ------------------------------------------------------------------------*/
  async function askModel(prompt) {
    const endpoints = [];
    const proto = (typeof window !== 'undefined' && window.location.protocol) || '';
    if (proto === 'http:' || proto === 'https:') endpoints.push('/api/chat/auto');
    else endpoints.push('http://localhost:3000/api/chat/auto');

    let lastErr = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
          })
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || !j.reply) {
          lastErr = new Error((j && j.message) || ('HTTP ' + r.status));
          continue;
        }
        return j.reply;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('no translation endpoint answered');
  }

  /** Strip a fenced code block, which models add however firmly you ask them not to. */
  function unfence(reply) {
    return String(reply).trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
  }

  /**
   * Translate just the keys a language is missing. Cheaper than redoing the
   * whole dictionary, and it means a hand-written language stays hand-written
   * except for the gaps.
   */
  async function translateKeys(code, langName, keys) {
    const subset = {};
    keys.forEach(k => { subset[k] = EN[k]; });

    const prompt = `Translate this JSON object of user interface strings into ${langName}.

${JSON.stringify(subset)}

Rules:
- Return ONLY the JSON object, same keys, translated values. No markdown, no commentary.
- Do NOT translate: SafeByte, FSSAI, FoSCoS, JPG, PNG, AI, Chrome, Edge, Safari, Rule numbers, or the names of laws and regulations.
- Use plain everyday spoken ${langName}, the register an ordinary shopper uses. Not literary, not officialese.
- Keep each translation roughly the same length as the English.`;

    try {
      const dict = JSON.parse(unfence(await askModel(prompt)));
      if (!dict || typeof dict !== 'object') return null;
      const out = {};
      keys.forEach(k => { if (typeof dict[k] === 'string' && dict[k].trim()) out[k] = dict[k]; });
      return Object.keys(out).length ? out : null;
    } catch (e) {
      console.warn('[SafeByte] UI translation failed, staying in English:', e.message);
      return null;
    }
  }

  /** Swap every marked element in the DOM to the active language. */
  function applyToDom() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      const v = t(k);
      if (v) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.documentElement.lang = activeCode.split('-')[0];
  }

  /**
   * Switch language. Built-in dictionaries apply instantly; others come from
   * cache if present, otherwise one model call. `onState` reports progress so
   * the UI can show that something is happening.
   */
  async function setLanguage(code, langName, onState) {
    activeCode = code;

    dynLoad(code);

    if (code === 'en-IN') { active = EN; applyToDom(); applyDynamic(); return 'instant'; }

    const hand = BUILT_IN[code] || null;
    const hit = cached(code) || null;

    // What is still only in English? Hand-written entries win, then the cache.
    const merge = () => Object.assign({}, EN, hit || {}, hand || {});
    const missing = Object.keys(EN).filter(k => !(hand && hand[k]) && !(hit && hit[k]));

    if (!missing.length) {
      active = merge();
      applyToDom(); applyDynamic();
      return hand ? 'instant' : 'cached';
    }

    // Show what we already have straight away, then fill the holes.
    active = merge();
    applyToDom();
    if (onState) onState('translating');

    const filled = await translateKeys(code, langName, missing);
    if (filled) {
      const store = Object.assign({}, hit || {}, filled);
      cache(code, store);
      active = Object.assign({}, EN, store, hand || {});
      applyToDom(); applyDynamic();
      return hand ? 'instant' : 'translated';
    }

    applyDynamic();
    return hand ? 'instant' : 'failed';
  }

  /* ==========================================================================
   * The parts of the interface that are not fixed strings
   * --------------------------------------------------------------------------
   * The agent writes its own sentences as it goes, and some of them carry a
   * product name or an error message inside them, so they cannot all be
   * dictionary keys. Those go through here: shown in English immediately,
   * translated in one batched call, replaced in place, and remembered so the
   * second scan in that language is instant.
   * ========================================================================*/
  const DYN_PREFIX = 'safebyte_dyn_';
  let dynCache = {};
  const dynQueue = new Map();   // english -> [nodes]
  let dynTimer = null;
  let dynBusy = false;

  function dynLoad(code) {
    try { dynCache = JSON.parse(localStorage.getItem(DYN_PREFIX + code) || '{}'); }
    catch (e) { dynCache = {}; }
  }
  function dynSave() {
    try { localStorage.setItem(DYN_PREFIX + activeCode, JSON.stringify(dynCache)); } catch (e) {}
  }

  /**
   * Markup we refuse to hand to a model. Anything with a handler, a link, an
   * image or a table has structure worth more than its words; a mistranslation
   * there breaks the page rather than just reading oddly.
   */
  function dynSafe(html) {
    const h = String(html || '');
    if (!h.trim()) return false;
    if (h.length > 900) return false;
    if (/onclick=|href=|<img|<table|<input|<button|class="dots"|class="step"/i.test(h)) return false;
    return /[A-Za-z]{3}/.test(h);   // has actual words in it
  }

  /** Same tags, same order? If not, keep the English. */
  function tagsMatch(a, b) {
    const t = x => (String(x).match(/<[^>]+>/g) || []).join('');
    return t(a) === t(b);
  }

  /**
   * Register a node whose text should be translated. Returns immediately; the
   * node is rewritten when the translation arrives.
   */
  function dynamic(node, html) {
    if (activeCode === 'en-IN' || !dynSafe(html)) return html;
    const key = String(html);
    if (dynCache[key]) return dynCache[key];

    if (node) {
      node.setAttribute('data-sb-src', key);
      if (!dynQueue.has(key)) dynQueue.set(key, []);
      dynQueue.get(key).push(node);
      schedule();
    }
    return html;
  }

  function schedule() {
    if (dynTimer) clearTimeout(dynTimer);
    dynTimer = setTimeout(flush, 500);
  }

  async function flush() {
    dynTimer = null;
    if (dynBusy || !dynQueue.size) return;

    const code = activeCode;
    const items = [...dynQueue.keys()].slice(0, 25);
    items.forEach(k => dynQueue.delete(k));
    dynBusy = true;

    const langName = (window.SafeByteVoice && SafeByteVoice.langInfo)
      ? SafeByteVoice.langInfo.ai : code;

    const prompt = `Translate each string in this JSON array into ${langName}.

${JSON.stringify(items)}

Rules:
- Return ONLY a JSON array of the same length, same order. No markdown, no commentary.
- Some strings contain HTML tags. Keep every tag exactly as it is, in the same order. Translate only the words between them.
- Do NOT translate: brand names, product names, company names, licence numbers, dates, quantities, prices, chemical or drug names, SafeByte, FSSAI, FoSCoS, Legal Metrology, Rule numbers, or the names of laws.
- Plain everyday spoken ${langName}, the way one person explains something to another in a shop. Not literary, not officialese.`;

    try {
      const out = JSON.parse(unfence(await askModel(prompt)));
      if (Array.isArray(out) && out.length === items.length) {
        items.forEach((en, i) => {
          const tr = out[i];
          if (typeof tr === 'string' && tr.trim() && tagsMatch(en, tr)) dynCache[en] = tr;
        });
        if (code === activeCode) { dynSave(); applyDynamic(); }
      }
    } catch (e) {
      console.warn('[SafeByte] could not translate agent text:', e.message);
    } finally {
      dynBusy = false;
      if (dynQueue.size) schedule();
    }
  }

  /** Rewrite every registered node to the active language (or back to English). */
  function applyDynamic() {
    document.querySelectorAll('[data-sb-src]').forEach(el => {
      const en = el.getAttribute('data-sb-src');
      if (activeCode === 'en-IN') { el.innerHTML = en; return; }
      if (dynCache[en]) { el.innerHTML = dynCache[en]; return; }
      el.innerHTML = en;
      if (!dynQueue.has(en)) dynQueue.set(en, []);
      dynQueue.get(en).push(el);
      schedule();
    });
    if (dynQueue.size) schedule();
  }

  /** Translate a label the rules engine produced, or return it unchanged. */
  function label(en) {
    const k = LABEL_KEYS[en];
    return k ? t(k) : en;
  }

  return {
    t, label, setLanguage, applyToDom, dynamic, applyDynamic,
    get code() { return activeCode; },
    isBuiltIn: c => !!BUILT_IN[c],
    keys: Object.keys(EN)
  };
})();
