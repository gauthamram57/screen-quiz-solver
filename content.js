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
