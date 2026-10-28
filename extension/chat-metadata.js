export const hasChatText = row => typeof row?.mes === 'string' || typeof row?.content === 'string';
export const isCharacterReply = (row, name) => !row.is_user && row.role !== 'user' && row.role !== 'system' && (!row.is_system || row.name === name);

export function summarizeChat(rows, name) {
 const messages = rows.filter(hasChatText), header = rows.find(row => !hasChatText(row));
 return { created: header?.create_date ?? header?.created_at ?? null, totalFloors: messages.length, characterFloors: messages.filter(row => isCharacterReply(row, name)).length };
}

export function formatChatDate(value) {
 if (value == null || value === '') return '';
 const text = String(value);
 const named = text.match(/(?:^|[^\d])(\d{4}-\d{1,2}-\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s/);
 const normalized = named ? `${named[1].split('-').map((part, index) => index ? part.padStart(2, '0') : part).join('-')}T${named[2].padStart(2, '0')}:${named[3].padStart(2, '0')}:${named[4].padStart(2, '0')}` : value;
 const date = new Date(typeof normalized === 'string' && /^\d+$/.test(normalized) ? Number(normalized) : normalized);
 if (!Number.isFinite(date.getTime())) return '';
 const pad = number => String(number).padStart(2, '0');
 return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function chatMetadataText(chat) {
 const created = formatChatDate(chat.created), named = chat.file_name.match(/\d{4}-\d{1,2}-\d{1,2}@\d{1,2}h\d{1,2}m\d{1,2}s/);
 const fallback = named ? formatChatDate(named[0]) : '';
 const dateText = created || (fallback ? `${fallback}（文件名）` : chat.metadataLoaded ? '未记录' : '读取中…');
 const total = chat.totalFloors ?? chat.chat_items;
 const floors = total == null ? '读取中…' : `${total} 层（含用户）${chat.characterFloors == null ? '' : ` · 角色 ${chat.characterFloors} 层`}`;
 return `创建：${dateText}　·　大小：${chat.file_size || '读取中…'}　·　楼层：${floors}`;
}
