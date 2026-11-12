import { h, icon, fmtTime, clear, isTyping } from '../util.js';
import { loadTitle, titleHeader, state } from '../app.js';

const SPEEDS = [0.6, 0.8, 1, 1.2, 1.5];
const SUB_MODES = [
  ['en', '영어'],
  ['ko', '우리말'],
  ['both', '동시자막'],
  ['off', '끄기'],
];

export async function renderPlayer(root, id, params) {
  const t = await loadTitle(id, { fresh: true });
  const m = t.manifest;
  const cues = t.script.cues;
  const S = state.settings;
  let bookmarks = [...(t.progress.bookmarks || [])];

  // ------------------------------------------------------------ 상태
  let activeIdx = -1; // 현재 자막(대사) 인덱스, 대사 사이 공백이면 -1
  let nearIdx = -1; // 현재 시점 이전의 가장 가까운 대사
  let repeat = null; // { cue, count }
  let ab = { a: null, b: null };
  let tab = 'script';
  let query = '';
  let userScrollAt = 0;
  let raf = 0;
  let lastSave = 0;
  let toastTimer = 0;

  // ------------------------------------------------------------ 영상
  const video = t.hasVideo
    ? h('video', { src: t.baseUrl + encodeURI(m.video), preload: 'auto' })
    : null;
  const subsEn = h('div', { class: 'en' });
  const subsKo = h('div', { class: 'ko' });
  const chip = h('div', { class: 'screen-chip', hidden: true });
  const toastEl = h('div', { class: 'toast' });
  const screen = h(
    'div',
    { class: 'screen', ondblclick: toggleFullscreen, onclick: (e) => e.target === video && togglePlay() },
    video ||
      h('div', { class: 'no-video' }, '영상 파일이 아직 없습니다.', h('br'), h('span', { class: 'dim' }, `${m.video} 변환이 끝나면 재생할 수 있습니다.`)),
    h('div', { class: 'subs' }, subsEn, subsKo),
    chip,
    toastEl
  );
  document.documentElement.style.setProperty('--sub-scale', S.subtitleScale || 1);

  // ------------------------------------------------------------ 타임라인
  const fill = h('div', { class: 'fill' });
  const knob = h('div', { class: 'knob' });
  const abEl = h('div', { class: 'ab', hidden: true });
  const marksEl = h('div');
  const hoverTime = h('div', { class: 'hover-time' });
  const timeline = h('div', { class: 'timeline', role: 'slider', 'aria-label': '재생 위치', tabindex: -1 }, h('div', { class: 'track' }), abEl, fill, marksEl, knob, hoverTime);
  const duration = () => (video && video.duration) || m.duration || 1;
  const ratioAt = (e) => {
    const r = timeline.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  timeline.addEventListener('pointerdown', (e) => {
    timeline.setPointerCapture(e.pointerId);
    seek(ratioAt(e) * duration());
  });
  timeline.addEventListener('pointermove', (e) => {
    const r = ratioAt(e);
    hoverTime.textContent = fmtTime(r * duration());
    hoverTime.style.left = `${r * 100}%`;
    if (timeline.hasPointerCapture(e.pointerId)) seek(r * duration());
  });

  // ------------------------------------------------------------ 컨트롤
  const playBtn = h('button', { class: 'round-btn', 'aria-label': '재생', onclick: togglePlay }, icon('play', 20));
  const timeEl = h('span', { class: 'muted tabular', style: { marginLeft: '10px' } });
  const repeatBtn = h('button', { class: 'btn sm', onclick: toggleRepeat, title: '문장 반복 (R)' }, icon('repeat', 15), '문장 반복');
  const abBtn = h('button', { class: 'btn sm', onclick: toggleAB, title: '구간 반복 (A)' }, 'A–B');
  const speedSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '재생 속도' });
  const subSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '자막' });
  const bmBtn = h('button', { class: 'icon-btn', 'aria-label': '북마크 (B)', title: '북마크 (B)', onclick: toggleBookmark }, icon('bookmark'));
  const volume = h('input', { type: 'range', class: 'volume', min: 0, max: 1, step: 0.05, value: S.volume ?? 1, 'aria-label': '볼륨' });
  volume.addEventListener('input', () => setVolume(Number(volume.value)));

  for (const s of SPEEDS) speedSeg.append(h('button', { dataset: { v: s }, onclick: () => setSpeed(s) }, `${s.toFixed(1)}×`));
  for (const [k, label] of SUB_MODES) subSeg.append(h('button', { dataset: { v: k }, onclick: () => setSubMode(k) }, label));

  const controls = h(
    'div',
    { class: 'controls' },
    h(
      'div',
      { class: 'group' },
      h('button', { class: 'icon-btn', 'aria-label': '이전 문장 (←)', title: '이전 문장 (←)', onclick: prevCue }, icon('prev', 20)),
      playBtn,
      h('button', { class: 'icon-btn', 'aria-label': '다음 문장 (→)', title: '다음 문장 (→)', onclick: nextCue }, icon('next', 20)),
      timeEl
    ),
    h(
      'div',
      { class: 'group' },
      repeatBtn,
      abBtn,
      h('div', { class: 'vsep' }),
      speedSeg,
      h('div', { class: 'vsep' }),
      subSeg,
      bmBtn,
      volume,
      h('button', { class: 'icon-btn', 'aria-label': '전체화면 (F)', title: '전체화면 (F)', onclick: toggleFullscreen }, icon('fullscreen'))
    )
  );

  // ------------------------------------------------------------ 오른쪽 패널
  const tabBtns = {};
  const bmCount = h('span', { class: 'count' });
  const mkTab = (key, label, extra) => (tabBtns[key] = h('button', { class: 'tab', onclick: () => setTab(key) }, label, extra));
  const search = h('input', { class: 'search', type: 'search', placeholder: '대본 검색 (영어·우리말)', 'aria-label': '대본 검색' });
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    renderList();
  });
  const list = h('div', { class: 'list' });
  list.addEventListener('wheel', () => (userScrollAt = Date.now()), { passive: true });
  const wordCard = h('div', { class: 'word-card', hidden: true });
  const panel = h(
    'aside',
    { class: 'side-panel' },
    h('div', { class: 'tabs' }, mkTab('script', '대본'), mkTab('words', '단어'), mkTab('bookmarks', '북마크', bmCount), (m.extras || []).length ? mkTab('extras', '자료') : null),
    search,
    list,
    wordCard
  );

  root.append(
    titleHeader(t, 'play'),
    h('div', { class: 'player' }, h('section', { class: 'stage' }, screen, h('div', null, timeline), controls), panel),
    h(
      'footer',
      { class: 'footer-hints' },
      h(
        'div',
        { class: 'kbd-hints' },
        hint('Space', '재생/정지'),
        hint('← →', '이전/다음 문장'),
        hint('Shift+← →', '5초 이동'),
        hint('R', '문장 반복'),
        hint('A', '구간 반복'),
        hint('S', '자막 전환'),
        hint('[ ]', '속도'),
        hint('B', '북마크'),
        hint('- =', '자막 크기'),
        hint('F', '전체화면')
      )
    )
  );

  // ------------------------------------------------------------ 목록 렌더링
  let rowById = new Map();
  function renderList() {
    clear(list);
    rowById = new Map();
    search.hidden = tab !== 'script' && tab !== 'words';
    search.placeholder = tab === 'words' ? '단어 검색' : '대본 검색 (영어·우리말)';
    if (tab === 'script') {
      const frag = document.createDocumentFragment();
      const bmSet = new Set(bookmarks.map((b) => b.cueId));
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (query && !c.en.toLowerCase().includes(query) && !(c.ko || '').toLowerCase().includes(query)) continue;
        const row = h(
          'button',
          { class: 'line', onclick: () => jumpTo(i) },
          h('div', { class: 't tabular' }, fmtTime(c.start)),
          h('div', { class: 'body' }, h('div', { class: 'en' }, c.en), c.ko ? h('div', { class: 'ko' }, c.ko) : null),
          bmSet.has(c.id) ? h('span', { class: 'bm' }, icon('bookmarkFill', 14)) : null
        );
        rowById.set(i, row);
        frag.append(row);
      }
      list.append(frag);
      if (!rowById.size) list.append(h('div', { class: 'list-empty' }, '검색 결과가 없습니다.'));
      highlightRow(true);
    } else if (tab === 'words') {
      const seen = new Set();
      for (let i = 0; i < cues.length; i++) {
        for (const w of cues[i].words || []) {
          const key = w.term.toLowerCase();
          if (!w.term || seen.has(key)) continue;
          if (query && !key.includes(query) && !w.meaning.includes(query)) continue;
          seen.add(key);
          list.append(
            h(
              'button',
              { class: 'word-row', onclick: () => jumpTo(i) },
              h('span', { class: 'term' }, w.term),
              h('span', { class: 'meaning' }, w.meaning),
              h('span', { class: 't tabular' }, fmtTime(cues[i].start))
            )
          );
        }
      }
      if (!seen.size) list.append(h('div', { class: 'list-empty' }, query ? '검색 결과가 없습니다.' : '이 콘텐츠에는 단어 풀이가 없습니다.'));
    } else if (tab === 'extras') {
      list.append(h('div', { class: 'list-empty', style: { padding: '12px 12px 4px', textAlign: 'left' } }, '기본 프로그램으로 열립니다.'));
      for (const x of m.extras) {
        list.append(h('button', { class: 'word-row', onclick: () => window.ml.openExtra(m.id, x.file) }, icon('file', 16), h('span', { class: 'meaning' }, x.label), h('span', { class: 't' }, x.file.split('/').pop())));
      }
    } else {
      const sorted = [...bookmarks].sort((a, b) => a.time - b.time);
      for (const b of sorted) {
        const idx = cues.findIndex((c) => c.id === b.cueId);
        list.append(
          h(
            'div',
            { class: 'line', style: { alignItems: 'flex-start' } },
            h('div', { class: 't tabular' }, fmtTime(b.time)),
            h(
              'button',
              { class: 'body', style: { border: 0, background: 'none', textAlign: 'left', padding: 0 }, onclick: () => (idx >= 0 ? jumpTo(idx) : seek(b.time)) },
              h('div', { class: 'en' }, b.en),
              b.ko ? h('div', { class: 'ko' }, b.ko) : null
            ),
            h('button', { class: 'icon-btn', 'aria-label': '북마크 삭제', onclick: () => removeBookmark(b.cueId) }, icon('trash', 16))
          )
        );
      }
      if (!sorted.length) list.append(h('div', { class: 'list-empty' }, '북마크한 문장이 없습니다.', h('br'), '재생 중에 B 키를 누르면 현재 문장을 저장합니다.'));
    }
  }

  function setTab(k) {
    tab = k;
    for (const [key, b] of Object.entries(tabBtns)) b.classList.toggle('on', key === k);
    renderList();
  }

  let highlighted = null;
  function highlightRow(force) {
    if (tab !== 'script') return;
    const idx = activeIdx >= 0 ? activeIdx : nearIdx;
    const row = rowById.get(idx);
    if (highlighted && highlighted !== row) highlighted.classList.remove('on');
    if (!row) return;
    row.classList.add('on');
    if ((highlighted !== row || force) && Date.now() - userScrollAt > 3000) row.scrollIntoView({ block: 'center', behavior: force ? 'auto' : 'smooth' });
    highlighted = row;
  }

  // ------------------------------------------------------------ 자막
  function renderSubs() {
    const c = activeIdx >= 0 ? cues[activeIdx] : null;
    const mode = S.subtitleMode;
    clear(subsEn);
    clear(subsKo);
    if (!c) return;
    if (mode === 'en' || mode === 'both') subsEn.append(...markWords(c.en, c.words));
    if ((mode === 'ko' || mode === 'both') && c.ko) subsKo.append(c.ko);
  }

  function renderWordCard() {
    const c = cues[activeIdx >= 0 ? activeIdx : nearIdx];
    clear(wordCard);
    const words = (c && c.words) || [];
    wordCard.hidden = !words.length;
    if (!words.length) return;
    wordCard.append(
      h('div', { class: 'label' }, '이 문장의 단어'),
      ...words.map((w) => h('div', { class: 'w' }, h('b', null, w.term), h('span', null, w.meaning)))
    );
  }

  // ------------------------------------------------------------ 재생 제어
  function seek(time) {
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration() - 0.1));
    tick(true);
  }
  function togglePlay() {
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }
  function jumpTo(i) {
    const c = cues[i];
    if (!c) return;
    if (repeat) repeat = { cue: c, count: 1 };
    seek(c.start);
    if (video && video.paused) video.play().catch(() => {});
  }
  function prevCue() {
    const cur = video ? video.currentTime : 0;
    const i = nearIdx;
    if (i >= 0 && cur - cues[i].start > 1.5) jumpTo(i);
    else jumpTo(Math.max(0, i - 1));
  }
  function nextCue() {
    const cur = video ? video.currentTime : 0;
    const i = cues.findIndex((c) => c.start > cur + 0.05);
    if (i >= 0) jumpTo(i);
  }
  function toggleRepeat() {
    if (repeat) repeat = null;
    else {
      const i = activeIdx >= 0 ? activeIdx : nearIdx;
      if (i < 0) return;
      repeat = { cue: cues[i], count: 1 };
      if (video && video.paused) video.play().catch(() => {});
    }
    updateRepeatUi();
  }
  function updateRepeatUi() {
    repeatBtn.classList.toggle('on', !!repeat);
    const n = S.repeatCount || 0;
    chip.hidden = !repeat && ab.a == null;
    if (repeat) chip.textContent = n ? `문장 반복 ${repeat.count} / ${n}` : `문장 반복 ${repeat.count}회째`;
    else if (ab.a != null) chip.textContent = ab.b == null ? `구간 반복: A ${fmtTime(ab.a)} — B 지점을 정하세요` : `구간 반복 ${fmtTime(ab.a)} – ${fmtTime(ab.b)}`;
  }
  function toggleAB() {
    const cur = video ? video.currentTime : 0;
    if (ab.a == null) ab = { a: cur, b: null };
    else if (ab.b == null) ab = cur > ab.a + 0.5 ? { a: ab.a, b: cur } : { a: null, b: null };
    else ab = { a: null, b: null };
    abBtn.classList.toggle('on', ab.a != null);
    abBtn.textContent = ab.a == null ? 'A–B' : ab.b == null ? 'A–…' : 'A–B ✓';
    updateRepeatUi();
    tick(true);
  }
  function setSpeed(s) {
    S.playbackRate = s;
    if (video) video.playbackRate = s;
    for (const b of speedSeg.children) b.classList.toggle('on', Number(b.dataset.v) === s);
    window.ml.setSettings({ playbackRate: s });
  }
  function stepSpeed(d) {
    const i = SPEEDS.indexOf(S.playbackRate);
    const n = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + d))];
    setSpeed(n);
    toast(`속도 ${n.toFixed(1)}×`);
  }
  function setSubMode(k) {
    S.subtitleMode = k;
    for (const b of subSeg.children) b.classList.toggle('on', b.dataset.v === k);
    renderSubs();
    window.ml.setSettings({ subtitleMode: k });
  }
  function cycleSubMode() {
    const keys = SUB_MODES.map((x) => x[0]);
    const k = keys[(keys.indexOf(S.subtitleMode) + 1) % keys.length];
    setSubMode(k);
    toast(`자막: ${SUB_MODES.find((x) => x[0] === k)[1]}`);
  }
  function setVolume(v) {
    v = Math.max(0, Math.min(1, v));
    S.volume = v;
    volume.value = v;
    if (video) video.volume = v;
    window.ml.setSettings({ volume: v });
  }
  function setSubScale(d) {
    const v = Math.round(Math.max(0.6, Math.min(2, (S.subtitleScale || 1) + d)) * 10) / 10;
    S.subtitleScale = v;
    document.documentElement.style.setProperty('--sub-scale', v);
    window.ml.setSettings({ subtitleScale: v });
    toast(`자막 크기 ${Math.round(v * 100)}%`);
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else screen.requestFullscreen().catch(() => {});
  }

  // ------------------------------------------------------------ 북마크
  function toggleBookmark() {
    const i = activeIdx >= 0 ? activeIdx : nearIdx;
    if (i < 0) return;
    const c = cues[i];
    if (bookmarks.some((b) => b.cueId === c.id)) {
      removeBookmark(c.id);
      toast('북마크 해제');
    } else {
      bookmarks.push({ cueId: c.id, time: c.start, en: c.en, ko: c.ko, at: new Date().toISOString() });
      saveBookmarks();
      toast('북마크 저장');
    }
  }
  function removeBookmark(cueId) {
    bookmarks = bookmarks.filter((b) => b.cueId !== cueId);
    saveBookmarks();
  }
  function saveBookmarks() {
    window.ml.setProgress(m.id, { bookmarks });
    bmCount.textContent = bookmarks.length || '';
    renderList();
    renderMarks();
    updateBmBtn();
  }
  function updateBmBtn() {
    const i = activeIdx >= 0 ? activeIdx : nearIdx;
    const on = i >= 0 && bookmarks.some((b) => b.cueId === cues[i].id);
    bmBtn.classList.toggle('on', on);
    clear(bmBtn).append(icon(on ? 'bookmarkFill' : 'bookmark'));
  }
  function renderMarks() {
    clear(marksEl);
    const d = duration();
    for (const b of bookmarks) marksEl.append(h('div', { class: 'mark', style: { left: `${(b.time / d) * 100}%` } }));
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1200);
  }

  // ------------------------------------------------------------ 루프
  function findNear(time) {
    let lo = 0;
    let hi = cues.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= time + 0.05) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  function tick(force) {
    const time = video ? video.currentTime : 0;
    const d = duration();

    // 문장 반복
    if (repeat && video && !video.paused && time >= repeat.cue.end - 0.08) {
      const n = S.repeatCount || 0;
      if (!n || repeat.count < n) {
        repeat.count++;
        video.currentTime = repeat.cue.start;
      } else {
        repeat = null;
      }
      updateRepeatUi();
    }
    // A–B 반복
    if (ab.a != null && ab.b != null && video && time >= ab.b) video.currentTime = ab.a;

    const near = findNear(time);
    const active = near >= 0 && time < cues[near].end ? near : -1;
    if (near !== nearIdx || active !== activeIdx || force === true) {
      const changed = near !== nearIdx;
      nearIdx = near;
      activeIdx = active;
      renderSubs();
      if (changed || force === true) {
        highlightRow(false);
        renderWordCard();
        updateBmBtn();
      }
    }

    const pct = (time / d) * 100;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    abEl.hidden = ab.a == null;
    if (ab.a != null) {
      const bEnd = ab.b ?? time;
      abEl.style.left = `${(ab.a / d) * 100}%`;
      abEl.style.width = `${(Math.max(0, bEnd - ab.a) / d) * 100}%`;
    }
    timeEl.textContent = `${fmtTime(time)} / ${fmtTime(d)}`;

    if (video && Date.now() - lastSave > 5000 && time > 0) {
      lastSave = Date.now();
      window.ml.setProgress(m.id, { position: time });
    }
  }
  function loop() {
    tick(false);
    raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ 키보드
  function onKey(e) {
    if (isTyping(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key;
    if (k === ' ') togglePlay();
    else if (k === 'ArrowLeft') e.shiftKey ? seek((video?.currentTime || 0) - 5) : prevCue();
    else if (k === 'ArrowRight') e.shiftKey ? seek((video?.currentTime || 0) + 5) : nextCue();
    else if (k === 'ArrowUp') setVolume((S.volume ?? 1) + 0.1);
    else if (k === 'ArrowDown') setVolume((S.volume ?? 1) - 0.1);
    else if (k === 'r' || k === 'R') toggleRepeat();
    else if (k === 'a' || k === 'A') toggleAB();
    else if (k === 's' || k === 'S') cycleSubMode();
    else if (k === '[') stepSpeed(-1);
    else if (k === ']') stepSpeed(1);
    else if (k === 'b' || k === 'B') toggleBookmark();
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === '-') setSubScale(-0.1);
    else if (k === '=' || k === '+') setSubScale(0.1);
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  // ------------------------------------------------------------ 시작
  bmCount.textContent = bookmarks.length || '';
  setTab('script');
  setSpeed(S.playbackRate || 1);
  setSubMode(S.subtitleMode || 'both');
  updateRepeatUi();

  if (video) {
    video.volume = S.volume ?? 1;
    const updatePlayBtn = () => {
      clear(playBtn).append(icon(video.paused ? 'play' : 'pause', 20));
      playBtn.setAttribute('aria-label', video.paused ? '재생' : '일시정지');
    };
    video.addEventListener('play', updatePlayBtn);
    video.addEventListener('pause', () => {
      updatePlayBtn();
      window.ml.setProgress(m.id, { position: video.currentTime });
    });
    video.addEventListener('loadedmetadata', () => {
      video.playbackRate = S.playbackRate || 1;
      const start = params.has('t') ? Number(params.get('t')) : Math.max(0, (t.progress.position || 0) - 2);
      if (start > 0) video.currentTime = start;
      renderMarks();
      tick(true);
      if (params.has('t')) video.play().catch(() => {});
    });
    video.addEventListener('error', () => toast('영상을 재생할 수 없습니다.'));
  }
  renderMarks();
  tick(true);
  loop();

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (video) {
      if (video.currentTime > 0) window.ml.setProgress(m.id, { position: video.currentTime });
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };
}

function hint(k, label) {
  return h('span', null, h('b', null, k), ' ', label);
}

// 단어 풀이에 있는 단어를 영어 자막에서 강조한다.
function markWords(text, words) {
  const terms = (words || []).map((w) => w.term).filter((x) => x && x.length > 1);
  if (!terms.length) return [text];
  const ranges = [];
  for (const term of terms) {
    const re = new RegExp(`(^|[^\\p{L}])(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}])`, 'giu');
    let mt;
    while ((mt = re.exec(text))) {
      const s = mt.index + mt[1].length;
      ranges.push([s, s + mt[2].length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    if (s > pos) out.push(text.slice(pos, s));
    out.push(h('mark', null, text.slice(s, e)));
    pos = e;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}
