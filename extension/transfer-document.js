import { encodeTransferBlob } from './transfer-packet.js?v=2.0.11';
import { summarizeChat } from './chat-metadata.js?v=2.0.11';

const rowKeys = ['name', 'is_user', 'is_system', 'role', 'mes', 'content', 'send_date', 'timestamp', 'date', 'create_date', 'character_name', 'user_name'];
export function compactRow(source, preview = false) {
 const row = {};
 for (const key of rowKeys) if (source?.[key] !== undefined) row[key] = source[key];
 if (preview && source?.extra) {
  row.extra = { display_text: source.extra.display_text, type: source.extra.type, uses_system_ui: source.extra.uses_system_ui };
 }
 return row;
}

export function createTransferDocument(book) {
 const parts = ['{"format":"st-nook-transfer","version":1,"book":', JSON.stringify(book), ',"files":['];
 let fileCount = 0, rowCount = 0, open = false;
 return {
  file(name) {
   if (open) parts.push(']}');
   parts.push(fileCount++ ? ',' : '', '{"name":', JSON.stringify(name), ',"rows":[');
   rowCount = 0; open = true;
  },
  rows(rows) {
   if (!rows.length) return;
   parts.push(rowCount ? ',' : '', JSON.stringify(rows).slice(1, -1)); rowCount += rows.length;
  },
  finish() {
   if (!fileCount) throw Error('请至少选择一份聊天。');
   parts.push(']}]}');
   const blob = new Blob(parts, { type: 'application/json;charset=utf-8' });
   parts.length = 0;
   return blob;
  },
 };
}

export async function transferOperation(state, { type, value }) {
 if (type === 'read' || type === 'inspect') {
  const response = await fetch('/api/chats/get', { method: 'POST', headers: value.headers, body: JSON.stringify(value.body), signal: state.signal });
  if (!response.ok) throw Error(`读取 ${value.body.file_name} 失败：${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw Error('聊天格式不正确');
  return type === 'inspect' ? summarizeChat(rows, value.characterName) : rows.map(row => compactRow(row, true));
 }
 if (type === 'start') state.document = createTransferDocument(value);
 else if (type === 'file') state.document.file(value);
 else if (type === 'rows') state.document.rows(value);
 else if (type === 'finish') { state.blob = state.document.finish(); state.document = null; return state.blob; }
 else if (type === 'encode') return encodeTransferBlob(state.blob);
}
