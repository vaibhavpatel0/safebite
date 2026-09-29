# SafeByte AI Agent

An AI agent that reads Indian packaged **food** and **medicine** labels, checks them
against the law, verifies the licence where a government registry allows it, and
helps you file a complaint.

---

## Running it

You need Node.js. There is nothing to install — no `npm install`, no dependencies.

```bash
cd safebyte
node server.js
```

Then open **http://localhost:3000**

Leave that terminal window open. The server only runs while that command is
running; close the window or restart the Mac and you start it again.

To keep it running after you close the terminal:

```bash
nohup node server.js > server.log 2>&1 &
```

To stop it: `lsof -ti:3000 | xargs kill -9`

If port 3000 is busy: `PORT=3001 node server.js`

---

## Setup

```bash
cp .env.example .env     # then put your keys in .env
node server.js
```

`.env` holds every credential and is listed in `.gitignore`. No key is
hardcoded anywhere in the source. If a key is missing the server still starts
and tells you which one, rather than failing later inside a provider call.

Get keys from: [Groq](https://console.groq.com) ·
[Gemini](https://aistudio.google.com/apikey) ·
[Mistral](https://console.mistral.ai) ·
[OpenRouter](https://openrouter.ai/keys)

---

## The files

| File | What it is |
|:--|:--|
| `server.js` | Zero-dependency Node server. Serves the pages and proxies the AI providers and the FoSCoS government gateway. All API keys live here. |
| `index.html` | The landing page and the conversation. |
| `chat-agent.js` | The agent: the conversation, the walkthrough, the flow control. |
| `engine.js` | Extraction, food compliance rules, FSSAI verification, report rendering. |
| `medicine.js` | Medicine mode: Drugs and Cosmetics Rules 1945 checks, schedules, licence handling. |
| `store.js` | Carries the current scan between the three pages. |
| `voice.js` | Speech in and out, and the language list. Uses the browser's own Web Speech API, so no key and no cost. |
| `report.html` | The full report on one page, with a chat panel. |
| `complaint.html` | Your complaint on the left, the FoSCoS portal on the right. |
| `style.css` | Everything visual. |
| `check-vision.js` | Diagnostic: finds which AI models your keys can actually use for vision, and patches `server.js`. |
| `fix-models.js` | Diagnostic: the same for chat models. |

---

## How it works

**Food** (Legal Metrology Packaged Commodities Rules 2011, FSS Labelling
Regulations 2020) — 12 mandatory declarations, then a live query to the FoSCoS
government database to check the FSSAI licence is real, active, **and registered
to the company named on the pack**. That last comparison is the part a chatbot
cannot do: it catches a genuine licence number printed on someone else's
packaging.

**Medicine** (Drugs and Cosmetics Rules 1945, Rules 96 and 97 as amended 2018) —
15 checks including generic-name prominence, manufacturing licence, batch,
expiry, and the schedule markings. Schedule H / H1 / X are detected and their
required warning text, Rx symbol and red vertical line are checked.

The agent classifies which one it is looking at before it judges anything, and
says so if the photo is not a food or medicine package at all.

---

## Two honest limits, by design

**Drug licences are not verified.** Manufacturing licences in India are issued by
State Licensing Authorities, not one central registry, and the national
verification page is behind a captcha. The app says the number is printed and
what form it appears to be, links you to the portal, and explicitly refuses to
call a medicine genuine *or* fake. A licence it cannot look up is not evidence of
anything.

**The complaint cannot be auto-submitted.** Government portals forbid being
embedded in another page — your browser enforces that, and no site can override
it. So the complaint desk prepares every field with copy buttons and opens the
portal beside it.

---

## If scanning stops working

Check which providers are alive:

```
http://localhost:3000/api/providers/status
```

`"reason": "auth"` means a key is dead. `"quota"` means that provider's daily
budget is spent and it will free up in an hour. The chain skips exhausted
providers automatically.

If models start returning `model_not_found` — providers retire model names
regularly — run:

```bash
node check-vision.js
```

It asks each provider which models your key can use, sends them a real test
image, and rewrites `server.js` with whatever answers.

---

## Before you show this to anyone

`server.js` contains a hardcoded `OFFICIAL_FOSCOS_REGISTRY` with four companies
marked "Active & Government Approved". It is a fallback for when the live gateway
is unreachable. If you are demonstrating live government verification, either
remove it or say plainly that it is a cached fallback — do not let someone find
it and conclude the verification was faked.

API keys are in plaintext in `server.js`. Every one of them can be overridden by
an environment variable instead:

```bash
GROQ_API_KEY=... GEMINI_API_KEY=... MISTRAL_API_KEY=... OPENROUTER_API_KEY=... node server.js
```


---

## Voice and language

Pick a language from the selector on the landing page or in the chat header.
Eleven are offered: English, Hindi, Marathi, Bengali, Tamil, Telugu, Kannada,
Malayalam, Gujarati, Punjabi, Urdu. The choice is remembered.

**Speak instead of typing** with the microphone in the composer. Words appear as
you say them, and the question sends itself when you stop, so you never have to
put the packet down.

**Have answers read aloud** with the speaker button in the header. Everything the
agent says is spoken, including its questions, so someone who cannot read the
label can still be asked "can you see an MRP printed on the pack?" and answer
out loud.

Replies are written in the chosen language too. Brand names, licence numbers and
drug names stay in their original form; everything around them is translated.

Two limits worth knowing. Speech recognition needs Chrome, Edge or Safari, and
the microphone button hides itself where it will not work. Speaking aloud needs
a voice for that language installed in the operating system: on macOS they live
under System Settings, Accessibility, Spoken Content, Voices. If one is missing
the app says so plainly rather than sitting silent.

---

## A note on how it looks

The interface deliberately avoids the house style of generated websites: no
Inter, no gradient washes, no glowing orbs, no coloured stripe down the side of
every card, no decorative emoji, no lift-on-hover, no em dashes in the copy.
Type is a native system stack with one serif for display. The tick and cross in
the checklist are kept because they carry meaning, not decoration.
