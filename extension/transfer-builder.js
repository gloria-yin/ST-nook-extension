import { compactRow, transferOperation } from './transfer-document.js?v=2.0.11';

export const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));

export async function createTransferBuilder(book, signal) {
 let worker, serial = 0, closed = false, failure;
 const pending = new Map(), fallback = { signal };
 const abortError = () => signal?.reason || new DOMException('已取消', 'AbortError');
 function close(reason = abortError()) {
  if (closed) return;
  closed = true; worker?.terminate();
  fallback.document = null;fallback.blob = null;
  for (const request of pending.values()) request.reject(reason);
  pending.clear(); signal?.removeEventListener('abort', aborted);
 }
 function aborted() { close(); }
 if (signal?.aborted) throw abortError();
 signal?.addEventListener('abort', aborted, { once: true });
 function send(type, value) {
  if (closed) return Promise.reject(abortError());
  if (failure) return Promise.reject(failure);
  if (!worker) return transferOperation(fallback, { type, value });
  return new Promise((resolve, reject) => {
   const id = ++serial; pending.set(id, { resolve, reject });
   try { worker.postMessage({ id, type, value }); }
   catch (error) { pending.delete(id); reject(error); }
  });
 }
 try {
  worker = new Worker(new URL('./transfer-worker.js?v=2.0.11', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
   const request = pending.get(data.id); if (!request) return;
   pending.delete(data.id); data.error ? request.reject(Error(data.error)) : request.resolve(data.value);
  };
  worker.onerror = event => { event.preventDefault();failure = Error('后台处理不可用，请关闭窗口后重试');for (const request of pending.values()) request.reject(failure);pending.clear(); };
  await send(book ? 'start' : 'ready', book);
 } catch (error) {
  worker?.terminate(); worker = null;failure = null;
  if (closed) throw error;
  await send(book ? 'start' : 'ready', book);
 }
 return {
  read: request => send('read', request),
  inspect: request => send('inspect', request),
  async file(name, rows) {
   await send('file', name);
   let batch = [], length = 0, started = performance.now();
   for (const source of rows) {
    // Only fields used by the reader: no alternate swipes, token caches or generation metadata.
    const row = compactRow(source);
    batch.push(row); length += String(row.mes ?? row.content ?? '').length;
    if (batch.length >= 100 || length >= 262144 || performance.now() - started > 8) {
     await send('rows', batch); batch = []; length = 0;
     await yieldUI(); started = performance.now();
    }
   }
   if (batch.length) await send('rows', batch);
  },
  finish: () => send('finish'),
  encode: () => send('encode'),
  close,
 };
}
