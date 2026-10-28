export const mobileClipboard = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer:coarse)').matches;
export const clipboardTooLarge = text => mobileClipboard() && text.length > 400000;

function settled(promise) {
 return Promise.resolve(promise).then(() => true, () => false);
}

export function reserveClipboardWrite(text) {
 // Reserve clipboard access in the original tap, before loading or compression awaits.
 if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return null;
 try {
  const blob = text.then(value => {
   if (clipboardTooLarge(value)) throw Error('资料超过手机剪贴板容量，请下载备份');
   return new Blob([value], { type: 'text/plain' });
  });
  blob.catch(() => {});
  return settled(navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]));
 } catch { return null; }
}

export async function clipboardResult(attempt, timeout = 4000) {
 let timer;
 try { return await Promise.race([attempt, new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); })]); }
 finally { clearTimeout(timer); }
}

function legacyCopy(text) {
 const host = document.querySelector('.st-nook-dialog') || document.body;
 const active = document.activeElement, start = active?.selectionStart, end = active?.selectionEnd;
 const input = document.createElement('textarea');
 input.value = text;input.inputMode = 'none';input.setAttribute('aria-label', '复制书籍资料');
 input.style.cssText = 'position:fixed;left:16px;top:16px;width:calc(100% - 32px);height:96px;font-size:16px;user-select:text!important;-webkit-user-select:text!important;';
 host.append(input);input.focus({ preventScroll: true });input.select();input.setSelectionRange(0, text.length);
 let copied = false;
 try { copied = document.execCommand('copy'); } catch {}
 input.remove();
 if (active?.isConnected) { active.focus({ preventScroll: true });if (typeof start === 'number') active.setSelectionRange?.(start, end); }
 return copied;
}

export function copyText(text) {
 if (clipboardTooLarge(text)) return Promise.resolve(false);
 // The prepared-data retry reaches this call synchronously from the user's tap.
 if (navigator.clipboard?.writeText) {
  try { return clipboardResult(settled(navigator.clipboard.writeText(text))).then(copied => copied || legacyCopy(text)); }
  catch {}
 }
 return Promise.resolve(legacyCopy(text));
}
