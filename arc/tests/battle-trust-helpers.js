"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const battleSource = fs.readFileSync(path.join(__dirname, "../battle.js"), "utf8");
const shaStart = battleSource.indexOf("  function sha256Fallback(bytes) {");
const shaEnd = battleSource.indexOf("\n  async function computeTaskHash", shaStart);
assert.ok(shaStart >= 0 && shaEnd > shaStart, "find SHA fallback helpers");
const shaContext = vm.createContext({ Uint8Array, Uint32Array, DataView, Math, Number, RangeError });
vm.runInContext(battleSource.slice(shaStart, shaEnd) +
  "\nglobalThis.fallback=sha256Fallback;globalThis.bitWords=sha256BitLengthWords;", shaContext);

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const hostStart = html.indexOf("function battleDevHost(h){");
const hostEnd = html.indexOf("\nconst BATTLE_API", hostStart);
assert.ok(hostStart >= 0 && hostEnd > hostStart, "find private host guard helpers");
const hostContext = vm.createContext({ URL, URLSearchParams });
vm.runInContext(html.slice(hostStart, hostEnd) +
  "\nglobalThis.devHost=battleDevHost;globalThis.resolveApi=battleResolveApi;", hostContext);

let checks = 0;
function test(name, fn) {
  fn(); checks++;
  console.log("  ✓ " + name);
}

test("SHA-256 matches node:crypto for padding boundaries and randomized byte arrays", () => {
  const lengths = [0, 1, 2, 55, 56, 63, 64, 65, 127, 128, 1024, 65537];
  for (const length of lengths) {
    const input = crypto.randomBytes(length);
    const expected = crypto.createHash("sha256").update(input).digest("hex");
    assert.equal(shaContext.fallback(input), expected, "length=" + length);
  }
  for (let i = 0; i < 30; i++) {
    const input = crypto.randomBytes(crypto.randomInt(0, 2049));
    assert.equal(shaContext.fallback(input), crypto.createHash("sha256").update(input).digest("hex"));
  }
});

test("SHA-256 fallback hashes UTF-8 multibyte text identically", () => {
  for (const text of ["żółć", "焊接", "🔥⚙️", "e\u0301", "Velda — смена"]) {
    const bytes = Buffer.from(text, "utf8");
    assert.equal(shaContext.fallback(bytes), crypto.createHash("sha256").update(bytes).digest("hex"));
  }
});

test("SHA-256 64-bit bit length words cross the 2^29-byte low-word boundary", () => {
  for (const [bytes, high, low] of [
    [0, 0, 0], [1, 0, 8], [0x1fffffff, 0, 0xfffffff8],
    [0x20000000, 1, 0], [0x20000001, 1, 8], [0x40000000, 2, 0]
  ]) assert.deepEqual({ ...shaContext.bitWords(bytes) }, { high, low });
});

test("Battle dev host allowlist accepts localhost and private IPv4/IPv6 only", () => {
  for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "10.255.255.254", "172.16.0.1", "172.31.255.254",
    "192.168.1.1", "[::1]", "fd12:3456::1", "[fd12:3456::1]", "fe80::1234"]) {
    assert.equal(hostContext.devHost(host), true, host);
  }
  for (const host of ["example.com", "gorweldarc.com", "192.168.1.1.evil.com", "192.168.1.999", "10.300.1.2",
    "172.32.0.1", "172.15.0.1", "8.8.8.8", "192.168.01.1", "127.1", "[2001:4860:4860::8888]",
    "fe7f::1", "[fe80::1%25eth0]", "::", "2001:db8::1", "[::ffff:192.168.1.1]"]) {
    assert.equal(hostContext.devHost(host), false, host);
  }
});

test("battleResolveApi allows private API origins and rejects spoofing, userinfo and public origins", () => {
  const resolve = (host, api) => hostContext.resolveApi(host, "?battleApi=" + encodeURIComponent(api));
  assert.equal(resolve("localhost", "http://127.0.0.1:8899/path/"), "http://127.0.0.1:8899/path");
  assert.equal(resolve("192.168.1.40", "http://192.168.1.40:8899"), "http://192.168.1.40:8899");
  assert.equal(resolve("[fd12:3456::1]", "http://[fd12:3456::1]:8899"), "http://[fd12:3456::1]:8899");
  for (const [host, api] of [
    ["example.com", "http://127.0.0.1:8899"], ["localhost", "https://api.gorweldarc.com"],
    ["localhost", "http://192.168.1.1.evil.com:8899"], ["localhost", "http://user:pass@192.168.1.1:8899"],
    ["localhost", "http://192.168.1.999:8899"], ["localhost", "ftp://192.168.1.1"],
    ["localhost", "http://[2001:db8::1]:8899"], ["localhost", "http://[fe80::1%25eth0]:8899"]
  ]) assert.equal(resolve(host, api), null, host + " -> " + api);
  assert.equal(hostContext.resolveApi("localhost", ""), null);
});

console.log(`\n${checks}/${checks} Battle trust helper groups passed`);
