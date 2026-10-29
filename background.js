const ext = globalThis.browser ?? globalThis.chrome;
ext.action.onClicked.addListener((tab) => {
  const sent = ext.tabs.sendMessage(tab.id, { action: "generate" });
  // browser namespace (Firefox): sendMessage rejects when the page has no
  // content script (out-of-scope click) — keep that a silent no-op.
  // chrome namespace (Chrome): returns undefined — the guard is a no-op.
  if (sent && sent.catch) sent.catch(() => {});
});
