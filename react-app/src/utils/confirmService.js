// Module-level confirm callback — mirrors vanilla's `confirmCallback` global
let _cb = null;
export function setConfirmCallback(fn) { _cb = fn; }
export function fireConfirmCallback()  { if (_cb) { _cb(); _cb = null; } }
export function clearConfirmCallback() { _cb = null; }
