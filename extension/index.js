import { savedReader, rememberReader, readerFile } from './file-store.js';
import { getContext } from '/scripts/extensions.js';
import { getPastCharacterChats, getRequestHeaders, substituteParams, substituteParamsExtended } from '/script.js';
import { getScriptsByType, SCRIPT_TYPES } from '/scripts/extensions/regex/engine.js';

const REPOSITORY='https://github.com/gloria-yin/ST-nook';
const READER_URL='https://gloria-yin.github.io/ST-nook/';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedReader=null,activeDialog=null;

function addButton(){
 const anchor=document.getElementById('chat_import_button');
 if(!anchor||document.getElementById('st-nook-add-book'))return;
 const button=document.createElement('button');button.type='button';button.id='st-nook-add-book';button.className='menu_button menu_button_icon';
 button.innerHTML='<i class="fa-solid fa-book-open"></i><span>添加书籍</span>';
 button.onclick=()=>openImporter().catch(error=>{console.error('[ST Nook]',error);toastr.error(error.message,'酒馆书屋');});anchor.after(button);
}

async function openImporter(){
 if(activeDialog){activeDialog.focus();return;}
 const context=getContext(),character=context.characters?.[context.characterId];
 if(!character||context.groupId){toastr.info('请先打开一张角色卡的聊天。','酒馆书屋');return;}
 selectedReader ||= await savedReader();
 const chats=await getPastCharacterChats(context.characterId);
 const current=character.chat||context.chatId||'';
 if(current&&!chats.some(chat=>chat.file_name.replace(/\.jsonl$/,'')===current))chats.unshift({file_name:current+'.jsonl',chat_items:context.chat.length});
 const groups=[['global','全局正则',SCRIPT_TYPES.GLOBAL],['preset','预设正则',SCRIPT_TYPES.PRESET],['local','局部正则',SCRIPT_TYPES.SCOPED]];
 const rules=groups.map(([id,name,type])=>({id,name,rules:getScriptsByType(type,{allowedOnly:true}).filter(rule=>!rule.disabled)}));
 const dialog=document.createElement('dialog');dialog.className='st-nook-dialog';activeDialog=dialog;
 dialog.innerHTML=`<form method="dialog"><header><div><h2>添加书籍</h2><p>${escape(character.name)} · 酒馆书屋</p></div><button class="st-nook-close" value="cancel" aria-label="关闭">×</button></header><div class="st-nook-body"><label class="st-nook-field">书籍名称<input id="st-nook-title" class="text_pole" maxlength="80" value="${escape(character.name)}" required></label><label class="st-nook-field">阅读器<select id="st-nook-mode" class="text_pole"><option value="link">链接版</option><option value="file">文件版</option></select></label><div id="st-nook-repository"><p class="st-nook-hint">自动使用酒馆书屋在线版，无需填写链接。</p><a href="${READER_URL}" target="_blank" rel="noopener noreferrer">打开在线书架</a></div><div id="st-nook-file-wrap" hidden><div class="st-nook-file-picker"><input id="st-nook-file-name" class="text_pole" readonly aria-label="已连接的 HTML 文件" value="${escape(selectedReader?.name||'尚未选择文件')}"><button type="button" class="menu_button" id="st-nook-choose-file">选择 HTML 文件</button></div><input id="st-nook-file" type="file" accept=".html,.htm,text/html" hidden><p class="st-nook-hint">选择酒馆书屋 v2.0.2 或更新的 HTML 文件。浏览器会记住你的选择。</p></div><fieldset><legend>聊天内容</legend><label class="st-nook-check"><input type="checkbox" id="st-nook-all-chats">选择全部聊天</label><div class="st-nook-chat-list">${chats.map((chat,i)=>`<label class="st-nook-chat"><input type="checkbox" data-nook-chat="${i}" ${chat.file_name.replace(/\.jsonl$/,'')===current?'checked':''}><span>${escape(chat.file_name.replace(/\.jsonl$/,''))}${chat.file_name.replace(/\.jsonl$/,'')===current?'<small>当前聊天</small>':''}<small>${chat.chat_items??'—'} 层${chat.last_mes?` · ${escape(chat.last_mes)}`:''}</small></span></label>`).join('')||'<p>此角色还没有聊天记录。</p>'}</div></fieldset><fieldset><legend>导入已开启的正则</legend>${rules.map(group=>`<details class="st-nook-rule-group"><summary><label class="st-nook-check"><input type="checkbox" data-nook-group="${group.id}" ${group.rules.length?'checked':'disabled'}>${group.name}<small>${group.rules.length} 条</small></label></summary><div>${group.rules.map((rule,i)=>`<label class="st-nook-check"><input type="checkbox" data-nook-rule="${group.id}:${i}" checked><span>${escape(rule.scriptName||'未命名规则')}${rule.promptOnly?' · 仅提示词':''}</span></label>`).join('')||'<p class="st-nook-hint">没有已开启的规则</p>'}</div></details>`).join('')}</fieldset><label class="st-nook-check"><input type="checkbox" id="st-nook-avatar" checked>使用当前角色头像作为封面</label><p class="st-nook-hint">插件只负责连接和传送资料。书籍保存在当前酒馆站点的浏览器中，可在阅读器中导出备份。</p><p id="st-nook-status" role="status"></p></div><footer><button class="menu_button" value="cancel">取消</button><button type="button" class="menu_button st-nook-submit" id="st-nook-confirm">确认添加</button></footer><section class="st-nook-open-options" hidden><h3>打开方式</h3><p class="st-nook-hint">接收资料后进入“新建书籍”，可继续编辑正则、封面和文件顺序。</p><button type="button" class="menu_button" id="st-nook-open-tab"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>新标签页</span></button><button type="button" class="menu_button" id="st-nook-open-window"><i class="fa-regular fa-window-maximize"></i><span>独立窗口</span></button><button type="button" class="menu_button" id="st-nook-open-back">返回设置</button></section></form>`;
 document.body.append(dialog);dialog.showModal();
 const $=selector=>dialog.querySelector(selector),$$=selector=>[...dialog.querySelectorAll(selector)];
 dialog.addEventListener('close',()=>{activeDialog=null;dialog.remove();});
 $('#st-nook-mode').onchange=()=>{$('#st-nook-repository').hidden=$('#st-nook-mode').value!=='link';$('#st-nook-file-wrap').hidden=$('#st-nook-mode').value!=='file';};
 async function connectFile(value){selectedReader=value;$('#st-nook-file-name').value=value.name;await rememberReader(value);}
 $('#st-nook-file').onchange=()=>{const file=$('#st-nook-file').files[0];if(file)connectFile({name:file.name,file});};
 $('#st-nook-choose-file').onclick=async()=>{
  if(window.showOpenFilePicker&&window.isSecureContext){try{const [handle]=await window.showOpenFilePicker({types:[{description:'酒馆书屋 HTML',accept:{'text/html':['.html','.htm']}}],multiple:false});await connectFile({name:handle.name,handle});return;}catch(error){if(error.name==='AbortError')return;}}
  $('#st-nook-file').click();
 };
 $('#st-nook-all-chats').onchange=event=>$$('[data-nook-chat]').forEach(input=>input.checked=event.target.checked);
 $$('[data-nook-chat]').forEach(input=>input.onchange=()=>{$('#st-nook-all-chats').checked=$$('[data-nook-chat]').every(el=>el.checked);});
 $$('[data-nook-group]').forEach(input=>input.onchange=()=>$$(`[data-nook-rule^="${input.dataset.nookGroup}:"]`).forEach(el=>el.checked=input.checked));
 $$('[data-nook-rule]').forEach(input=>input.onchange=()=>{const group=input.dataset.nookRule.split(':')[0],all=$$(`[data-nook-rule^="${group}:"]`),parent=$(`[data-nook-group="${group}"]`);parent.checked=all.every(el=>el.checked);parent.indeterminate=all.some(el=>el.checked)&&!parent.checked;});
 function chooseOpening(){
  if(!$('#st-nook-title').value.trim()){ $('#st-nook-title').focus();return; }
  if(!$$('[data-nook-chat]:checked').length){$('#st-nook-status').textContent='请至少选择一份聊天。';return;}
  if($('#st-nook-mode').value==='file'&&!selectedReader){$('#st-nook-status').textContent='请选择酒馆书屋 HTML 文件。';return;}
  $('.st-nook-body').hidden=true;$('footer').hidden=true;$('.st-nook-open-options').hidden=false;
 }
 $('#st-nook-confirm').onclick=chooseOpening;
 $('#st-nook-open-back').onclick=()=>{$('.st-nook-body').hidden=false;$('footer').hidden=false;$('.st-nook-open-options').hidden=true;};
 $('#st-nook-open-tab').onclick=()=>transfer(false);
 $('#st-nook-open-window').onclick=()=>transfer(true);
 async function transfer(asWindow){
  const title=$('#st-nook-title').value.trim(),selected=$$('[data-nook-chat]:checked').map(input=>chats[Number(input.dataset.nookChat)]),mode=$('#st-nook-mode').value;
  if(!title){$('#st-nook-title').focus();return;}
  if(!selected.length){$('#st-nook-status').textContent='请至少选择一份聊天。';return;}
  if(mode==='file'&&!selectedReader){$('#st-nook-status').textContent='请选择新版阅读器 HTML 文件。';return;}
  const token=crypto.randomUUID(),win=window.open('about:blank','_blank',asWindow?'popup=yes,width=1180,height=860':undefined);
  if(!win){$('#st-nook-open-back').click();$('#st-nook-status').textContent='请允许酒馆打开新窗口后重试。';return;}
  win.document.title='酒馆书屋 / ST Nook';win.document.body.textContent='正在连接酒馆书屋…';
  $('.st-nook-body').hidden=false;$('footer').hidden=false;$('.st-nook-open-options').hidden=true;
  $('#st-nook-confirm').disabled=true;
  const report=text=>{if(dialog.isConnected)$('#st-nook-status').textContent=text;};
  let channel,cancelled=false,completed=false;
  dialog.addEventListener('close',()=>{if(completed)return;cancelled=true;channel?.close();try{win.close();}catch{}},{once:true});
  try{
   report(mode==='link'?'正在加载在线阅读器…':'正在读取已选择的 HTML 文件…');
   let source;
   if(mode==='link'){const response=await fetch(READER_URL,{cache:'no-cache'});if(!response.ok)throw Error(`在线阅读器加载失败：${response.status}`);source=await response.text();}
   else source=await(await readerFile(selectedReader)).text();
   if(cancelled)return;
   if(!source.includes('st-nook-ready'))throw Error('此文件不是兼容的酒馆书屋阅读器，请选择最新版 HTML。');
   const target=new URL(URL.createObjectURL(new Blob([source],{type:'text/html;charset=utf-8'})));
   target.hash=new URLSearchParams({'st-nook-import':token,from:location.origin}).toString();
   channel=createChannel(win,location.origin,token);win.location.href=target.href;
   report('正在连接阅读器…');await channel.ready;
   const chosen=[];
   for(const input of $$('[data-nook-rule]:checked')){
    const [group,index]=input.dataset.nookRule.split(':'),rule=structuredClone(rules.find(item=>item.id===group).rules[Number(index)]);
    const marker='ST_NOOK_CAPTURE_MATCH_7E3C';
    rule.replaceString=substituteParams(String(rule.replaceString||'').replace(/{{match}}/gi,marker)).replaceAll(marker,'{{match}}');
    rule.trimStrings=(rule.trimStrings||[]).map(text=>substituteParams(text,{name2Override:character.name}));
    if(Number(rule.substituteRegex)===1)rule.findRegex=substituteParamsExtended(rule.findRegex);
    if(Number(rule.substituteRegex)===2)rule.findRegex=substituteParamsExtended(rule.findRegex,{},value=>String(value).replace(/[.*+?^${}()|[\]\\/]/g,'\\$&'));
    rule.substituteRegex=0;chosen.push(rule);
   }
   const cover=$('#st-nook-avatar').checked?await avatarData(character.avatar):'';
   await channel.send('st-nook-begin',{book:{title,name:character.name,cover,rules:chosen}});
   for(const [i,chat] of selected.entries()){
    report(`导入聊天 ${i+1} / ${selected.length}：${chat.file_name}`);
    const isCurrent=chat.file_name.replace(/\.jsonl$/,'')===current;
    let rows;
    if(isCurrent){rows=[{character_name:character.name},...structuredClone(context.chat)];}
    else{
     const response=await fetch('/api/chats/get',{method:'POST',headers:getRequestHeaders(),body:JSON.stringify({ch_name:character.name,avatar_url:character.avatar,file_name:chat.file_name.replace(/\.jsonl$/,'')})});
     if(!response.ok)throw Error(`读取 ${chat.file_name} 失败：${response.status}`);rows=await response.json();
    }
    if(!Array.isArray(rows)||!rows.some(row=>typeof row.mes==='string'||typeof row.content==='string'))throw Error(`${chat.file_name} 没有可导入的正文`);
    await channel.send('st-nook-file',{name:chat.file_name,rows});
   }
   const result=await channel.send('st-nook-finish',{});if(result.stage!=='editor')throw Error('阅读器没有进入新建书籍界面，请更新 HTML 后重试。');channel.close();report('已进入新建书籍');completed=true;dialog.close();toastr.success('资料已传入阅读器，请检查后生成书籍。','酒馆书屋');
  }catch(error){channel?.close();if(cancelled)return;console.error('[ST Nook]',error);report(`导入失败：${error.message}`);if(dialog.isConnected)$('#st-nook-confirm').disabled=false;}
 };
}

