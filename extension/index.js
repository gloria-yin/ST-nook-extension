import { mountChatPreviews } from './chat-preview.js?v=2.0.9';
import { clipboardResult, clipboardTooLarge, copyText, reserveClipboardWrite } from './clipboard.js?v=2.0.11';
import { chatMetadataText, isCharacterReply, summarizeChat } from './chat-metadata.js?v=2.0.11';
import { getContext } from '/scripts/extensions.js';
import { getPastCharacterChats, getRequestHeaders, substituteParams, substituteParamsExtended } from '/script.js';
import { getScriptsByType, SCRIPT_TYPES } from '/scripts/extensions/regex/engine.js';

const READER_URL = 'https://st-nook.pages.dev/';
const RECEIVE_URL = READER_URL + '#st-nook-receive=clipboard';
const VERSION = '2.0.11';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let activeDialog = null;
const chatLists = new Map();
const chatSummaries = new Map();
const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));

async function listChats(character, characterId, signal) {
 const cached = chatLists.get(character.avatar);
 if (cached && Date.now() - cached.time < 30000) return cached.chats;
 let chats;
 const response = await fetch('/api/characters/chats', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar_url: character.avatar }), signal });
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
 return `<div class="st-nook-chat-item" data-nook-file="${index}"><label class="st-nook-chat"><input type="checkbox" data-nook-chat="${index}" ${checked ? 'checked' : ''}><span>${escape(name)}${name === current ? '<small>当前聊天</small>' : ''}<small data-nook-chat-meta="${index}">${escape(chatMetadataText(chat))}</small></span></label><details class="st-nook-chat-preview" data-nook-preview="${index}"><summary>查看楼层</summary></details></div>`;
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
 const chats = current ? [{ file_name: current + '.jsonl', ...summarizeChat(context.chat, character.name) }] : [];
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
 const savedRequest = chat => ({ headers: getRequestHeaders(), body: { ch_name: character.name, avatar_url: character.avatar, file_name: chat.file_name.replace(/\.jsonl$/, '') }, characterName: character.name });
 function backgroundReader() {
  loader ||= import('./transfer-builder.js?v=2.0.11').then(({ createTransferBuilder }) => createTransferBuilder(null, controller.signal)).catch(error => { loader = null;throw error; });
  return loader;
 }
 function updateMetadata(chat, summary = {}) {
  Object.assign(chat, summary);
  if (isCurrent(chat)) {
   const live = summarizeChat(getContext().chat, character.name);
   chat.totalFloors = live.totalFloors;chat.characterFloors = live.characterFloors;
  }
  const label = $(`[data-nook-chat-meta="${chats.indexOf(chat)}"]`);
  if (label) label.textContent = chatMetadataText(chat);
 }
 async function loadRows(chat, { refresh = false } = {}) {
  if (refresh) clearPrepared();
  if (isCurrent(chat)) {
   const active = getContext();
   updateMetadata(chat);
   return [{ character_name: character.name }, ...active.chat];
  }
  const key = chat.file_name;
  if (refresh) requests.delete(key);
  if (!requests.has(key)) {
   const pending = (async () => {
    const background = await backgroundReader();
    return background.read(savedRequest(chat));
   })();
   requests.set(key, pending);pending.catch(() => { if (requests.get(key) === pending) requests.delete(key); });
  }
  const rows = await requests.get(key);
  updateMetadata(chat, { ...summarizeChat(rows, character.name), metadataLoaded: true });
  return rows;
 }
 const metadataQueue = [], queued = new Set();let scanning = false;
 async function scanMetadata() {
  if (scanning) return;
  scanning = true;
  try {
   while (metadataQueue.length && !controller.signal.aborted) {
    if (busy) { await new Promise(resolve => setTimeout(resolve, 30));continue; }
    const chat = chats[metadataQueue.shift()];
    const key = JSON.stringify([character.avatar, chat.file_name, chat.file_size, chat.chat_items, chat.last_mes]);
    try {
     const cached = chatSummaries.get(key);
     let summary = cached && Date.now() - cached.time < 30000 ? cached.summary : null;
     if (!summary) {
      const pending = requests.get(chat.file_name);
      summary = pending ? summarizeChat(await pending, character.name) : await (await backgroundReader()).inspect(savedRequest(chat));
      chatSummaries.set(key, { summary, time: Date.now() });
      if (chatSummaries.size > 200) chatSummaries.delete(chatSummaries.keys().next().value);
     }
     if (!controller.signal.aborted) updateMetadata(chat, { ...summary, metadataLoaded: true });
    } catch { if (!controller.signal.aborted) updateMetadata(chat, { metadataLoaded: true }); }
    await yieldUI();
   }
  } finally { scanning = false; }
 }
 function queueMetadata(index) {
  if (queued.has(index)) return;
  queued.add(index);metadataQueue.push(index);scanMetadata();
 }
 const metadataObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { metadataObserver.unobserve(entry.target);queueMetadata(Number(entry.target.dataset.nookFile)); }
 }, { root: $('.st-nook-chat-list'), rootMargin: '80px' });
 function observeMetadata() {
  for (const row of $$('[data-nook-file]')) {
   if (queued.has(Number(row.dataset.nookFile))) continue;
   if (metadataObserver) metadataObserver.observe(row);else queueMetadata(Number(row.dataset.nookFile));
  }
 }
 const disposePreviews = mountChatPreviews(dialog, { chats, loadRows, copyText, isCharacterMessage: row => isCharacterReply(row, character.name), readLive: (chat, index) => {
  if (!isCurrent(chat)) return null;
  const message = document.querySelector(`#chat .mes[mesid="${index}"]`);
  if (!message) return null;
  const candidates = [...message.querySelectorAll('.TH-streaming,.mes_text')];
  return candidates.find(node => node.checkVisibility ? node.checkVisibility() : getComputedStyle(node).display !== 'none') || candidates[0] || null;
 } });
 function clearPrepared() { prepared?.builder.close(); prepared = null;$('#st-nook-copy-text').value = '';$('#st-nook-manual-copy').hidden = true;$('#st-nook-copy').textContent = '复制资料'; }
 dialog.addEventListener('close', () => { controller.abort();metadataObserver?.disconnect();metadataQueue.length = 0;disposePreviews();requests.clear();clearPrepared();activeDialog = null;dialog.remove(); });
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
   const existing = new Map(chats.map(chat => [chat.file_name, chat]));
   for (const chat of listed) if (existing.has(chat.file_name)) updateMetadata(existing.get(chat.file_name), { ...chat, file_size: chat.file_size || '未提供' });
   for (const chat of chats) if (!listed.some(item => item.file_name === chat.file_name)) updateMetadata(chat, { file_size: '未保存' });
   const additions = listed.filter(chat => !existing.has(chat.file_name)).map(chat => ({ ...chat, file_size: chat.file_size || '未提供' }));
   for (let start = 0; start < additions.length; start += 40) {
    while (busy && dialog.isConnected) await new Promise(resolve => setTimeout(resolve, 30));
    if (!dialog.isConnected) return;
    const offset = chats.length, batch = additions.slice(start, start + 40);chats.push(...batch);
    $('.st-nook-chat-list').insertAdjacentHTML('beforeend', batch.map((chat, index) => chatMarkup(chat, offset + index, current)).join(''));
    observeMetadata();
    await yieldUI();
   }
   $('#st-nook-all-chats').disabled = !chats.length;
   status.textContent = chats.length ? '' : '此角色还没有聊天记录。';
  } catch (error) {
   if (!controller.signal.aborted) status.innerHTML = '聊天目录读取失败。<button type="button" class="menu_button" data-nook-list-retry>重试</button>';
  } finally { if (!controller.signal.aborted) observeMetadata(); }
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
   const { createTransferBuilder } = await import('./transfer-builder.js?v=2.0.11');
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
   if (clipboardTooLarge(data.packet) && !cached) {
    rejectDelivery(Error('等待再次点击复制大资料'));
    online?.close();online = null;
    $('#st-nook-manual-copy').hidden = false;$('#st-nook-copy-text').value = data.packet;
    $('#st-nook-copy').textContent = '仍然复制大资料';
    report(`无损压缩后约 ${(data.packet.length / 10000).toFixed(1)} 万字符，超过手机建议值。可点击“仍然复制大资料”尝试完整复制；若接收失败，请下载备份导入。`);return;
   }
   deliver(data.packet);
   const copied = initialCopy ? await clipboardResult(initialCopy) : await copyText(data.packet);
   if (!copied) {
    online?.close();online = null;
    $('#st-nook-manual-copy').hidden = false;$('#st-nook-copy-text').value = data.packet;
    $('#st-nook-copy').textContent = '再次点击复制';
    $('#st-nook-manual-copy').scrollIntoView({ block: 'nearest' });
    report('资料已准备，但未完成复制。请再次点击“复制”，或长按资料框全选后复制；也可下载备份。');return;
   }
   $('#st-nook-manual-copy').hidden = true;$('#st-nook-copy-text').value = '';$('#st-nook-copy').textContent = '复制资料';
   report(clipboardTooLarge(data.packet) ? '大资料已提交剪贴板，回阅读器点击“接收书籍”。若系统截断或无法粘贴，请下载备份导入。' : '资料已复制，回阅读器点击“新建书籍”→“接收书籍”，也可按 Ctrl+V。');
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
