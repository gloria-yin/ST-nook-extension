import { encodeTransfer } from './transfer-packet.js?v=2.0.7';
import { mountChatPreviews, previewMarkup } from './chat-preview.js?v=2.0.7';
import { getContext } from '/scripts/extensions.js';
import { getPastCharacterChats, getRequestHeaders, substituteParams, substituteParamsExtended } from '/script.js';
import { getScriptsByType, SCRIPT_TYPES } from '/scripts/extensions/regex/engine.js';

const READER_URL = 'https://st-nook.pages.dev/';
const RECEIVE_URL = READER_URL + '#st-nook-receive=clipboard';
const VERSION = '2.0.7';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let activeDialog = null;

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
 const chats = await getPastCharacterChats(context.characterId);
 const current = character.chat || context.chatId || '';
 if (current && !chats.some(chat => chat.file_name.replace(/\.jsonl$/, '') === current)) chats.unshift({ file_name: current + '.jsonl', chat_items: context.chat.length });
 const groups = [['global', '全局正则', SCRIPT_TYPES.GLOBAL], ['preset', '预设正则', SCRIPT_TYPES.PRESET], ['local', '局部正则', SCRIPT_TYPES.SCOPED]];
 const rules = groups.map(([id, name, type]) => ({ id, name, rules: getScriptsByType(type, { allowedOnly: true }).filter(rule => !rule.disabled) }));
 const dialog = document.createElement('dialog'); dialog.className = 'st-nook-dialog'; activeDialog = dialog;
 dialog.innerHTML = `<form method="dialog">
 <header><div><h2>添加书籍 <small class="st-nook-version">v${VERSION}</small></h2><p>${escape(character.name)} · 酒馆书屋</p></div><button class="st-nook-close" value="cancel" formnovalidate aria-label="关闭">×</button></header>
 <div class="st-nook-body">
 <label class="st-nook-field">书籍名称<input id="st-nook-title" class="text_pole" maxlength="80" value="${escape(character.name)}" required></label>
 <p class="st-nook-hint">准备资料后可复制内容或下载备份，在原 HTML 或在线阅读器中接收。</p>
 <fieldset><legend>聊天内容</legend><label class="st-nook-check"><input type="checkbox" id="st-nook-all-chats">选择全部聊天</label><div class="st-nook-chat-list">${chats.map((chat, index) => `<div class="st-nook-chat-item"><label class="st-nook-chat"><input type="checkbox" data-nook-chat="${index}" ${chat.file_name.replace(/\.jsonl$/, '') === current ? 'checked' : ''}><span>${escape(chat.file_name.replace(/\.jsonl$/, ''))}${chat.file_name.replace(/\.jsonl$/, '') === current ? '<small>当前聊天</small>' : ''}<small>${chat.chat_items ?? '—'} 层${chat.last_mes ? ` · ${escape(chat.last_mes)}` : ''}</small></span></label><details class="st-nook-chat-preview" data-nook-preview="${index}"><summary>查看楼层</summary>${previewMarkup()}</details></div>`).join('') || '<p>此角色还没有聊天记录。</p>'}</div></fieldset>
 <fieldset><legend>导入已开启的正则</legend>${rules.map(group => `<details class="st-nook-rule-group"><summary><label class="st-nook-check"><input type="checkbox" data-nook-group="${group.id}" ${group.rules.length ? 'checked' : 'disabled'}>${group.name}<small>${group.rules.length} 条</small></label></summary><div>${group.rules.map((rule, index) => `<label class="st-nook-check"><input type="checkbox" data-nook-rule="${group.id}:${index}" checked><span>${escape(rule.scriptName || '未命名规则')}${rule.promptOnly ? ' · 仅提示词' : ''}</span></label>`).join('') || '<p class="st-nook-hint">没有已开启的规则</p>'}</div></details>`).join('')}</fieldset>
 <label class="st-nook-check"><input type="checkbox" id="st-nook-avatar" checked>使用当前角色头像作为封面</label>
 </div>
 <section class="st-nook-transfer-options" hidden><h3>书籍资料</h3><p id="st-nook-transfer-help" class="st-nook-hint"></p>
 <div class="st-nook-transfer-actions"><button type="button" class="menu_button st-nook-submit" id="st-nook-copy">复制书籍资料</button><button type="button" class="menu_button" id="st-nook-download">下载备份文件（JSON）</button><button type="button" id="st-nook-open-reader" class="menu_button">复制并打开在线阅读器</button><button type="button" class="menu_button" id="st-nook-open-back">返回设置</button><button class="menu_button" value="done" formnovalidate>完成</button></div>
 <label class="st-nook-field" id="st-nook-manual-copy" hidden>可复制内容<textarea id="st-nook-copy-text" class="text_pole" rows="5" readonly spellcheck="false"></textarea></label></section>
 <p id="st-nook-status" role="status"></p><footer><button class="menu_button" value="cancel" formnovalidate>取消</button><button type="button" class="menu_button st-nook-submit" id="st-nook-confirm">准备书籍资料</button></footer></form>`;
 document.body.append(dialog); dialog.showModal();
 const $ = selector => dialog.querySelector(selector), $$ = selector => [...dialog.querySelectorAll(selector)];
 const report = text => { if (dialog.isConnected) $('#st-nook-status').textContent = text; };
 let packet = '', backup = null, preparedTitle = '';
 const requests = new Map(), controller = new AbortController();
 const isCurrent = chat => {
  const active = getContext();
  return active.characterId === context.characterId && (active.chatId || active.characters?.[active.characterId]?.chat || '') === chat.file_name.replace(/\.jsonl$/, '');
 };
 async function loadRows(chat, { refresh = false, snapshot = false } = {}) {
  if (isCurrent(chat)) {
   const active = getContext();
   return [{ character_name: character.name }, ...(snapshot ? structuredClone(active.chat) : active.chat)];
  }
  const key = chat.file_name;
  if (refresh) requests.delete(key);
  if (!requests.has(key)) {
   const pending = (async () => {
    const response = await fetch('/api/chats/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ ch_name: character.name, avatar_url: character.avatar, file_name: key.replace(/\.jsonl$/, '') }), signal: controller.signal });
    if (!response.ok) throw Error(`读取 ${key} 失败：${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw Error(`${key} 的聊天格式不正确`);
    return rows;
   })();
   requests.set(key, pending);pending.catch(() => { if (requests.get(key) === pending) requests.delete(key); });
  }
  return requests.get(key);
 }
 const disposePreviews = mountChatPreviews(dialog, { chats, loadRows, copyText, readLive: (chat, index) => {
  if (!isCurrent(chat)) return null;
  const message = document.querySelector(`#chat .mes[mesid="${index}"]`);
  if (!message) return null;
  const candidates = [...message.querySelectorAll('.TH-streaming,.mes_text')];
  return candidates.find(node => node.checkVisibility ? node.checkVisibility() : getComputedStyle(node).display !== 'none') || candidates[0] || null;
 } });
 dialog.addEventListener('close', () => { controller.abort();disposePreviews();requests.clear();activeDialog = null;packet = '';backup = null;dialog.remove(); });
 $('#st-nook-all-chats').onchange = event => $$('[data-nook-chat]').forEach(input => input.checked = event.target.checked);
 $$('[data-nook-chat]').forEach(input => input.onchange = () => { $('#st-nook-all-chats').checked = $$('[data-nook-chat]').every(element => element.checked); });
 $$('[data-nook-group]').forEach(input => input.onchange = () => $$(`[data-nook-rule^="${input.dataset.nookGroup}:"]`).forEach(element => element.checked = input.checked));
 $$('[data-nook-rule]').forEach(input => input.onchange = () => {
  const group = input.dataset.nookRule.split(':')[0], all = $$(`[data-nook-rule^="${group}:"]`), parent = $(`[data-nook-group="${group}"]`);
  parent.checked = all.every(element => element.checked); parent.indeterminate = all.some(element => element.checked) && !parent.checked;
 });
 $('#st-nook-open-back').onclick = () => { $('.st-nook-body').hidden = false; $('footer').hidden = false; $('.st-nook-transfer-options').hidden = true; packet = ''; backup = null; $('#st-nook-copy-text').value = ''; $('#st-nook-manual-copy').hidden = true; report(''); };
 $('#st-nook-confirm').onclick = async () => {
  const title = $('#st-nook-title').value.trim(), selected = $$('[data-nook-chat]:checked').map(input => chats[Number(input.dataset.nookChat)]);
  if (!title) { $('#st-nook-title').focus(); return; }
  if (!selected.length) { report('请至少选择一份聊天。'); return; }
  $('#st-nook-confirm').disabled = true;
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
   const cover = $('#st-nook-avatar').checked ? await avatarData(character.avatar) : '', files = [];
   for (const [index, chat] of selected.entries()) {
    if (!dialog.isConnected) return;
    report(`整理聊天 ${index + 1} / ${selected.length}：${chat.file_name}`);
    const rows = await loadRows(chat, { snapshot: true });
    if (!Array.isArray(rows) || !rows.some(row => typeof row?.mes === 'string' || typeof row?.content === 'string')) throw Error(`${chat.file_name} 没有可导入的正文`);
    files.push({ name: chat.file_name, rows });
   }
   report('正在准备书籍资料…');
   const data = { format: 'st-nook-transfer', version: 1, book: { title, name: character.name, cover, rules: chosen }, files };
   const encoded = await encodeTransfer(data);
   if (!dialog.isConnected) return;
   packet = encoded; backup = data; preparedTitle = title;
   $('.st-nook-body').hidden = true; $('footer').hidden = true; $('.st-nook-transfer-options').hidden = false;
   $('#st-nook-transfer-help').textContent = '复制后回阅读器，点击“新建书籍”→“接收书籍”，也可直接按 Ctrl+V。下载的 JSON 可通过“接收书籍”→“选择导入文件”导入。';
   $('#st-nook-copy').textContent = '复制书籍资料';
   report(`已准备 ${files.length} 份聊天、${chosen.length} 条正则。`);
  } catch (error) { console.error('[ST Nook]', error); report(error.message); }
  finally { if (dialog.isConnected) $('#st-nook-confirm').disabled = false; }
 };
 async function copyPrepared(openOnline = false) {
  if (!packet) return;
  $('#st-nook-copy').disabled = true;
  try {
   $('#st-nook-manual-copy').hidden = false; $('#st-nook-copy-text').value = packet;
   const copied = await copyText(packet);
   if (!dialog.isConnected) return;
   if (!copied) {
    $('#st-nook-manual-copy').hidden = false; $('#st-nook-copy-text').value = packet; $('#st-nook-copy-text').select();
    report('请按 Ctrl+C 或长按复制，再回阅读器点击“新建书籍”→“接收书籍”并粘贴；也可以下载备份文件导入。'); return;
   }
   report('资料已复制，请回阅读器点击“新建书籍”→“接收书籍”。若浏览器禁止读取剪贴板，可直接按 Ctrl+V。');
   toastr.success('书籍资料已复制。', '酒馆书屋');
   if (openOnline) window.open(RECEIVE_URL, '_blank', 'noopener,noreferrer');
   $('#st-nook-copy').textContent = '再次复制内容';
  } catch (error) { report(error.message); }
  finally { if (dialog.isConnected) $('#st-nook-copy').disabled = false; }
 }
 $('#st-nook-copy').onclick = () => copyPrepared();
 $('#st-nook-open-reader').onclick = () => copyPrepared(true);
 $('#st-nook-download').onclick = () => {
  if (!backup) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json;charset=utf-8' })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = (preparedTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '书籍') + '-书籍备份.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  report('备份文件已下载。请自行打开原 HTML，点击“新建书籍”→“接收书籍”→“选择导入文件”，导入此 JSON 备份。');
 };
}

async function copyText(text) {
 try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
 const input = document.createElement('textarea'); input.readOnly = true; input.inputMode = 'none'; input.value = text; input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
 document.querySelector('.st-nook-dialog').append(input); input.focus(); input.select();
 let copied = false; try { copied = document.execCommand('copy'); } catch {} input.remove(); return copied;
}

async function avatarData(avatar) {
 const response = await fetch(`/characters/${encodeURIComponent(avatar)}`);
 if (!response.ok) throw Error('无法读取角色头像，请取消头像选项后重试');
 const image = await createImageBitmap(await response.blob()), scale = Math.min(1, 600 / Math.max(image.width, image.height));
 const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
 canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close(); return canvas.toDataURL('image/jpeg', .86);
}

addButton();
new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
