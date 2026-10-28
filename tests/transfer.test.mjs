import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { encodeTransfer } from '../extension/transfer-packet.js';
import { chatMetadataText, summarizeChat } from '../extension/chat-metadata.js';

const text = '<style>.x{color:red}</style><script>window.x="完整脚本"</script><iframe srcdoc="保留框架"></iframe>\n```html\n<p>中文与 emoji 😀</p>\n```';
const document = {
 format: 'st-nook-transfer', version: 1,
 book: { title: '兼容测试', rules: [{ findRegex: '/正文/g', replaceString: '<b>{{match}}</b>' }], cover: 'data:image/jpeg;base64,AA==' },
 files: [{ name: 'renamed.jsonl', rows: [
  { create_date: '2026-10-28T12:34:56+08:00' },
  { name: '角色', is_user: false, mes: text.repeat(1000), send_date: '2026-10-28T12:35:00+08:00' },
  { name: '用户', is_user: true, mes: '用户正文' },
  { role: 'system', mes: '系统正文' },
 ] }],
};

async function verifyLegacyFormat() {
 const packet = await encodeTransfer(document);
 const prefix = 'ST-NOOK-TRANSFER:1:GZIP:';
 assert.ok(packet.startsWith(prefix));
 // Decode with standard gzip, independently of the plugin's decoder.
 const restored = JSON.parse(gunzipSync(Buffer.from(packet.slice(prefix.length), 'base64')).toString('utf8'));
 assert.deepEqual(restored, document);
}
await verifyLegacyFormat();
const native = globalThis.CompressionStream;
try { globalThis.CompressionStream = undefined;await verifyLegacyFormat(); }
finally { globalThis.CompressionStream = native; }

assert.deepEqual(summarizeChat(document.files[0].rows, '角色'), { created: '2026-10-28T12:34:56+08:00', totalFloors: 3, characterFloors: 1 });
assert.match(chatMetadataText({ file_name: 'renamed.jsonl', metadataLoaded: true }), /未记录/);
assert.match(chatMetadataText({ file_name: '角色 - 2026-10-29@1h2m3s4ms.jsonl' }), /2026-10-29 01:02:03（文件名）/);

let copied;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { maxTouchPoints: 1, clipboard: {
 writeText: async text => { copied = text; },
 write: async items => { copied = await (await items[0].getType('text/plain')).text(); },
} } });
globalThis.matchMedia = () => ({ matches: true });
globalThis.ClipboardItem = class { constructor(values) { this.values = values; } getType(type) { return this.values[type]; } };
const { clipboardTooLarge, copyText, reserveClipboardWrite, clipboardResult } = await import('../extension/clipboard.js');
const large = randomBytes(310000).toString('base64');
assert.ok(clipboardTooLarge(large));
assert.equal(await copyText(large), true);
assert.equal(copied, large);
assert.equal(await reserveClipboardWrite(Promise.resolve(large)), true);
assert.equal(copied, large);
assert.equal(await clipboardResult(Promise.resolve(false)), false);
console.log('Passed: legacy gzip compatibility, exact rich content, compressor fallback, chat metadata and large mobile clipboard.');
