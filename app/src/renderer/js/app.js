import { h, icon, clear } from './util.js';
import { renderLibrary } from './views/library.js';
import { renderPlayer } from './views/player.js';
import { renderDictation } from './views/dictation.js';
import { renderListening } from './views/listening.js';

const root = document.getElementById('app');
let cleanup = null;
const cache = new Map(); // id → title 데이터

export const state = { settings: null };

export async function loadTitle(id, { fresh = false } = {}) {
  if (fresh || !cache.has(id)) cache.set(id, await window.ml.getTitle(id));
  return cache.get(id);
}
export function invalidate(id) {
  if (id) cache.delete(id);
  else cache.clear();
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// 타이틀 화면(영상 학습/받아쓰기/반복 듣기) 공통 헤더
export function titleHeader(t, active) {
  const m = t.manifest;
  const id = encodeURIComponent(m.id);
  const mode = (key, label, href) => h('a', { href, class: active === key ? 'on' : null }, label);
  const hasDict = t.exercises.dictation.some((l) => l.items.length);
  const hasListen = t.exercises.listening.some((l) => l.items.length);
  return h(
    'header',
    { class: 'topbar compact' },
    h(
      'div',
      { class: 'side left title-crumb' },
      h('a', { href: '#/library', class: 'icon-btn', 'aria-label': '라이브러리로 돌아가기' }, icon('back', 20)),
      h('span', { class: 't' }, m.title),
      m.originalTitle !== m.title ? h('span', { class: 'o' }, m.originalTitle) : null
    ),
    h(
      'nav',
      { class: 'modes' },
      mode('play', '영상 학습', `#/play/${id}`),
      hasDict ? mode('dictation', '받아쓰기', `#/dictation/${id}`) : null,
      hasListen ? mode('listening', '반복 듣기', `#/listening/${id}`) : null
    ),
    h('div', { class: 'side' })
  );
}

async function route() {
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  clear(root);
  const [path, query] = (location.hash.slice(1) || '/library').split('?');
  const params = new URLSearchParams(query || '');
  const [, view, rawId] = path.split('/');
  const id = rawId ? decodeURIComponent(rawId) : null;
  try {
    if (view === 'play' && id) cleanup = await renderPlayer(root, id, params);
    else if (view === 'dictation' && id) cleanup = await renderDictation(root, id, params);
    else if (view === 'listening' && id) cleanup = await renderListening(root, id, params);
    else cleanup = await renderLibrary(root);
  } catch (e) {
    console.error(e);
    clear(root).append(
      h('div', { class: 'empty' }, '화면을 여는 중 문제가 생겼습니다.', h('br'), h('span', { class: 'dim' }, e.message), h('br'), h('br'),
        h('a', { href: '#/library', class: 'btn' }, '라이브러리로'))
    );
  }
}

(async () => {
  state.settings = await window.ml.getSettings();
  window.addEventListener('hashchange', route);
  route();
})();
