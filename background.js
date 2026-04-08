chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'fetchText' && typeof message.url === 'string') {
    void handleFetchText(message.url, sendResponse);
    return true;
  }

  if (message.type === 'httpRequest' && typeof message.url === 'string') {
    void handleHttpRequest(message, sendResponse);
    return true;
  }

  return false;
});

async function handleFetchText(url, sendResponse) {
  try {
    const response = await fetch(url);
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
}

async function handleHttpRequest(message, sendResponse) {
  try {
    const headers = new Headers(message.headers || {});
    const fetchOptions = {
      method: typeof message.method === 'string' ? message.method : 'GET',
      headers,
    };

    if (typeof message.body === 'string') {
      fetchOptions.body = message.body;
    }

    const response = await fetch(message.url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let json = null;

    if (text && contentType.includes('application/json')) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    sendResponse({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      json,
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
