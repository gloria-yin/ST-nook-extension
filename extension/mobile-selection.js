export function mobileTextSelection(panel) {
 if (!matchMedia('(any-pointer: coarse)').matches && !navigator.maxTouchPoints) return null;
 const original = panel.querySelector('[data-preview-content]'), text = document.createElement('textarea');
 text.className = original.className + ' text_pole';
 text.dataset.previewContent = '';
 text.setAttribute('aria-label', '本层文本');
 text.setAttribute('aria-description', '长按选择文字，可拖动选择范围');
 text.setAttribute('autocomplete', 'off'); text.setAttribute('autocapitalize', 'off'); text.setAttribute('autocorrect', 'off');
 text.readOnly = true; text.spellcheck = false; text.inputMode = 'none'; text.rows = 7;
 original.replaceWith(text);
 const dialog = panel.closest('.st-nook-dialog'), button = panel.querySelector('[data-preview-copy]'), controller = new AbortController();
 const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, { ...options, signal: controller.signal });
 const selected = () => text.value.slice(text.selectionStart, text.selectionEnd);
 const update = () => { button.textContent = selected() ? '复制选中' : '复制本层'; };
 const unlock = () => { if (dialog.dataset.selectionOwner === panel.parentElement.dataset.nookPreview) { dialog.classList.remove('st-nook-text-selecting'); delete dialog.dataset.selectionOwner; } };
 listen(text, 'focus', () => { dialog.dataset.selectionOwner = panel.parentElement.dataset.nookPreview; dialog.classList.add('st-nook-text-selecting'); });
 listen(text, 'blur', unlock);
 for (const event of ['select', 'selectionchange', 'keyup', 'touchend']) listen(text, event, update, { passive: true });
 listen(document, 'selectionchange', () => { if (document.activeElement === text) update(); });
 // Keep native text selection and scrolling inside the control, away from Tavern's page gestures.
 for (const event of ['touchstart', 'touchmove', 'touchend', 'pointerdown']) listen(text, event, event => event.stopPropagation(), { passive: true });
 listen(dialog, 'touchstart', event => {
  if (document.activeElement === text && event.target !== text && !event.target.closest('[data-preview-copy]')) text.blur();
 }, { passive: true });
 function reset() { unlock(); if (document.activeElement === text) text.blur();text.setSelectionRange(0, 0);update(); }
 return {
  selected,
  reset,
  setText(value) {
   reset();text.textContent = value; text.value = value; text.setSelectionRange(0, 0);
   text.style.height = '0px';
   text.style.height = `${Math.max(82, Math.min(260, text.scrollHeight || 82))}px`;
   text.scrollTop = 0;update();
  },
  selectAll() { text.focus({ preventScroll: true });text.select();update(); },
  focusSelected() { text.focus({ preventScroll: true });update(); },
  dispose() { reset();controller.abort(); },
 };
}
