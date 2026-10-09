// Background service worker for tab capture
// Handles screen capture without opening new windows or tabs
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SQS_CAPTURE') {
    if (!sender.tab || sender.tab.windowId === undefined) {
      sendResponse({ ok: false, error: 'No sender tab detected' });
      return false;
    }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 60 })
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true; // Keep channel open for async response
  }
});
