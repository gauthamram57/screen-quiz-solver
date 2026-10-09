const $ = (id) => document.getElementById(id);

const MODELS = {
  groq: [
    ['openai/gpt-oss-120b', 'gpt-oss-120b (Recommended — fast, reliable)'],
    ['openai/gpt-oss-20b', 'gpt-oss-20b (lightweight, rapid)'],
    ['llama-3.3-70b-versatile', 'llama-3.3-70b-versatile (high accuracy)'],
    ['llama-3.1-8b-instant', 'llama-3.1-8b-instant (low latency)']
  ],
  openrouter: [
    ['qwen/qwen3.8-27b:free', 'qwen3.8-27b:free (Recommended — vision + reasoning)'],
    ['google/gemma-4-31b-it:free', 'gemma-4-31b-it:free (Google vision)'],
    ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'nemotron-3-nano:free (logic/MCQ)'],
    ['google/gemma-4-26b-a4b-it:free', 'gemma-4-26b-a4b-it:free (fast vision)']
  ],
  gemini: [
    ['gemini-2.0-flash', 'gemini-2.0-flash (Recommended — stable, multimodal)'],
    ['gemini-2.5-flash', 'gemini-2.5-flash (high accuracy)'],
    ['gemini-2.0-flash-001', 'gemini-2.0-flash-001 (standard)']
  ]
};

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

function rebuildModels(provider, current) {
  const sel = $('model');
  sel.innerHTML = '';
  const list = MODELS[provider] || MODELS.groq;
  for (const [v, label] of list) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = current && [...sel.options].some((o) => o.value === current)
    ? current
    : sel.options[0].value;
}

async function init() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('provider').value = s.provider || 'groq';
  rebuildModels($('provider').value, s.model);
  $('apiKey').value = s.apiKey || '';
  $('fontSize').value = s.fontSize;
  $('opacity').value = s.opacity;
  $('position').value = s.position;
  $('autoScanSec').value = s.autoScanSec;
  $('useScreenshot').checked = s.useScreenshot !== false;

  $('fsVal').textContent = s.fontSize;
  $('opVal').textContent = s.opacity;

  $('fontSize').oninput = (e) => {
    $('fsVal').textContent = e.target.value;
  };
  $('opacity').oninput = (e) => {
    $('opVal').textContent = e.target.value;
  };
  $('provider').onchange = (e) => {
    rebuildModels(e.target.value, null);
  };
}

$('save').onclick = async () => {
  await chrome.storage.sync.set({
    provider: $('provider').value,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value,
    fontSize: +$('fontSize').value,
    opacity: +$('opacity').value,
    position: $('position').value,
    autoScanSec: +$('autoScanSec').value,
    useScreenshot: $('useScreenshot').checked
  });
  $('save').textContent = 'Saved!';
  setTimeout(() => {
    $('save').textContent = 'Save Settings';
  }, 1200);
};

function say(message) {
  const el = $('status');
  if (el) el.textContent = message;
}

async function sendToTab(type) {
  say('');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    say('No active tab detected');
    return;
  }
  if (!/^https?:/.test(tab.url || '')) {
    say('Open a web page. Chrome restrictions disallow chrome:// URLs.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
    say(type === 'SQS_SCAN' ? 'Scan signal sent…' : 'Toggled');
  } catch (e) {
    try {
      say('Injecting script…');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/extractor.js', 'content.js']
      });
      await new Promise((r) => setTimeout(r, 300));
      await chrome.tabs.sendMessage(tab.id, { type });
      say('Scan signal sent…');
    } catch (e2) {
      say('Refresh quiz page once (Ctrl+R), then Scan.');
    }
  }
}

$('scan').onclick = () => sendToTab('SQS_SCAN');
$('toggle').onclick = () => sendToTab('SQS_TOGGLE');

init();
