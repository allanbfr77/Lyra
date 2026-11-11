/**
 * Stub mínimo de navegador para testes em Node dos módulos de `painel/`.
 *
 * Os módulos importam uns aos outros diretamente; ao importar um deles o Node carrega o grafo inteiro, e
 * alguns criam menus/escutas no carregamento (`document.addEventListener`, `window.*`). Este arquivo só
 * instala o que falta (nunca sobrescreve) e nenhum teste depende do comportamento do DOM — só de que o
 * módulo possa ser importado. Importe-o ANTES do módulo testado.
 */
const permissivo = () =>
  new Proxy(function () {}, {
    get: (_t, p) => (p === 'then' ? undefined : p === Symbol.toPrimitive ? () => '' : permissivo()),
    apply: () => permissivo(),
    construct: () => permissivo(),
  });

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => permissivo(),
    createElementNS: () => permissivo(),
    body: permissivo(),
    documentElement: permissivo(),
    head: permissivo(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
for (const nome of ['addEventListener', 'removeEventListener']) {
  if (typeof globalThis[nome] !== 'function') globalThis[nome] = () => {};
}
if (typeof globalThis.matchMedia !== 'function') globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
if (typeof globalThis.cancelAnimationFrame !== 'function') globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = globalThis.localStorage;
if (typeof globalThis.location === 'undefined') globalThis.location = { href: 'http://localhost/', hostname: 'localhost', protocol: 'http:', search: '', origin: 'http://localhost' };
if (typeof globalThis.Element === 'undefined') globalThis.Element = class {};
if (typeof globalThis.HTMLElement === 'undefined') globalThis.HTMLElement = class {};
