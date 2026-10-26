import { mobileTextSelection } from './mobile-selection.js?v=2.0.7';

const PAGE_SIZE = 200;

export function visibleText(root, { onUnavailable = () => {} } = {}) {
 const blocks = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row']);
 function read(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  if (node.matches('script,style,template,noscript,[hidden],[aria-hidden="true"],.code-copy,.code-copy-btn')) return '';
  const style = node.ownerDocument.defaultView?.getComputedStyle(node);
  if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0') return '';
  if (node.tagName === 'BR') return '\n';
  if (node.tagName === 'IFRAME') {
   try { if (node.contentDocument?.body) return '\n' + read(node.contentDocument.body) + '\n'; }
   catch {}
   onUnavailable(); return '';
  }
  if (node.matches('input,textarea')) return node.type === 'password' ? '' : node.value;
  if (node.tagName === 'IMG') return node.alt || '';
  let children = [...node.childNodes];
  if (node.tagName === 'DETAILS' && !node.open) children = children.filter(child => child.nodeType === Node.ELEMENT_NODE && child.tagName === 'SUMMARY');
  const text = children.map(read).join('');
  return blocks.has(style?.display) ? '\n' + text + '\n' : text;
 }
 return read(root).replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function mountChatPreviews(dialog, { chats, loadRows, readLive, copyText }) {
 let disposed = false, renderer;
 const states = new Map();
 for (const details of dialog.querySelectorAll('[data-nook-preview]')) {
  const file = Number(details.dataset.nookPreview), panel = details.querySelector('.st-nook-preview-panel');
  const state = { file, details, panel, messages: null, index: 0, ticket: 0, text: '', selection: mobileTextSelection(panel) };
  states.set(file, state);
  details.addEventListener('toggle', () => { if (!details.open) state.selection?.reset(); else if (!state.messages) load(state); });
 }
 function active(state, ticket) { return !disposed && dialog.isConnected && state.ticket === ticket; }
 function status(state, text) { state.panel.querySelector('[data-preview-status]').textContent = text; }
 function controls(state) {
  const total = state.messages.length, group = Math.floor(state.index / PAGE_SIZE), start = group * PAGE_SIZE;
  const range = state.panel.querySelector('[data-preview-range]');
  range.parentElement.hidden = total <= PAGE_SIZE;
  range.replaceChildren(...Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => new Option(`${i * PAGE_SIZE + 1}–${Math.min(total, (i + 1) * PAGE_SIZE)} 层`, String(i), false, i === group)));
  const floors = state.panel.querySelector('[data-preview-floor]');
  floors.replaceChildren(...state.messages.slice(start, start + PAGE_SIZE).map((row, offset) => new Option(`第 ${start + offset + 1} 层 · ${String(row.name || (row.is_user ? '我' : '角色')).slice(0, 30)}`, String(start + offset), false, start + offset === state.index)));
  const jump = state.panel.querySelector('[data-preview-jump]');
  jump.max = String(total); jump.value = String(state.index + 1);
  state.panel.querySelector('[data-preview-total]').textContent = `共 ${total} 层`;
  state.panel.querySelector('[data-preview-prev]').disabled = state.index === 0;
  state.panel.querySelector('[data-preview-next]').disabled = state.index === total - 1;
 }
 async function load(state, refresh = false) {
  const ticket = ++state.ticket;
  state.panel.setAttribute('aria-busy', 'true');
  state.panel.querySelector('[data-preview-copy]').disabled = true;
  state.selection?.reset();
  status(state, '正在读取…');
  try {
   const rows = await loadRows(chats[state.file], { refresh });
   if (!active(state, ticket)) return;
   state.messages = rows.filter(row => typeof row?.mes === 'string' || typeof row?.content === 'string');
   if (!state.messages.length) throw Error('此文件没有文本楼层。');
   let usable = 0;
   state.depths = new Array(state.messages.length);
   for (let i = state.messages.length - 1; i >= 0; i--) { if (!state.messages[i].is_system) state.depths[i] = usable++; }
   state.index = Math.min(state.index, state.messages.length - 1);
   state.panel.querySelector('.st-nook-preview-tools').hidden = false;
   controls(state); await show(state);
  } catch (error) {
   if (active(state, ticket)) { state.messages = null; status(state, error.message || '读取失败，请点击刷新重试。'); }
  } finally { if (active(state, ticket)) state.panel.removeAttribute('aria-busy'); }
 }
 async function show(state) {
  const ticket = ++state.ticket, content = state.panel.querySelector('[data-preview-content]');
  state.panel.setAttribute('aria-busy', 'true');
  state.panel.querySelector('[data-preview-copy]').disabled = true;
  state.text = ''; content.textContent = ''; status(state, '正在显示…'); controls(state);
  try {
   const live = readLive(chats[state.file], state.index);
   let text, source, incomplete = false;
   if (live) { text = visibleText(live, { onUnavailable: () => { incomplete = true; } }); source = '当前界面'; }
   else {
    renderer ||= import('./preview-renderer.js?v=2.0.7').catch(error => { renderer = null; throw error; });
    const { renderDisplayText } = await renderer;
    if (!active(state, ticket)) return;
    text = renderDisplayText(state.messages[state.index], { index: state.index, depth: state.depths[state.index], visibleText });
    source = '当前显示规则';
   }
   if (!active(state, ticket)) return;
   state.text = text;
   if (state.selection) state.selection.setText(text || '本层没有可见文本。');
   else content.textContent = text || '本层没有可见文本。';
   content.scrollTop = 0;
   status(state, `第 ${state.index + 1} 层 · ${source}${incomplete ? ' · 部分框架需在原聊天查看' : ''}`);
   state.panel.querySelector('[data-preview-copy]').disabled = !text;
  } catch (error) { if (active(state, ticket)) status(state, error.message || '显示失败，请重试。'); }
  finally { if (active(state, ticket)) state.panel.removeAttribute('aria-busy'); }
 }
 dialog.addEventListener('change', event => {
  const details = event.target.closest('[data-nook-preview]'); if (!details) return;
  const state = states.get(Number(details.dataset.nookPreview)); if (!state.messages) return;
  if (event.target.matches('[data-preview-range]')) state.index = Number(event.target.value) * PAGE_SIZE;
  else if (event.target.matches('[data-preview-floor]')) state.index = Number(event.target.value);
  else if (event.target.matches('[data-preview-jump]')) state.index = Math.max(0, Math.min(state.messages.length - 1, Math.trunc(Number(event.target.value) || 1) - 1));
  else return;
  show(state);
 });
 dialog.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('[data-preview-jump]')) { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); }
 });
 dialog.addEventListener('click', async event => {
  const button = event.target.closest('[data-preview-prev],[data-preview-next],[data-preview-last],[data-preview-refresh],[data-preview-copy]');
  if (!button || button.disabled) return;
  const state = states.get(Number(button.closest('[data-nook-preview]').dataset.nookPreview));
  if (button.hasAttribute('data-preview-refresh')) { load(state, true); return; }
  if (!state.messages) return;
  if (button.hasAttribute('data-preview-copy')) {
   const selected = state.selection?.selected();
   try {
    if (!await copyText(selected || state.text)) {
     if (state.selection) { if (selected) state.selection.focusSelected(); else state.selection.selectAll(); }
     else {
      const content = state.panel.querySelector('[data-preview-content]'), range = document.createRange();
      range.selectNodeContents(content); const selection = getSelection();selection.removeAllRanges();selection.addRange(range);
     }
     status(state, '已选中文本，请按 Ctrl+C 或长按复制。');
    } else status(state, selected ? '选中文字已复制' : `第 ${state.index + 1} 层文本已复制`);
   } catch { status(state, '请在文本区域手动选择并复制。'); }
   return;
  }
  state.index = button.hasAttribute('data-preview-last') ? state.messages.length - 1 : Math.max(0, Math.min(state.messages.length - 1, state.index + (button.hasAttribute('data-preview-prev') ? -1 : 1)));
  show(state);
 });
 return () => { disposed = true;for (const state of states.values()) state.selection?.dispose();states.clear(); };
}

export function previewMarkup() {
 return `<div class="st-nook-preview-panel"><div class="st-nook-preview-tools" hidden><label class="st-nook-preview-range" hidden>区间<select data-preview-range aria-label="楼层区间"></select></label><label class="st-nook-preview-select">楼层<select data-preview-floor aria-label="选择楼层"></select></label><div class="st-nook-preview-nav"><button type="button" class="menu_button" data-preview-prev aria-label="上一层">‹</button><button type="button" class="menu_button" data-preview-next aria-label="下一层">›</button><button type="button" class="menu_button" data-preview-last>末层</button></div><label class="st-nook-preview-jump">跳转<input type="number" data-preview-jump min="1" step="1" inputmode="numeric" aria-label="跳转楼层"></label><small data-preview-total></small></div><div class="st-nook-preview-content" data-preview-content tabindex="0" role="region" aria-label="本层文本"></div><div class="st-nook-preview-bottom"><small data-preview-status role="status"></small><button type="button" class="menu_button" data-preview-refresh>刷新</button><button type="button" class="menu_button" data-preview-copy disabled>复制本层</button></div></div>`;
}
