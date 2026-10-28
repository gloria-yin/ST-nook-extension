const PREFIX = 'ST-NOOK-TRANSFER:1:';

export const isTransferPacket = value => typeof value === 'string' && value.trimStart().startsWith(PREFIX);

function validate(data) {
 if (data?.format !== 'st-nook-transfer' || data.version !== 1 || typeof data.book?.title !== 'string' || !Array.isArray(data.book.rules)) throw Error('请选择酒馆插件复制或导出的书籍资料。');
 if (!Array.isArray(data.files) || !data.files.length || !data.files.every(file => typeof file?.name === 'string' && Array.isArray(file.rows) && file.rows.every(row => row && typeof row === 'object') && file.rows.some(row => typeof row.mes === 'string' || typeof row.content === 'string'))) throw Error('书籍资料缺少有效聊天内容，请回酒馆重新复制。');
 return data;
}

export async function encodeTransfer(data) {
 validate(data);
 return encodeTransferBlob(new Blob([JSON.stringify(data)]));
}

export async function encodeTransferBlob(blob) {
 const native = typeof CompressionStream === 'undefined' ? Promise.resolve(null) : new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(value => new Uint8Array(value)).catch(() => null);
 let compressed;
 try {
  const { Deflate } = await import('./vendor/pako-deflate.js?v=1.0.11');
  const encoder = new Deflate({ gzip: true, level: 9 });
  // Keep the standard gzip payload so existing standalone readers can decode it.
  for (let start = 0; start < blob.size; start += 262144) {
   encoder.push(new Uint8Array(await blob.slice(start, start + 262144).arrayBuffer()), false);
   if (encoder.err) throw Error(encoder.msg);
   await new Promise(resolve => setTimeout(resolve, 0));
  }
  encoder.push(new Uint8Array(0), true);
  if (encoder.err) throw Error(encoder.msg);
  compressed = encoder.result;
 } catch { /* Use the browser encoder if the optional compressor is unavailable. */ }
 const standard = await native;
 if (standard && (!compressed || standard.length < compressed.length)) compressed = standard;
 if (!compressed) return PREFIX + 'JSON:' + await blob.text();
 const chunks = [];
 for (let start = 0; start < compressed.length; start += 32768) chunks.push(String.fromCharCode(...compressed.subarray(start, start + 32768)));
 return PREFIX + 'GZIP:' + btoa(chunks.join(''));
}

export async function decodeTransfer(value) {
 const text = String(value || '').trim();
 if (text.startsWith('{')) {
  try { return validate(JSON.parse(text)); }
  catch (error) { if (error instanceof SyntaxError) throw Error('书籍资料不完整，请回酒馆重新复制或导出。'); throw error; }
 }
 if (!isTransferPacket(text)) throw Error('没有找到书籍资料，请先在酒馆点击“复制资料”。');
 const payload = text.slice(PREFIX.length);
 let json;
 if (payload.startsWith('JSON:')) json = payload.slice(5);
 else if (payload.startsWith('GZIP:')) {
  if (typeof DecompressionStream === 'undefined') throw Error('当前浏览器不支持解压书籍资料，请使用新版 Edge、Chrome 或 Firefox。');
  try {
   const encoded = atob(payload.slice(5)), bytes = new Uint8Array(encoded.length);
   for (let index = 0; index < encoded.length; index++) bytes[index] = encoded.charCodeAt(index);
   json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } catch { throw Error('复制的资料不完整，请回酒馆重新复制。'); }
 } else throw Error('此导入格式暂不支持，请更新酒馆书屋和插件。');
 try { return validate(JSON.parse(json)); }
 catch (error) { if (error instanceof SyntaxError) throw Error('复制的资料不完整，请回酒馆重新复制。'); throw error; }
}
