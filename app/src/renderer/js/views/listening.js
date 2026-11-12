import { h, icon, fmtTime, clear, isTyping } from '../util.js';
import { loadTitle, titleHeader, state } from '../app.js';

// 반복 듣기(쉐도잉): 문장 음성을 정해진 횟수만큼 반복 재생한다.
export async function renderListening(root, id, params) {
  const t = await loadTitle(id, { fresh: true });
  const m = t.manifest;
  const S = state.settings;
  const levels = t.exercises.listening.filter((l) => l.items.length);
  const heard = { ...(t.progress.listening || {}) };
  if (!levels.length) {
    root.append(titleHeader(t, 'listening'), h('div', { class: 'empty' }, '이 콘텐츠에는 반복 듣기 문제가 없습니다.'));
    return null;
  }

  let level = levels.find((l) => l.id === (params.get('level') || S.listeningLevel)) || levels.find((l) => l.id === 'beginner') || levels[0];
  let index = 0;
  let times = S.listenTimes || 3;
  let slow = false;
  let hideEn = !!S.listenHideEn;
  let autoNext = !!S.listenAutoNext;
  let playing = false;
  let played = 0;
  let gapTimer = 0;

  const audio = new Audio();
  audio.preservesPitch = true;
  audio.addEventListener('ended', onEnded);

  const levelSeg = h('div', { class: 'seg lg', role: 'group', 'aria-label': '난이도' });
  for (const l of levels) levelSeg.append(h('button', { dataset: { v: l.id }, onclick: () => setLevel(l) }, l.label));
  const counter = h('div', { class: 'muted' });
  const card = h('div', { class: 'q-card' });
  const listHead = h('div', { class: 'head' });
  const qList = h('div', { class: 'q-list' });

  root.append(
    titleHeader(t, 'listening'),
    h(
      'div',
      { class: 'study' },
      h(
        'section',
        { class: 'study-main' },
        h('div', { class: 'study-head' }, levelSeg, counter),
        card,
        h('div', { class: 'kbd-hints' }, hint('Space', '반복 재생 / 정지'), hint('← →', '이전/다음 문장'), hint('H', '영어 가리기'))
      ),
      h('aside', { class: 'q-list-panel' }, listHead, qList)
    )
  );

  function setLevel(l) {
    level = l;
    index = 0;
    window.ml.setSettings({ listeningLevel: l.id });
    S.listeningLevel = l.id;
    for (const b of levelSeg.children) b.classList.toggle('on', b.dataset.v === l.id);
    stop();
    renderList();
    renderCard();
  }

  function renderList() {
    clear(qList);
    const n = level.items.filter((it) => heard[it.id]).length;
    clear(listHead).append(h('b', null, `${level.label} 문장`), h('span', { class: 'muted', style: { fontSize: '13px' } }, `들은 문장 ${n} / ${level.items.length}`));
    level.items.forEach((it, i) => {
      qList.append(
        h(
          'button',
          { class: ['q-item', i === index ? 'on' : '', heard[it.id] ? 'correct' : ''].join(' '), onclick: () => select(i, true) },
          h('div', { class: 'n' }, i + 1),
          h('div', { class: 'txt' }, it.en),
          h('div', { class: 't tabular' }, fmtTime(it.time))
        )
      );
    });
  }

  let dots;
  let enEl;
  let playBtn;
  function renderCard() {
    const item = level.items[index];
    counter.replaceChildren('문장 ', h('b', { style: { color: 'var(--text)' } }, index + 1), ` / ${level.items.length}`);
    clear(card);
    dots = h('div', { class: 'repeat-dots', 'aria-label': '반복 진행' });
    playBtn = h('button', { class: 'round-btn', 'aria-label': '반복 재생', onclick: togglePlay }, icon('play', 24));
    enEl = h('div', { class: hideEn ? 'listen-en hidden' : 'listen-en' }, item.en);
    const timesSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '반복 횟수' });
    for (const n of [1, 3, 5, 10]) timesSeg.append(h('button', { class: n === times ? 'on' : null, onclick: () => setTimes(n) }, `${n}회`));

    card.append(
      h(
        'div',
        { class: 'q-tools' },
        playBtn,
        dots,
        h('div', { class: 'spacer' }),
        timesSeg,
        h('button', { class: slow ? 'btn on' : 'btn', onclick: () => ((slow = !slow), renderCard()) }, '느리게 0.7×'),
        h('button', { class: hideEn ? 'btn on' : 'btn', onclick: toggleHide }, icon('eye', 16), hideEn ? '영어 보기' : '영어 가리기')
      ),
      enEl,
      h('div', { class: 'q-ko' }, item.ko),
      h(
        'div',
        { class: 'q-actions' },
        h('button', { class: 'btn lg', onclick: () => select(index - 1, true), disabled: index === 0 }, '← 이전'),
        h('a', { class: 'btn lg', href: `#/play/${encodeURIComponent(m.id)}?t=${Math.max(0, item.time - 1)}` }, icon('video', 16), `영상 장면 보기 (${fmtTime(item.time)})`),
        h('div', { class: 'spacer' }),
        h(
          'label',
          { class: 'muted', style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' } },
          h('input', {
            type: 'checkbox',
            checked: autoNext,
            onchange: (e) => {
              autoNext = e.target.checked;
              window.ml.setSettings({ listenAutoNext: autoNext });
            },
          }),
          '자동으로 다음 문장'
        ),
        h('button', { class: 'btn primary lg', onclick: () => select(index + 1, true) }, '다음 문장 →')
      )
    );
    renderDots();
  }

  function renderDots() {
    clear(dots);
    for (let i = 0; i < times; i++) dots.append(h('i', { class: i < played ? 'on' : null }));
    clear(playBtn).append(icon(playing ? 'pause' : 'play', 24));
  }

  function setTimes(n) {
    times = n;
    window.ml.setSettings({ listenTimes: n });
    renderCard();
  }
  function toggleHide() {
    hideEn = !hideEn;
    window.ml.setSettings({ listenHideEn: hideEn });
    renderCard();
  }

  function select(i, autoplay) {
    if (i < 0 || i >= level.items.length) return;
    stop();
    index = i;
    renderList();
    renderCard();
    if (autoplay) start();
  }

  function start() {
    played = 0;
    playing = true;
    playOnce();
  }
  function playOnce() {
    const item = level.items[index];
    audio.src = t.baseUrl + encodeURI(item.audio);
    audio.playbackRate = slow ? 0.7 : 1;
    audio.play().catch(() => stop());
    renderDots();
  }
  function onEnded() {
    played++;
    renderDots();
    if (played >= times) {
      const item = level.items[index];
      heard[item.id] = { count: (heard[item.id]?.count || 0) + played, at: new Date().toISOString() };
      window.ml.setProgress(m.id, { listening: heard });
      playing = false;
      renderList();
      renderDots();
      if (autoNext && index < level.items.length - 1) gapTimer = setTimeout(() => select(index + 1, true), 1200);
      return;
    }
    // 따라 말할 시간: 문장 길이만큼 쉬고 다시 재생
    const gap = Math.min(4000, Math.max(1200, (audio.duration || 2) * 1000));
    gapTimer = setTimeout(() => playing && playOnce(), gap);
  }
  function stop() {
    clearTimeout(gapTimer);
    playing = false;
    played = 0;
    audio.pause();
    if (dots) renderDots();
  }
  function togglePlay() {
    if (playing) stop();
    else start();
  }

  function onKey(e) {
    if (isTyping(e) || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') togglePlay();
    else if (e.key === 'ArrowLeft') select(index - 1, true);
    else if (e.key === 'ArrowRight') select(index + 1, true);
    else if (e.key === 'h' || e.key === 'H') toggleHide();
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  setLevel(level);

  return () => {
    document.removeEventListener('keydown', onKey);
    stop();
    audio.removeAttribute('src');
  };
}

function hint(k, label) {
  return h('span', null, h('b', null, k), ' ', label);
}
