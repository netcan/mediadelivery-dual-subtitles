chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'fetchText' || typeof message.url !== 'string') {
    return false;
  }

  (async () => {
    try {
      const response = await fetch(message.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      sendResponse({
        ok: true,
        text: await response.text(),
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});
