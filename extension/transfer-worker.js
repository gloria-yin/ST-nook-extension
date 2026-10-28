import { transferOperation } from './transfer-document.js?v=2.0.11';

const state = {};
self.onmessage = async ({ data }) => {
 try { self.postMessage({ id: data.id, value: await transferOperation(state, data) }); }
 catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
