// 작은 DOM 헬퍼. 콘텐츠 데이터는 항상 텍스트 노드로만 넣는다(innerHTML 사용 안 함).

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// 아이콘: path 데이터 목록 (stroke 아이콘)
const ICONS = {
  play: { fill: true, d: ['M7 5v14l11-7z'] },
  pause: { fill: true, rects: [[6, 5, 4, 14], [14, 5, 4, 14]] },
  prev: { d: ['M19 20L9 12l10-8z', 'M5 19V5'] },
  next: { d: ['M5 4l10 8-10 8z', 'M19 5v14'] },
  back: { d: ['M15 18l-6-6 6-6'] },
  plus: { d: ['M12 5v14M5 12h14'] },
  folder: { d: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'] },
  repeat: { d: ['M17 2l4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'] },
  bookmark: { d: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'] },
  bookmarkFill: { fill: true, d: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'] },
  fullscreen: { d: ['M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3'] },
  search: { d: ['M20 20l-3.5-3.5'], circles: [[11, 11, 7]] },
  speaker: { d: ['M11 5L6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'] },
  video: { d: ['M17 10l5-3v10l-5-3z'], rects: [[2, 5, 15, 14]] },
  close: { d: ['M6 6l12 12M18 6L6 18'] },
  check: { d: ['M5 12l5 5 9-10'] },
  alert: { d: ['M12 8v5M12 16.5v.5'], circles: [[12, 12, 9]] },
  trash: { d: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'] },
  eye: { d: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'], circles: [[12, 12, 3]] },
  file: { d: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6'] },
};

export function icon(name, size = 18) {
  const spec = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', spec.fill ? 'currentColor' : 'none');
  svg.setAttribute('stroke', spec.fill ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of spec.d || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  for (const [x, y, w, hh] of spec.rects || []) {
    const r = document.createElementNS(SVG_NS, 'rect');
    Object.entries({ x, y, width: w, height: hh, rx: spec.fill ? 1 : 2 }).forEach(([k, v]) => r.setAttribute(k, v));
    svg.append(r);
  }
  for (const [cx, cy, r] of spec.circles || []) {
    const c = document.createElementNS(SVG_NS, 'circle');
    Object.entries({ cx, cy, r }).forEach(([k, v]) => c.setAttribute(k, v));
    svg.append(c);
  }
  return svg;
}

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

// 제목으로 포스터 대체 색 (어두운 톤)
const TONES = ['#2B2417', '#1D2A1C', '#14243A', '#2A1D2E', '#2E1F1C', '#1C2A2A', '#262033', '#2B2A18'];
export function toneFor(id) {
  let n = 2166136261; // FNV-1a
  for (const ch of id) n = Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x45d9f3b) >>> 0;
  n ^= n >>> 16;
  return TONES[(n >>> 0) % TONES.length];
}

// 단어 비교용 정규화
export function normWord(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'-]/gu, '')
    .replace(/^'+|'+$/g, '');
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// 키 입력 대상이 입력창이면 단축키를 무시한다.
export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
