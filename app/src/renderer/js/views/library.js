import { h, icon, fmtTime, toneFor } from '../util.js';
import { go, invalidate } from '../app.js';
import { openImportDialog } from './import.js';

export async function renderLibrary(root) {
  const { titles, libraryPath } = await window.ml.listLibrary();

  const header = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: 'assets/icon.svg', alt: '' }), '씬톡'),
    h(
      'div',
      { style: { display: 'flex', gap: '10px' } },
      h('button', { class: 'btn', onclick: () => window.ml.openLibrary(), title: libraryPath }, icon('folder', 16), '콘텐츠 폴더 열기'),
      h('button', { class: 'btn', onclick: changeLibrary }, '폴더 변경'),
      h('button', { class: 'btn primary', onclick: addContent }, icon('plus', 16), '콘텐츠 추가')
    )
  );

  const main = h('main', { class: 'library' });
  root.append(header, main);

  async function changeLibrary() {
    if (await window.ml.chooseLibrary()) {
      invalidate();
      go('#/library');
    }
  }
  function addContent() {
    openImportDialog(() => {
      invalidate();
      go('#/library');
    });
  }

  // 이어서 학습하기: 가장 최근에 본 타이틀
  const recent = titles
    .filter((t) => t.progress.updatedAt && t.progress.position > 0)
    .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt))[0];
  if (recent) main.append(await heroCard(recent));

  const grid = h('div', { class: 'grid' });
  for (const t of titles) grid.append(titleCard(t));
  grid.append(
    h(
      'button',
      { class: 'add-card', onclick: addContent },
      h('div', { class: 'plus' }, icon('plus', 22)),
      h('div', { class: 't' }, '콘텐츠 추가'),
      h('div', { style: { fontSize: '13px', lineHeight: '1.5' } }, '변환할 학습 자료 폴더나', h('br'), '콘텐츠 팩 폴더를 선택하세요')
    )
  );

  main.append(
    h(
      'section',
      null,
      h('div', { class: 'section-head' }, h('h2', null, '내 라이브러리', h('span', null, `${titles.length}편`)), h('div', { class: 'lib-path' }, libraryPath)),
      grid
    )
  );
  return null;
}

function posterStyle(t) {
  const m = t.manifest;
  const style = { background: toneFor(m.id) };
  if (m.poster) style.backgroundImage = `linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 55%), url("ml://media/${encodeURIComponent(m.id)}/${encodeURI(m.poster)}")`;
  return style;
}

function titleCard(t) {
  const m = t.manifest;
  const pct = m.duration ? Math.min(100, (t.progress.position / m.duration) * 100) : 0;
  return h(
    'button',
    { class: 'card', onclick: () => go(`#/play/${encodeURIComponent(m.id)}`) },
    h('div', { class: 'poster', style: posterStyle(t) }, h('div', { class: 'en' }, m.originalTitle || m.title)),
    h(
      'div',
      null,
      h('div', { class: 'ko' }, m.title),
      h('div', { class: 'meta' }, `${langName(m.language)} · ${fmtTime(m.duration)}`),
      h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } })),
      t.hasVideo ? null : h('div', { class: 'badge' }, '영상 없음 · 변환 필요')
    )
  );
}

async function heroCard(t) {
  const m = t.manifest;
  const id = encodeURIComponent(m.id);
  // 멈춘 지점의 대사
  let cue = null;
  try {
    const full = await window.ml.getTitle(m.id);
    cue = full.script.cues.filter((c) => c.start <= t.progress.position + 1).pop();
  } catch {
    /* 대사 없이 표시 */
  }
  const pct = m.duration ? Math.min(100, (t.progress.position / m.duration) * 100) : 0;
  return h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-poster', style: posterStyle(t) },
      h('div', { class: 'chip' }, `${fmtTime(t.progress.position)} 에서 멈춤`),
      h('div', { class: 'en' }, m.originalTitle || m.title),
      h('div', { class: 'ko' }, m.title)
    ),
    h(
      'div',
      { class: 'hero-body' },
      h(
        'div',
        null,
        h('div', { class: 'eyebrow' }, '이어서 학습하기'),
        cue ? h('div', { class: 'hero-quote' }, `“${cue.en}”`) : null,
        cue && cue.ko ? h('div', { class: 'hero-quote-ko' }, cue.ko) : null
      ),
      h(
        'div',
        { class: 'hero-actions' },
        h('a', { class: 'btn primary lg', href: `#/play/${id}` }, icon('play', 16), '이어보기'),
        h('a', { class: 'btn lg', href: `#/dictation/${id}` }, '받아쓰기'),
        h(
          'div',
          { class: 'hero-progress' },
          h('div', { class: 'row' }, h('span', null, '진도'), h('span', { class: 'tabular' }, `${fmtTime(t.progress.position)} / ${fmtTime(m.duration)}`)),
          h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } }))
        )
      )
    )
  );
}

function langName(code) {
  return { en: '영어', ja: '일본어', zh: '중국어', es: '스페인어', fr: '프랑스어', de: '독일어' }[code] || code || '';
}
