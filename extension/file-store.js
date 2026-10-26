let database;
function open(){return database||=(new Promise((resolve,reject)=>{const request=indexedDB.open('st-nook-extension',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));}
export async function savedReader(){try{const db=await open();return await new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').get('reader');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}catch{return null;}}
export async function rememberReader(value){try{const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(value,'reader');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{}}
export async function readerFile(selection){
 if(!selection)throw Error('请先选择酒馆书屋 HTML 文件。');
 if(selection.handle){let permission=await selection.handle.queryPermission({mode:'read'});if(permission!=='granted')permission=await selection.handle.requestPermission({mode:'read'});if(permission!=='granted')throw Error('请重新选择 HTML 文件以允许读取。');return selection.handle.getFile();}
 return selection.file;
}
