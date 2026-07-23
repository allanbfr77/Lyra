/**
 * Escape de texto para interpolação em innerHTML sem XSS.
 */
export function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