async function avatarData(avatar){
 const response=await fetch(`/characters/${encodeURIComponent(avatar)}`);if(!response.ok)throw Error('无法读取角色头像，请取消头像选项后重试');
 const image=await createImageBitmap(await response.blob()),scale=Math.min(1,600/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();return canvas.toDataURL('image/jpeg',.86);
}

function createChannel(win,origin,token){
 let readyResolve,readyReject,readyDone=false;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const pending=new Map();
 const timer=setTimeout(()=>{if(!readyDone){readyReject(Error('阅读器未响应，请更新 HTML 或在线阅读器后重试。'));close();}},90000);
 function receive(event){
  const data=event.data;if(event.source!==win||event.origin!==origin||data?.token!==token)return;
  if(data.type==='st-nook-ready'){if(Number(data.version)<2){readyReject(Error('请使用酒馆书屋 v2.0.2 或更新的阅读器。'));close();return;}readyDone=true;clearTimeout(timer);clearInterval(ping);readyResolve();return;}
  if(!['st-nook-ack','st-nook-error'].includes(data.type))return;
  const item=pending.get(data.requestId);if(!item)return;clearTimeout(item.timer);pending.delete(data.requestId);
  if(data.type==='st-nook-error')item.reject(Error(data.error));else item.resolve(data);
 }
 const ping=setInterval(()=>{try{win.postMessage({type:'st-nook-ping',token},origin);}catch{}},700);
 function close(){if(!readyDone)readyReject(Error('阅读器连接已关闭'));clearTimeout(timer);clearInterval(ping);window.removeEventListener('message',receive);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('连接已关闭'));}pending.clear();}
 window.addEventListener('message',receive);
 return {ready,close,send(type,payload){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timeout=setTimeout(()=>{pending.delete(requestId);reject(Error('阅读器导入超时，请查看阅读器页面。'));close();},180000);pending.set(requestId,{resolve,reject,timer:timeout});win.postMessage({...payload,type,token,requestId},origin);});}};
}

addButton();
new MutationObserver(addButton).observe(document.body,{childList:true,subtree:true});
