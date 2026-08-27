const PUSH_CONTEXT_CACHE = "vq-push-context-v1";
const PUSH_CONTEXT_URL = "/__vq/push-context";
const DEFAULT_NOTIFICATION = {
  title: "VocabuQuiz",
  body: "新しい通知があります。アプリを開いて確認してください。",
  url: "/#notifications",
  tag: "vq-notification"
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function loadPushContext() {
  try {
    const cache = await caches.open(PUSH_CONTEXT_CACHE);
    const res = await cache.match(PUSH_CONTEXT_URL);
    if (!res) return null;
    const data = await res.json();
    if (!data || typeof data !== "object") return null;
    const subscriptionId = String(data.subscriptionId || "").trim();
    const pullToken = String(data.pullToken || "").trim();
    const apiBase = String(data.apiBase || "").trim();
    if (!subscriptionId || !pullToken) return null;
    return { subscriptionId, pullToken, apiBase };
  } catch {
    return null;
  }
}

async function savePushContext(context) {
  const cache = await caches.open(PUSH_CONTEXT_CACHE);
  await cache.put(PUSH_CONTEXT_URL, new Response(JSON.stringify(context || {}), {
    headers: { "Content-Type": "application/json" }
  }));
}

async function clearPushContext() {
  const cache = await caches.open(PUSH_CONTEXT_CACHE);
  await cache.delete(PUSH_CONTEXT_URL);
}

async function pullQueuedNotifications() {
  const context = await loadPushContext();
  if (!context) return [];
  const apiBase = String(context.apiBase || self.location.origin || "").trim().replace(/\/+$/, "") || self.location.origin;
  const params = new URLSearchParams({
    subscriptionId: context.subscriptionId,
    token: context.pullToken
  });
  const res = await fetch(`${apiBase}/api/push/pull?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "omit"
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];
  return items.map((item) => ({
    title: String(item?.title || DEFAULT_NOTIFICATION.title),
    body: String(item?.body || DEFAULT_NOTIFICATION.body),
    url: String(item?.url || DEFAULT_NOTIFICATION.url),
    tag: String(item?.tag || DEFAULT_NOTIFICATION.tag)
  }));
}

self.addEventListener("message", (event) => {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  if (data.type === "vq-set-push-context") {
    event.waitUntil(savePushContext(data.context || {}));
    return;
  }
  if (data.type === "vq-clear-push-context") {
    event.waitUntil(clearPushContext());
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let items = [];
    try {
      if (event.data) {
        try {
          const payload = event.data.json();
          if (payload && (payload.title || payload.body || payload.url)) {
            items = [{
              title: String(payload.title || DEFAULT_NOTIFICATION.title),
              body: String(payload.body || DEFAULT_NOTIFICATION.body),
              url: String(payload.url || DEFAULT_NOTIFICATION.url),
              tag: String(payload.tag || DEFAULT_NOTIFICATION.tag)
            }];
          }
        } catch {
          const text = event.data.text ? await event.data.text() : "";
          if (text) {
            items = [{ ...DEFAULT_NOTIFICATION, body: String(text) }];
          }
        }
      }
    } catch {}
    if (!items.length) {
      items = await pullQueuedNotifications().catch(() => []);
    }
    if (!items.length) {
      items = [DEFAULT_NOTIFICATION];
    }
    for (const item of items) {
      await self.registration.showNotification(item.title, {
        body: item.body,
        icon: "/assets/icon/pwa-192.png",
        badge: "/assets/icon/pwa-192.png",
        tag: item.tag,
        renotify: false,
        data: { url: item.url }
      });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url || DEFAULT_NOTIFICATION.url);
  event.waitUntil((async () => {
    const matched = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of matched) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: "vq-open-tab", tab: "notifications" });
          return;
        }
      } catch {}
    }
    await self.clients.openWindow(targetUrl);
  })());
});
