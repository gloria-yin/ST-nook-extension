import { mountChatPreviews } from './chat-preview.js?v=2.0.9';
import { clipboardResult, clipboardTooLarge, copyText, reserveClipboardWrite } from './clipboard.js?v=2.0.10';
import { getContext } from '/scripts/extensions.js';
import { getPastCharacterChats, getRequestHeaders, substituteParams, substituteParamsExtended } from '/script.js';
import { getScriptsByType, SCRIPT_TYPES } from '/scripts/extensions/regex/engine.js';

const READER_URL = 'https://st-nook.pages.dev/';
const RECEIVE_URL = READER_URL + '#st-nook-receive=clipboard';
const VERSION = '2.0.10';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let activeDialog = null;
const chatLists = new Map();
const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));

async function listChats(character, characterId, signal) {
 const cached = chatLists.get(character.avatar);
 if (cached && Date.now() - cached.time < 30000) return cached.chats;
 let chats;
 // This endpoint can list filenames without opening and scanning every chat file.
 const response = await fetch('/api/characters/chats', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: character.avatar, simple: true }), signal });
 if (response.ok) {
  const data = await response.json();
  if (!data?.error) chats = Object.values(data).filter(chat => typeof chat?.file_name === 'string');
 }
 if (!chats) { if (signal.aborted) throw signal.reason; chats = await getPastCharacterChats(characterId); }
 chats.sort((a, b) => b.file_name.localeCompare(a.file_name));
 chatLists.set(character.avatar, { chats, time: Date.now() });
 if (chatLists.size > 8) chatLists.delete(chatLists.keys().next().value);
 return chats;
}

function chatMarkup(chat, index, current, checked = false) {
 const name = chat.file_name.replace(/\.jsonl$/, '');
 return `<div class="st-nook-chat-item"><label class="st-nook-chat"><input type="checkbox" data-nook-chat="${index}" ${checked ? 'checked' : ''}><span>${escape(name)}${name === current ? '<small>当前聊天</small>' : ''}<small>${chat.chat_items != null ? `${chat.chat_items} 条消息` : '展开查看角色楼层'}</small></span></label><details class="st-nook-chat-preview" data-nook-preview="${index}"><summary>查看楼层</summary></details></div>`;
}

function addButton() {
 const anchor = document.getElementById('chat_import_button');
 if (!anchor || document.getElementById('st-nook-add-book')) return;
 const button = document.createElement('button'); button.type = 'button'; button.id = 'st-nook-add-book'; button.className = 'menu_button menu_button_icon';
 button.innerHTML = '<i class="fa-solid fa-book-open"></i><span>添加书籍</span>';
 button.onclick = () => openImporter().catch(error => { console.error('[ST Nook]', error); toastr.error(error.message, '酒馆书屋'); });
 anchor.after(button);
}

