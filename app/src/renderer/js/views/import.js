import { h, icon, clear } from '../util.js';

const SOURCES = [
  { id: 'convert', t: '학습 자료 폴더 변환', d: 'WMV 영상·WMA 음성·XML 대본을 자동 변환해 가져옵니다' },
  { id: 'pack', t: '씬톡 콘텐츠 팩', d: '이미 변환된 폴더(manifest.json 포함)를 그대로 복사합니다' },
  { id: 'subtitle', t: '영상 + 자막 파일', d: 'mp4와 영어·한국어 .srt/.vtt로 새 콘텐츠를 만듭니다', soon: true },
];

const STEPS = [
  ['data', '대본·문제 변환', 'script.xml, dic/lstn XML → script.json, exercises.json'],
  ['audio', '문제 음성 변환', 'WMA → MP3'],
  ['extras', '부록 자료 복사', 'data/ → extras/'],
  ['video', '영상 변환', 'WMV → MP4 (H.264) · 편당 수 분~수십 분'],
];

let running = null; // 진행 중인 가져오기 (모달을 닫아도 계속됨)

export function openImportDialog(onDone) {
  const host = document.getElementById('modal-root');
  let source = 'convert';
  let picked = null;

  const back = h('div', { class: 'modal-back' });
  const close = () => {
    document.removeEventListener('keydown', onEsc);
    back.remove();
  };
  const onEsc = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onEsc);
  back.addEventListener('mousedown', (e) => e.target === back && !running && close());

  const sourceList = h('div', { class: 'source-list' }, h('div', { class: 'dim', style: { fontSize: '12px', fontWeight: 600, marginBottom: '4px' } }, '가져올 형식'));
  const main = h('div', { class: 'import-main' });
  const foot = h('div', { class: 'modal-foot' });

  const modal = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-label': '콘텐츠 추가' },
    h(
      'div',
      { class: 'modal-head' },
      h('div', null, h('div', { class: 't' }, '콘텐츠 추가'), h('div', { class: 's' }, '추가한 콘텐츠는 콘텐츠 폴더에 저장되고 라이브러리에 바로 나타납니다.')),
      h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: close }, icon('close', 20))
    ),
    h('div', { class: 'modal-body' }, sourceList, main),
    foot
  );
  back.append(modal);
  host.append(back);

  function renderSources() {
    for (const el of [...sourceList.querySelectorAll('.source')]) el.remove();
    for (const s of SOURCES) {
      sourceList.append(
        h(
          'button',
          {
            class: s.id === source ? 'source on' : 'source',
            disabled: s.soon || !!running,
            onclick: () => {
              source = s.id;
              picked = null;
              render();
            },
          },
          h('span', { class: 't' }, s.t),
          h('span', { class: 'd' }, s.d),
          s.soon ? h('span', { class: 'soon' }, '다음 버전에서 지원') : null
        )
      );
    }
  }

  async function pick() {
    const p = await window.ml.pickFolder(source === 'convert' ? '변환할 학습 자료 폴더 선택' : '콘텐츠 팩 폴더 선택');
    if (p) {
      picked = p;
      render();
    }
  }

  function render() {
    renderSources();
    clear(main);
    clear(foot);
    if (running) return renderRunning();

    main.append(
      picked
        ? h(
            'div',
            { class: 'picked' },
            icon('folder', 22),
            h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'n' }, picked.split(/[\\/]/).pop()), h('div', { class: 'p' }, picked)),
            h('button', { class: 'btn sm', onclick: pick }, '다른 폴더')
          )
        : h('button', { class: 'btn lg', onclick: pick, style: { alignSelf: 'flex-start' } }, icon('folder', 16), '폴더 선택'),
      source === 'convert'
        ? h(
            'div',
            { class: 'note' },
            '영상·대본 XML이 들어 있는 학습 자료 폴더를 선택하세요.',
            h('br'),
            '영상 변환은 컴퓨터 성능에 따라 시간이 걸립니다. 선택한 폴더는 수정하지 않습니다.'
          )
        : h('div', { class: 'note' }, 'manifest.json 이 들어 있는 폴더를 선택하세요. 폴더 전체가 콘텐츠 폴더로 복사됩니다.')
    );
    if (source === 'convert') main.append(stepsBox({}));

    foot.append(
      h('div', { class: 'note' }, ''),
      h(
        'div',
        { style: { display: 'flex', gap: '10px' } },
        h('button', { class: 'btn lg', onclick: close }, '취소'),
        h('button', { class: 'btn primary lg', disabled: !picked, onclick: startImport }, '가져오기 시작')
      )
    );
  }

  function stepsBox(st, prog) {
    const box = h('div', { class: 'steps' });
    for (const [key, title, detail] of STEPS) {
      const s = st[key] || {};
      const cls = s.status === 'done' ? 'done' : s.status === 'start' ? 'run' : s.status === 'error' ? 'err' : '';
      box.append(
        h(
          'div',
          { class: `step ${cls}` },
          h('div', { class: 'dot' }, s.status === 'done' ? icon('check', 13) : null),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 't' }, title), h('div', { class: 'd' }, s.detail || detail)),
          h('div', { class: 's' }, { done: '완료', start: '진행 중', error: '실패' }[s.status] || '대기')
        )
      );
    }
    if (prog) {
      box.append(
        h(
          'div',
          { class: 'prog' },
          h('div', { class: 'row' }, h('span', null, prog.label), h('span', { class: 'tabular' }, `${Math.floor(prog.ratio * 100)}%`)),
          h('div', { class: 'bar' }, h('i', { style: { width: `${prog.ratio * 100}%` } }))
        )
      );
    }
    return box;
  }

  function renderRunning() {
    const r = running;
    main.append(
      h('div', { class: 'picked' }, icon('folder', 22), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'n' }, r.name), h('div', { class: 'p' }, r.path))),
      r.kind === 'convert' ? stepsBox(r.steps, r.prog) : h('div', { class: 'note' }, r.done ? '복사가 끝났습니다.' : '복사하는 중…'),
      r.error ? h('div', { class: 'error-box' }, r.error) : null,
      r.warnings && r.warnings.length ? h('div', { class: 'note' }, `경고 ${r.warnings.length}건: `, r.warnings.join(' / ')) : null
    );
    const finished = r.done || r.error;
    foot.append(
      h('div', { class: 'note' }, finished ? '' : '창을 닫아도 백그라운드에서 계속됩니다.'),
      h(
        'div',
        { style: { display: 'flex', gap: '10px' } },
        finished
          ? h(
              'button',
              {
                class: 'btn primary lg',
                onclick: () => {
                  running = null;
                  close();
                  onDone && onDone();
                },
              },
              r.error ? '닫기' : '라이브러리에서 보기'
            )
          : h('button', { class: 'btn lg', onclick: close }, '백그라운드로')
      )
    );
  }

  async function startImport() {
    const kind = source;
    running = { kind, path: picked, name: picked.split(/[\\/]/).pop(), steps: {}, prog: null, done: false, error: null, warnings: [] };
    const rerender = () => back.isConnected && render();
    rerender();
    if (kind === 'pack') {
      try {
        await window.ml.importPack(picked);
        running.done = true;
      } catch (e) {
        running.error = cleanErr(e);
      }
      return rerender();
    }
    const off = window.ml.onImportEvent((ev) => {
      if (ev.type === 'step') {
        running.steps[ev.step] = { status: ev.status, detail: ev.detail || undefined };
        if (ev.step === 'video' && ev.status === 'start') running.prog = { label: '영상 변환 중', ratio: 0 };
        if (ev.step === 'video' && ev.status === 'done') running.prog = null;
      } else if (ev.type === 'progress' && ev.step === 'video') {
        running.prog = { label: '영상 변환 중', ratio: ev.ratio };
      } else if (ev.type === 'error' && ev.step) {
        running.steps[ev.step] = { status: 'error' };
      }
      rerender();
    });
    try {
      const r = await window.ml.convertFolder(picked);
      running.done = true;
      running.warnings = r.warnings || [];
    } catch (e) {
      running.error = cleanErr(e);
    } finally {
      off();
    }
    rerender();
    if (!back.isConnected && onDone) onDone();
  }

  render();
}

function cleanErr(e) {
  return String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
