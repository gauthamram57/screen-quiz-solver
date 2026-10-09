(() => {
  if (window.__sqs_injected) return;
  window.__sqs_injected = true;

  const DEFAULTS = {
    provider: 'groq', // groq | openrouter | gemini
    apiKey: '',
    model: 'openai/gpt-oss-120b',
    fontSize: 11,
    opacity: 0.88,
    position: 'bottom',
    autoScanSec: 0,
    useScreenshot: true,
    visible: true
  };

  let settings = { ...DEFAULTS };
  let timer = null;
  let busy = false;

  // --- Force copy/select for restricted exam & quiz portals ---
  try {
    const css = document.createElement('style');
    css.textContent = `
      * { -webkit-user-select: text !important; user-select: text !important; }
      input, textarea { -webkit-user-select: auto !important; user-select: auto !important; }
    `;
    (document.head || document.documentElement).appendChild(css);
    for (const eventName of ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']) {
      document.addEventListener(eventName, (e) => e.stopImmediatePropagation(), true);
    }
    document.oncontextmenu = document.oncopy = document.oncut = document.onselectstart = null;
  } catch (e) {}

  const bar = document.createElement('div');
  bar.id = 'sqs-bar';
  bar.innerHTML = `<div id="sqs-status-dot"></div><div id="sqs-text">SQS: Alt+S scan</div>
    <button id="sqs-scan">Scan</button><button id="sqs-copy" title="Copy question alone">CopyQ</button><button id="sqs-hide">–</button>`;
  document.documentElement.appendChild(bar);

  const textEl = bar.querySelector('#sqs-text');
  const dot = bar.querySelector('#sqs-status-dot');
  const scanBtn = bar.querySelector('#sqs-scan');

  function isDead() {
    try {
      return !chrome.runtime || !chrome.runtime.id;
    } catch (e) {
      return true;
    }
  }

  function showReload() {
    try {
      textEl.textContent = 'SQS updated – click Reload below';
      scanBtn.textContent = 'Reload';
      scanBtn.onclick = () => location.reload();
    } catch (e) {}
  }

  function applyStyle() {
    textEl.style.fontSize = settings.fontSize + 'px';
    bar.style.background = `rgba(10, 10, 10, ${settings.opacity})`;
    bar.classList.toggle('sqs-top', settings.position === 'top');
    bar.style.display = settings.visible ? 'flex' : 'none';
  }

  async function load() {
    try {
      const s = await chrome.storage.sync.get(DEFAULTS);
      settings = { ...DEFAULTS, ...s };
    } catch (e) {
      showReload();
      return;
    }
    applyStyle();
    setupAuto();
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (isDead()) {
        showReload();
        return;
      }
      if (area !== 'sync') return;
      for (const key in changes) {
        settings[key] = changes[key].newValue;
      }
      applyStyle();
      setupAuto();
    });
  } catch (e) {}

  function setupAuto() {
    if (timer) clearInterval(timer);
    if (settings.autoScanSec > 0) {
      timer = setInterval(() => scan(false), settings.autoScanSec * 1000);
    }
  }

  function docOwnText(doc) {
    try {
      return ((doc.body ? doc.body.innerText : '') || '').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      return '';
    }
  }

  function collectFrameTexts(doc, out, depth) {
    if (!doc || depth > 3) return;
    let frames = [];
    try {
      frames = Array.from(doc.querySelectorAll('iframe, frame'));
    } catch (e) {}
    for (const f of frames) {
      try {
        const d = f.contentDocument;
        if (d) collectFrameTexts(d, out, depth + 1);
      } catch (e) {
        /* Cross-origin iframe: skip gracefully */
      }
    }
    const t = docOwnText(doc);
    if (t) out.push(t);
  }

  function getPageText() {
    const parts = [];
    try {
      collectFrameTexts(document, parts, 0);
    } catch (e) {}
    let text = parts.join('\n\n--- frame ---\n\n').trim();
    if (!text) {
      try {
        text = docOwnText(document);
      } catch (e) {}
    }
    return text.slice(0, 8000);
  }

  async function copyQuestion() {
    const fn = (typeof window.extractQuestionAlone === 'function')
      ? window.extractQuestionAlone
      : (txt) => txt.slice(0, 300);
    const q = fn(getPageText());
    if (!q) {
      textEl.textContent = 'No Q found';
      return;
    }
    try {
      await navigator.clipboard.writeText(q);
      textEl.textContent = 'Copied: ' + q.slice(0, 150);
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = q;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        textEl.textContent = 'Copied: ' + q.slice(0, 150);
      } catch (e2) {
        textEl.textContent = 'Copy blocked: ' + q.slice(0, 150);
      }
    }
  }

  function capture() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'SQS_CAPTURE' }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) resolve(null);
          else resolve(res.dataUrl);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  const SYSTEM_PROMPT = `You are a quiz solver. Analyze the screenshot and/or page text.
Rules:
- For MCQ: output ONLY "Q<n>: Opt <k>" e.g. "Q1: Opt 2". Number options top-to-bottom, 1-based. No explanation.
- For fill in blanks: output ONLY "Q<n>: <1-2 word answer>". Exact short answer.
- For multiple questions list each on new line, keep VERY short.
- If no question found, output "No Q found".
- Never add explanation.`;

  const GEMINI_FALLBACKS = [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash-001',
    'gemini-flash-latest'
  ];

  const GROQ_FALLBACKS = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
    'moonshotai/kimi-k2-instruct',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant'
  ];

  async function groqChat(pageText, m) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.apiKey
      },
      body: JSON.stringify({
        model: m,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'PAGE TEXT:\n' + pageText }
        ],
        max_tokens: 300,
        temperature: 0.1
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error('Groq ' + res.status + ' ' + t.slice(0, 120));
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    const c = (j?.choices?.[0]?.message?.content || '').trim();
    if (!c) throw Object.assign(new Error('Groq empty response'), { status: 502 });
    return c;
  }

  async function groqLiveModels() {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': 'Bearer ' + settings.apiKey }
      });
      if (!res.ok) return [];
      const j = await res.json();
      const ids = (j?.data || [])
        .map(d => d.id)
        .filter(id => !/whisper|tts|embed|audio|guard/i.test(id));
      const pref = ['llama-3.3', 'gpt-oss', 'kimi', 'qwen3', 'llama-4', 'llama-3.1', 'deepseek', 'gemma'];
      ids.sort((a, b) => {
        const ai = pref.findIndex(p => a.includes(p));
        const bi = pref.findIndex(p => b.includes(p));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
      return ids.slice(0, 5);
    } catch (e) {
      return [];
    }
  }

  async function askGroq(pageText, model) {
    let lastErr = null;
    const candidates = [model, ...GROQ_FALLBACKS.filter(x => x !== model)];
    for (const m of candidates) {
      try {
        return await groqChat(pageText, m);
      } catch (e) {
        lastErr = e;
        if (e.status === 404 || e.status === 429 || (e.status >= 500 && e.status < 600)) continue;
        throw e;
      }
    }
    // Attempt dynamic live model discovery for the user's specific API key
    for (const m of await groqLiveModels()) {
      try {
        return await groqChat(pageText, m);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Groq request failed');
  }

  async function askGeminiOnce(pageText, dataUrl, model) {
    const parts = [{ text: SYSTEM_PROMPT + '\n\nPAGE TEXT:\n' + pageText }];
    if (dataUrl && settings.useScreenshot) {
      const base64 = dataUrl.split(',')[1];
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64 } });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.1 }
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error('Gemini ' + res.status + ' ' + t.slice(0, 150));
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    return (j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || 'No answer').trim();
  }

  async function askGemini(pageText, dataUrl) {
    const ordered = [settings.model, ...GEMINI_FALLBACKS.filter(m => m !== settings.model)];
    let lastErr = null;
    for (const m of ordered) {
      try {
        return await askGeminiOnce(pageText, dataUrl, m);
      } catch (e) {
        lastErr = e;
        if (e.status === 404 || e.status === 429 || (e.status >= 500 && e.status < 600)) continue;
        throw e;
      }
    }
    throw lastErr || new Error('Gemini request failed');
  }

  const OR_FALLBACKS_VISION = [
    'qwen/qwen3.8-27b:free',
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'dots-studio/dots-3-note-preview:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
  ];
  const OR_FALLBACKS_TEXT = [
    'liquid/lfm-2.5-2.6b:free',
    'nvidia/nemotron-3.5-lightning:free',
    'inclusionai/ling-3.0-flash-sante:free'
  ];
  const SKIP_STATUS = new Set([403, 404, 429, 502, 503]);

  async function askOpenRouterOnce(pageText, dataUrl, model, textOnly) {
    const userContent = [{ type: 'text', text: 'PAGE TEXT:\n' + pageText }];
    if (dataUrl && settings.useScreenshot && !textOnly) {
      userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.apiKey,
        'HTTP-Referer': location.origin,
        'X-Title': 'ScreenQuizSolver'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        max_tokens: 300,
        temperature: 0.1
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error('OpenRouter ' + res.status + ' ' + t.slice(0, 150));
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    const c = (j?.choices?.[0]?.message?.content || '').trim();
    if (!c) throw Object.assign(new Error('OpenRouter empty response'), { status: 502 });
    return c;
  }

  async function askOpenRouter(pageText, dataUrl) {
    const visionOrdered = [settings.model, ...OR_FALLBACKS_VISION.filter(m => m !== settings.model)];
    let lastErr = null;
    for (const m of visionOrdered) {
      try {
        return await askOpenRouterOnce(pageText, dataUrl, m, false);
      } catch (e) {
        lastErr = e;
        if (SKIP_STATUS.has(e.status)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw e;
      }
    }
    for (const m of OR_FALLBACKS_TEXT) {
      try {
        return await askOpenRouterOnce(pageText, null, m, true);
      } catch (e) {
        lastErr = e;
        if (SKIP_STATUS.has(e.status)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw e;
      }
    }
    throw new Error('All free models rate-limited, retry in 60s or uncheck screenshot. (' + String(lastErr && lastErr.message || '').slice(0, 100) + ')');
  }

  async function scan(manual = true) {
    if (busy) return;
    if (isDead()) {
      showReload();
      return;
    }
    if (!settings.apiKey) {
      textEl.textContent = 'SQS: paste key in popup → Save → Alt+S';
      return;
    }
    busy = true;
    try {
      dot.className = 'busy';
    } catch (e) {}
    if (manual) textEl.textContent = '…scanning';
    try {
      const pageText = getPageText();
      const shot = settings.useScreenshot && settings.provider !== 'groq' ? await capture() : null;
      const ans = settings.provider === 'gemini'
        ? await askGemini(pageText, shot)
        : settings.provider === 'groq'
          ? await askGroq(pageText, settings.model)
          : await askOpenRouter(pageText, shot);
      textEl.textContent = ans.trim().slice(0, 1000);
    } catch (e) {
      const m = String(e && e.message || e);
      if (/context invalidated/i.test(m)) {
        showReload();
      } else {
        textEl.textContent = 'Err: ' + m.slice(0, 200);
      }
    }
    try {
      dot.className = '';
    } catch (e) {}
    busy = false;
  }

  bar.querySelector('#sqs-scan').onclick = () => {
    if (isDead()) {
      showReload();
      return;
    }
    scan(true);
  };

  bar.querySelector('#sqs-copy').onclick = () => {
    if (isDead()) {
      showReload();
      return;
    }
    copyQuestion();
  };

  bar.querySelector('#sqs-hide').onclick = async () => {
    if (isDead()) {
      showReload();
      return;
    }
    settings.visible = false;
    try {
      await chrome.storage.sync.set({ visible: false });
    } catch (e) {
      showReload();
    }
  };

  document.addEventListener('keydown', (e) => {
    if (isDead()) return;
    if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      scan(true);
    }
    if (e.altKey && e.key.toLowerCase() === 'h') {
      settings.visible = !settings.visible;
      try {
        chrome.storage.sync.set({ visible: settings.visible });
      } catch (err) {
        showReload();
      }
    }
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (isDead()) return;
      if (msg.type === 'SQS_SCAN') scan(true);
      if (msg.type === 'SQS_TOGGLE') {
        settings.visible = !settings.visible;
        try {
          chrome.storage.sync.set({ visible: settings.visible });
        } catch (err) {}
      }
    });
  } catch (e) {}

  load();
})();