async function openImporter() {
 if (activeDialog) { activeDialog.focus(); return; }
 const context = getContext(), character = context.characters?.[context.characterId];
 if (!character || context.groupId) { toastr.info('请先打开一张角色卡的聊天。', '酒馆书屋'); return; }
 const current = character.chat || context.chatId || '';
 const chats = current ? [{ file_name: current + '.jsonl', chat_items: context.chat.length }] : [];
 const groups = [['global', '全局正则', SCRIPT_TYPES.GLOBAL], ['preset', '预设正则', SCRIPT_TYPES.PRESET], ['local', '局部正则', SCRIPT_TYPES.SCOPED]];
 const rules = groups.map(([id, name, type]) => ({ id, name, rules: getScriptsByType(type, { allowedOnly: true }).filter(rule => !rule.disabled) }));
 const dialog = document.createElement('dialog'); dialog.className = 'st-nook-dialog'; activeDialog = dialog;
 dialog.innerHTML = `<form method="dialog">
 <header><div><h2>添加书籍 <small class="st-nook-version">v${VERSION}</small></h2><p>${escape(character.name)} · 酒馆书屋</p></div><button class="st-nook-close" value="cancel" formnovalidate aria-label="关闭">×</button></header>
 <div class="st-nook-body">
 <label class="st-nook-field">书籍名称<input id="st-nook-title" class="text_pole" maxlength="80" value="${escape(character.name)}" required></label>
 <fieldset><legend>聊天内容</legend><label class="st-nook-check"><input type="checkbox" id="st-nook-all-chats" disabled>选择全部聊天</label><div class="st-nook-chat-list">${chats.map((chat, index) => chatMarkup(chat, index, current, true)).join('')}</div><small class="st-nook-hint" id="st-nook-list-status" role="status">正在读取其他聊天…</small></fieldset>
 <fieldset><legend>导入已开启的正则</legend>${rules.map(group => `<details class="st-nook-rule-group"><summary><label class="st-nook-check"><input type="checkbox" data-nook-group="${group.id}" ${group.rules.length ? 'checked' : 'disabled'}>${group.name}<small>${group.rules.length} 条</small></label></summary><div>${group.rules.map((rule, index) => `<label class="st-nook-check"><input type="checkbox" data-nook-rule="${group.id}:${index}" checked><span>${escape(rule.scriptName || '未命名规则')}${rule.promptOnly ? ' · 仅提示词' : ''}</span></label>`).join('') || '<p class="st-nook-hint">没有已开启的规则</p>'}</div></details>`).join('')}</fieldset>
 <label class="st-nook-check"><input type="checkbox" id="st-nook-avatar" checked>使用当前角色头像作为封面</label>
 <label class="st-nook-field" id="st-nook-manual-copy" hidden>可复制内容<textarea id="st-nook-copy-text" class="text_pole" rows="4" readonly inputmode="none" spellcheck="false"></textarea></label>
 </div>
 <p id="st-nook-status" role="status"></p><footer class="st-nook-export-actions"><button type="button" class="menu_button st-nook-submit" id="st-nook-copy">复制资料</button><button type="button" class="menu_button" id="st-nook-download">下载备份</button><button type="button" class="menu_button" id="st-nook-open-reader">在线导入</button></footer></form>`;
 document.body.append(dialog); dialog.showModal();
 const $ = selector => dialog.querySelector(selector), $$ = selector => [...dialog.querySelectorAll(selector)];
 const report = text => { if (dialog.isConnected) $('#st-nook-status').textContent = text; };
 let prepared = null, busy = false, loader;
 const requests = new Map(), controller = new AbortController();
 const isCurrent = chat => {
  const active = getContext();
  return active.characterId === context.characterId && (active.chatId || active.characters?.[active.characterId]?.chat || '') === chat.file_name.replace(/\.jsonl$/, '');
 };
 async function loadRows(chat, { refresh = false } = {}) {
  if (refresh) clearPrepared();
  if (isCurrent(chat)) {
   const active = getContext();
   return [{ character_name: character.name }, ...active.chat];
  }
  const key = chat.file_name;
  if (refresh) requests.delete(key);
  if (!requests.has(key)) {
   const pending = (async () => {
    loader ||= import('./transfer-builder.js?v=2.0.9').then(({ createTransferBuilder }) => createTransferBuilder(null, controller.signal)).catch(error => { loader = null;throw error; });
    const background = await loader;
    return background.read({ headers: getRequestHeaders(), body: { ch_name: character.name, avatar_url: character.avatar, file_name: key.replace(/\.jsonl$/, '') } });
   })();
   requests.set(key, pending);pending.catch(() => { if (requests.get(key) === pending) requests.delete(key); });
  }
  return requests.get(key);
 }
 const disposePreviews = mountChatPreviews(dialog, { chats, loadRows, copyText, isCharacterMessage: row => !row.is_user && row.role !== 'user' && row.role !== 'system' && (!row.is_system || row.name === character.name), readLive: (chat, index) => {
  if (!isCurrent(chat)) return null;
  const message = document.querySelector(`#chat .mes[mesid="${index}"]`);
  if (!message) return null;
  const candidates = [...message.querySelectorAll('.TH-streaming,.mes_text')];
  return candidates.find(node => node.checkVisibility ? node.checkVisibility() : getComputedStyle(node).display !== 'none') || candidates[0] || null;
 } });
 function clearPrepared() { prepared?.builder.close(); prepared = null;$('#st-nook-copy-text').value = '';$('#st-nook-manual-copy').hidden = true;$('#st-nook-copy').textContent = '复制资料'; }
 dialog.addEventListener('close', () => { controller.abort();disposePreviews();requests.clear();clearPrepared();activeDialog = null;dialog.remove(); });
 dialog.addEventListener('change', event => {
  const input = event.target;
  if (input.matches('#st-nook-all-chats')) $$('[data-nook-chat]').forEach(element => element.checked = input.checked);
  if (input.matches('[data-nook-chat]')) {
   const all = $$('[data-nook-chat]'), parent = $('#st-nook-all-chats');
   parent.checked = all.every(element => element.checked); parent.indeterminate = !parent.checked && all.some(element => element.checked);
  }
  if (input.matches('[data-nook-group]')) $$(`[data-nook-rule^="${input.dataset.nookGroup}:"]`).forEach(element => element.checked = input.checked);
  if (input.matches('[data-nook-rule]')) {
   const group = input.dataset.nookRule.split(':')[0], all = $$(`[data-nook-rule^="${group}:"]`), parent = $(`[data-nook-group="${group}"]`);
   parent.checked = all.every(element => element.checked); parent.indeterminate = all.some(element => element.checked) && !parent.checked;
  }
  if (input.matches('[data-nook-chat],[data-nook-rule],[data-nook-group],#st-nook-all-chats,#st-nook-avatar')) clearPrepared();
 });
 $('#st-nook-title').addEventListener('input', clearPrepared);
 async function populateChats() {
  const status = $('#st-nook-list-status'); status.textContent = '正在读取其他聊天…';
  try {
   const listed = await listChats(character, context.characterId, controller.signal);
   if (!dialog.isConnected) return;
   const existing = new Set(chats.map(chat => chat.file_name)), additions = listed.filter(chat => !existing.has(chat.file_name));
   for (let start = 0; start < additions.length; start += 40) {
    while (busy && dialog.isConnected) await new Promise(resolve => setTimeout(resolve, 30));
    if (!dialog.isConnected) return;
    const offset = chats.length, batch = additions.slice(start, start + 40);chats.push(...batch);
    $('.st-nook-chat-list').insertAdjacentHTML('beforeend', batch.map((chat, index) => chatMarkup(chat, offset + index, current)).join(''));
    await yieldUI();
   }
   $('#st-nook-all-chats').disabled = !chats.length;
   status.textContent = chats.length ? '' : '此角色还没有聊天记录。';
  } catch (error) {
   if (!controller.signal.aborted) status.innerHTML = '聊天目录读取失败。<button type="button" class="menu_button" data-nook-list-retry>重试</button>';
  }
 }
 dialog.addEventListener('click', event => { if (event.target.closest('[data-nook-list-retry]')) populateChats(); });
 populateChats();
 async function prepare() {
  const source = getContext().chat, lastText = source.at(-1)?.mes ?? source.at(-1)?.content;
  if (prepared && prepared.source === source && prepared.length === source.length && prepared.lastText === lastText) return prepared;
  if (prepared) clearPrepared();
  const title = $('#st-nook-title').value.trim(), selected = $$('[data-nook-chat]:checked').map(input => chats[Number(input.dataset.nookChat)]);
  if (!title) { $('#st-nook-title').focus(); throw Error('请输入书名。'); }
  if (!selected.length) throw Error('请至少选择一份聊天。');
  report('正在导出…'); await yieldUI();
  let builder;
  try {
   const chosen = [];
   for (const input of $$('[data-nook-rule]:checked')) {
    const [group, index] = input.dataset.nookRule.split(':'), rule = structuredClone(rules.find(item => item.id === group).rules[Number(index)]);
    const marker = 'ST_NOOK_CAPTURE_MATCH_7E3C';
    rule.replaceString = substituteParams(String(rule.replaceString || '').replace(/{{match}}/gi, marker)).replaceAll(marker, '{{match}}');
    rule.trimStrings = (rule.trimStrings || []).map(text => substituteParams(text, { name2Override: character.name }));
    if (Number(rule.substituteRegex) === 1) rule.findRegex = substituteParamsExtended(rule.findRegex);
    if (Number(rule.substituteRegex) === 2) rule.findRegex = substituteParamsExtended(rule.findRegex, {}, value => String(value).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
    rule.substituteRegex = 0; chosen.push(rule);
   }
   const [cover, firstRows] = await Promise.all([$('#st-nook-avatar').checked ? avatarData(character.avatar, controller.signal) : '', loadRows(selected[0])]);
   const { createTransferBuilder } = await import('./transfer-builder.js?v=2.0.9');
   builder = await createTransferBuilder({ title, name: character.name, cover, rules: chosen }, controller.signal);
   let rows = firstRows;
   for (const [index, chat] of selected.entries()) {
    if (!dialog.isConnected) throw controller.signal.reason;
    const next = index + 1 < selected.length ? loadRows(selected[index + 1]) : null;next?.catch(() => {});
    report(`导出 ${index + 1} / ${selected.length}：${chat.file_name}`);
    if (!Array.isArray(rows) || !rows.some(row => typeof row?.mes === 'string' || typeof row?.content === 'string')) throw Error(`${chat.file_name} 没有可导入的正文`);
    await builder.file(chat.file_name, rows);
    rows = await next;
   }
   const blob = await builder.finish();
   prepared = { blob, builder, title, packet: '', source, length: source.length, lastText };
   return prepared;
  } catch (error) { builder?.close(); throw error; }
 }
 async function runExport(mode) {
  if (busy) return;
  if (!$('#st-nook-title').value.trim()) { $('#st-nook-title').focus();report('请输入书名。');return; }
  if (!$('[data-nook-chat]:checked')) { report('请至少选择一份聊天。');return; }
  const source = getContext().chat, cached = prepared && prepared.source === source && prepared.length === source.length && prepared.lastText === (source.at(-1)?.mes ?? source.at(-1)?.content) ? prepared.packet : '';
  let deliver, rejectDelivery;
  const delivery = new Promise((resolve, reject) => { deliver = resolve;rejectDelivery = reject; });delivery.catch(() => {});
  const initialCopy = mode === 'download' ? null : cached ? copyText(cached) : reserveClipboardWrite(delivery);
  busy = true;
  const buttons = $$('.st-nook-export-actions button');buttons.forEach(button => button.disabled = true);
  const inputs = $$('fieldset,#st-nook-title,#st-nook-avatar'), disabled = inputs.map(input => input.disabled);inputs.forEach(input => input.disabled = true);
  let online;
  if (mode === 'online') {
   online = window.open('', '_blank');
   if (online) { online.opener = null;online.document.title = '酒馆书屋';online.document.body.textContent = '正在准备书籍…'; }
  }
  try {
   const data = await prepare();
   if (mode === 'download') {
    const url = URL.createObjectURL(data.blob), anchor = document.createElement('a');
    anchor.href = url;anchor.download = (data.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '书籍') + '-书籍备份.json';anchor.click();setTimeout(() => URL.revokeObjectURL(url), 10000);
    report('备份已下载，在阅读器“新建书籍”→“接收书籍”中选择导入文件。');return;
   }
   if (!data.packet) { report('正在压缩复制资料…');data.packet = await data.builder.encode(); }
   if (!dialog.isConnected) return;
   deliver(data.packet);
   if (clipboardTooLarge(data.packet)) {
    online?.close();online = null;
    report('资料较大，超过手机剪贴板的可靠容量。请点击“下载备份”，在阅读器中选择导入文件，内容不会截断。');return;
   }
   const copied = initialCopy ? await clipboardResult(initialCopy) : await copyText(data.packet);
   if (!copied) {
    online?.close();online = null;
    $('#st-nook-manual-copy').hidden = false;$('#st-nook-copy-text').value = data.packet;
    $('#st-nook-copy').textContent = '再次点击复制';
    $('#st-nook-manual-copy').scrollIntoView({ block: 'nearest' });
    report('资料已准备，但未完成复制。请再次点击“复制”，或长按资料框全选后复制；也可下载备份。');return;
   }
   $('#st-nook-manual-copy').hidden = true;$('#st-nook-copy-text').value = '';$('#st-nook-copy').textContent = '复制资料';
   report('资料已复制，回阅读器点击“新建书籍”→“接收书籍”，也可按 Ctrl+V。');
   if (mode === 'online') {
    if (online) { online.location.replace(RECEIVE_URL);online = null; }
    else { const link = document.createElement('a');link.href = RECEIVE_URL;link.target = '_blank';link.rel = 'noopener noreferrer';link.textContent = ' 打开在线阅读器';$('#st-nook-status').append(link); }
   }
  } catch (error) { rejectDelivery(error);online?.close();if (!controller.signal.aborted) report(error.message); }
  finally {
   rejectDelivery(new DOMException('操作结束', 'AbortError'));
   busy = false;
   if (dialog.isConnected) { buttons.forEach(button => button.disabled = false);inputs.forEach((input, index) => input.disabled = disabled[index]); }
  }
 }
 $('#st-nook-copy').onclick = () => runExport('copy');
 $('#st-nook-open-reader').onclick = () => runExport('online');
 $('#st-nook-download').onclick = () => runExport('download');
}

async function avatarData(avatar, signal) {
 let response = await fetch(`/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`, { signal });
 if (!response.ok) response = await fetch(`/characters/${encodeURIComponent(avatar)}`, { signal });
 if (!response.ok) throw Error('无法读取角色头像，请取消头像选项后重试');
 const image = await createImageBitmap(await response.blob()), scale = Math.min(1, 600 / Math.max(image.width, image.height));
 const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
 canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close(); return canvas.toDataURL('image/jpeg', .86);
}

addButton();
new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
