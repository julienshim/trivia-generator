const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// One manifest serves both browsers: the background block carries BOTH keys.
// Firefox may need `scripts` (extension service workers can be disabled
// there); Chrome needs `service_worker`. Verified in both, 2026-10-28.
test("every file referenced by manifest.json exists", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
  );
  const refs = [
    ...(Array.isArray(manifest.background.scripts)
      ? manifest.background.scripts
      : []),
    ...(manifest.background.service_worker
      ? [manifest.background.service_worker]
      : []),
  ];
  for (const entry of manifest.content_scripts) {
    refs.push(...entry.js);
  }
  assert.ok(refs.length >= 7, `expected at least 7 references, got ${refs.length}`);
  for (const ref of refs) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", ref)),
      `manifest references a missing file: ${ref}`
    );
  }
});
