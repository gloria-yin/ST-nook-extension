import { converter, substituteParams, systemUserName } from '/script.js';
import { power_user, fixMarkdown } from '/scripts/power-user.js';
import { getRegexedString, regex_placement } from '/scripts/extensions/regex/engine.js';
import { encodeStyleTags, decodeStyleTags } from '/scripts/chats.js';
import { COMMENT_NAME_DEFAULT } from '/scripts/slash-commands.js';
import { DOMPurify } from '/lib.js';

export function renderDisplayText(row, { index, depth, visibleText }) {
 let text = String(row.extra?.display_text || (typeof row.mes === 'string' ? row.mes : row.content || '')), isSystem = !!row.is_system;
 if (row.name === COMMENT_NAME_DEFAULT && isSystem && !row.is_user) isSystem = false;
 if (isSystem && row.name !== systemUserName) isSystem = false;
 if (index === 0 && !isSystem && !row.is_user) text = substituteParams(text, undefined, row.name);
 const bias = power_user.user_prompt_bias && substituteParams(power_user.user_prompt_bias);
 if (!power_user.show_user_prompt_bias && row.name && !row.is_user && !isSystem && bias && text.startsWith(bias)) text = text.slice(bias.length);
 // The native formatter reads the active chat for depth; historical previews use their own depth without changing that chat.
 if (!isSystem) text = getRegexedString(text, row.is_user ? regex_placement.USER_INPUT : row.extra?.type === 'narrator' ? regex_placement.SLASH_COMMAND : regex_placement.AI_OUTPUT, { characterOverride: row.name, isMarkdown: true, depth });
 if (power_user.auto_fix_generated_markdown) text = fixMarkdown(text, true);
 if (!isSystem && power_user.encode_tags) text = text.replaceAll('<', '&lt;').replace(/(?<!^|\n\s*)>/g, '&gt;');
 for (const marker of [power_user.reasoning?.prefix, power_user.reasoning?.suffix]) {
  if (marker?.trim()) text = text.replace(marker, escape(marker));
 }
 if (!isSystem) {
  text = text.replaceAll('\\begin{align*}', '$$').replaceAll('\\end{align*}', '$$');
  text = converter.makeHtml(text);
  text = text.replace(/<code(.*)>[\s\S]*?<\/code>/g, match => match.replace(/&amp;/g, '&'));
 }
 if (!power_user.allow_name2_display && row.name && !row.is_user && !isSystem) text = text.replace(new RegExp(`(^|\n)${row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g'), '$1');
 const clean = html => decodeStyleTags(DOMPurify.sanitize(encodeStyleTags(html), { RETURN_DOM: false, RETURN_DOM_FRAGMENT: false, RETURN_TRUSTED_TYPE: false, MESSAGE_SANITIZE: true, ADD_TAGS: ['custom-style'], MESSAGE_ALLOW_SYSTEM_UI: !!row.extra?.uses_system_ui }));
 const host = document.createElement('div');
 host.style.cssText = 'position:fixed;left:-100000px;top:0;width:600px;pointer-events:none;';
 const shadow = host.attachShadow({ mode: 'closed' }), content = document.createElement('div');content.className = 'mes_text';
 content.innerHTML = clean(text);
 // HTML frontends can be inspected as text without starting their scripts or altering the open chat.
 for (const code of content.querySelectorAll('pre > code')) {
  if (!/(?:<html[\s>]|<head[\s>]|<body[\s>])/i.test(code.textContent)) continue;
  const parsed = new DOMParser().parseFromString(code.textContent, 'text/html'), fragment = document.createElement('div');
  fragment.className = 'mes_text'; fragment.innerHTML = clean(parsed.head.innerHTML + parsed.body.innerHTML);code.parentElement.replaceWith(fragment);
 }
 content.querySelectorAll('script,iframe,object,embed,img,audio,video,source,link').forEach(node => node.remove());
 shadow.append(content);document.body.append(host);
 try { return visibleText(content); } finally { host.remove(); }
}

function escape(value) { return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
