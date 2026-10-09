(() => {
  if (window.__sqs_injected) return;
  window.__sqs_injected = true;

  const DEFAULTS = {
    provider: 'groq',
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
  let busy = false;

  // --- Force copy/select for restricted exam and quiz portals ---
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
  bar.innerHTML = `<div id="sqs-status-dot"></div><div id="sqs-text">SQS: Ready</div>
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
    });
  } catch (e) {}

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
    // Quizzes frequently reside in nested frames (e.g. Sakai/AUMS maincontentframe)
    for (const f of frames) {
      try {
        const d = f.contentDocument;
        if (d) collectFrameTexts(d, out, depth + 1);
      } catch (e) {
        /* Cross-origin iframe boundary: safely ignore */
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
      // Fallback if clipboard API permission is restricted
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

  load();
})();
