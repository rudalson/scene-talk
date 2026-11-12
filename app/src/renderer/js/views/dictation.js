import { h, icon, fmtTime, clear, normWord } from '../util.js';
import { loadTitle, titleHeader, state } from '../app.js';

export async function renderDictation(root, id, params) {
  const t = await loadTitle(id, { fresh: true });
  const m = t.manifest;
  const S = state.settings;
  const levels = t.exercises.dictation.filter((l) => l.items.length);
  const results = { ...(t.progress.dictation || {}) };
  if (!levels.length) {
    root.append(titleHeader(t, 'dictation'), h('div', { class: 'empty' }, '이 콘텐츠에는 받아쓰기 문제가 없습니다.'));
    return null;
  }

  let level = levels.find((l) => l.id === (params.get('level') || S.dictationLevel)) || levels.find((l) => l.id === 'beginner') || levels[0];
  let index = 0;
  let inputs = [];
  let checked = false;

  const audio = new Audio();
  audio.preservesPitch = true;

  const levelSeg = h('div', { class: 'seg lg', role: 'group', 'aria-label': '난이도' });
  for (const l of levels) levelSeg.append(h('button', { dataset: { v: l.id }, onclick: () => setLevel(l) }, l.label));
  const counter = h('div', { class: 'muted' });
  const card = h('div', { class: 'q-card' });
  const listHead = h('div', { class: 'head' });
  const qList = h('div', { class: 'q-list' });

  root.append(
    titleHeader(t, 'dictation'),
    h(
      'div',
      { class: 'study' },
      h(
        'section',
        { class: 'study-main' },
        h('div', { class: 'study-head' }, levelSeg, counter),
        card,
        h('div', { class: 'kbd-hints' }, hint('Enter', '채점 / 다음 문제'), hint('Ctrl+Space', '다시 듣기'), hint('Tab', '다음 빈칸'))
      ),
      h('aside', { class: 'q-list-panel' }, listHead, qList)
    )
  );

  function setLevel(l) {
    level = l;
    index = 0;
    S.dictationLevel = l.id;
    window.ml.setSettings({ dictationLevel: l.id });
    for (const b of levelSeg.children) b.classList.toggle('on', b.dataset.v === l.id);
    renderList();
    renderQuestion(true);
  }

  function play(rate = 1) {
    const item = level.items[index];
    audio.src = t.baseUrl + encodeURI(item.audio);
    audio.playbackRate = rate;
    audio.play().catch(() => {});
  }

  function renderList() {
    clear(qList);
    const done = level.items.filter((it) => results[it.id]?.correct).length;
    clear(listHead).append(h('b', null, `${level.label} 문제`), h('span', { class: 'muted', style: { fontSize: '13px' } }, `정답 ${done} / ${level.items.length}`));
    level.items.forEach((it, i) => {
      const r = results[it.id];
      qList.append(
        h(
          'button',
          {
            class: ['q-item', i === index ? 'on' : '', r ? (r.correct ? 'correct' : 'wrong') : ''].join(' '),
            onclick: () => {
              index = i;
              renderList();
              renderQuestion(true);
            },
          },
          h('div', { class: 'n' }, i + 1),
          h('div', { class: 'txt' }, it.ko),
          h('div', { class: 't tabular' }, fmtTime(it.time))
        )
      );
    });
  }

  function renderQuestion(autoplay) {
    const item = level.items[index];
    checked = false;
    inputs = [];
    counter.replaceChildren('문제 ', h('b', { style: { color: 'var(--text)' } }, index + 1), ` / ${level.items.length}`);
    clear(card);

    const sentence = h('div', { class: 'q-sentence' });
    for (const p of item.parts) {
      if (typeof p === 'string') {
        sentence.append(h('span', null, p));
        continue;
      }
      const input = h('input', {
        class: 'blank',
        'aria-label': `${inputs.length + 1}번째 빈칸`,
        autocomplete: 'off',
        spellcheck: false,
        style: { width: `${Math.max(3, p.answer.length) + 2}ch` },
      });
      input.dataset.answer = p.answer;
      input.addEventListener('input', () => input.classList.remove('ok', 'bad', 'revealed'));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (checked && allCorrect()) next();
          else check();
        } else if (e.key === ' ' && !e.ctrlKey && input.selectionStart === input.value.length && input.value) {
          // 띄어쓰기로 다음 빈칸 이동
          const nextInput = inputs[inputs.indexOf(input) + 1];
          if (nextInput) {
            e.preventDefault();
            nextInput.focus();
          }
        }
      });
      inputs.push(input);
      sentence.append(
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '2px' } }, p.prefix || null, input, p.suffix || null)
      );
    }

    const resultBox = h('div', { hidden: true });
    const nextBtn = h('button', { class: 'btn primary lg', onclick: next }, index < level.items.length - 1 ? '다음 문제 →' : '처음으로');

    card.append(
      h(
        'div',
        { class: 'q-tools' },
        h('button', { class: 'round-btn', 'aria-label': '문장 듣기', title: '문장 듣기 (Ctrl+Space)', onclick: () => play(1) }, icon('speaker', 24)),
        h('button', { class: 'btn', onclick: () => play(0.7) }, '느리게 듣기 0.7×'),
        h('a', { class: 'btn', href: `#/play/${encodeURIComponent(m.id)}?t=${Math.max(0, item.time - 1)}` }, icon('video', 16), `영상 장면 보기 (${fmtTime(item.time)})`)
      ),
      h('div', { class: 'q-ko' }, item.ko),
      sentence,
      resultBox,
      h(
        'div',
        { class: 'q-actions' },
        h('button', { class: 'btn lg', onclick: retry }, '다시 풀기'),
        h('button', { class: 'btn lg', onclick: reveal }, '정답 보기'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn lg', onclick: check }, '채점'),
        nextBtn
      )
    );
    card.resultBox = resultBox;
    if (inputs[0]) inputs[0].focus();
    if (autoplay) play(1);
  }

  function allCorrect() {
    return inputs.every((i) => normWord(i.value) === normWord(i.dataset.answer));
  }

  function check() {
    checked = true;
    const wrong = [];
    for (const input of inputs) {
      const ok = normWord(input.value) === normWord(input.dataset.answer);
      input.classList.toggle('ok', ok);
      input.classList.toggle('bad', !ok);
      if (!ok) wrong.push([input.value || '(빈칸)', input.dataset.answer]);
    }
    const box = card.resultBox;
    box.hidden = false;
    const correct = wrong.length === 0;
    if (correct) {
      box.className = 'result ok';
      box.replaceChildren(icon('check', 20), h('div', null, '정답입니다! ', h('span', { class: 'muted' }, 'Enter를 누르면 다음 문제로 넘어갑니다.')));
    } else {
      box.className = 'result bad';
      box.replaceChildren(
        icon('alert', 20),
        h(
          'div',
          null,
          `${inputs.length}단어 중 ${inputs.length - wrong.length}개 정답 · `,
          wrong.flatMap(([w, r], i) => [i ? ', ' : '', h('span', { class: 'wrong' }, w), ' → ', h('span', { class: 'right' }, r)])
        )
      );
      const firstBad = inputs.find((i) => i.classList.contains('bad'));
      if (firstBad) firstBad.focus();
    }
    saveResult(correct);
  }

  function saveResult(correct) {
    const item = level.items[index];
    const prev = results[item.id] || { tries: 0 };
    // 한 번이라도 맞히면 정답으로 기록
    results[item.id] = { correct: correct || !!prev.correct, tries: prev.tries + 1, at: new Date().toISOString() };
    window.ml.setProgress(m.id, { dictation: results });
    renderList();
  }

  function retry() {
    for (const i of inputs) {
      i.value = '';
      i.classList.remove('ok', 'bad', 'revealed');
    }
    card.resultBox.hidden = true;
    checked = false;
    if (inputs[0]) inputs[0].focus();
  }

  function reveal() {
    for (const i of inputs) {
      if (normWord(i.value) !== normWord(i.dataset.answer)) {
        i.value = i.dataset.answer;
        i.classList.remove('ok', 'bad');
        i.classList.add('revealed');
      }
    }
    checked = true;
  }

  function next() {
    index = (index + 1) % level.items.length;
    renderList();
    renderQuestion(true);
  }

  function onKey(e) {
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      play(1);
    }
  }
  document.addEventListener('keydown', onKey);

  setLevel(level);

  return () => {
    document.removeEventListener('keydown', onKey);
    audio.pause();
    audio.removeAttribute('src');
  };
}

function hint(k, label) {
  return h('span', null, h('b', null, k), ' ', label);
}
