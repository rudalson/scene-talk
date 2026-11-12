'use strict';
// 영상(WMV)·음성(WMA)·XML 대본으로 된 학습 자료 폴더를 씬톡 콘텐츠 팩으로 변환한다.
// CLI(scripts/import-folder.js)와 앱의 "콘텐츠 추가" 기능이 함께 사용한다.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { XMLParser } = require('fast-xml-parser');

const SCHEMA_VERSION = 1;

// XML 파일명 접미사 → 난이도. H(dic1)가 빈칸이 가장 많다.
const LEVELS = [
  { id: 'advanced', label: '고급', dic: 'dic1', lstn: 'lstn1' },
  { id: 'intermediate', label: '중급', dic: 'dic2', lstn: 'lstn2' },
  { id: 'beginner', label: '초급', dic: 'dic3', lstn: 'lstn3' },
];

const EXTRA_LABELS = [
  [/영한자막/, '영한 대본'],
  [/영문자막/, '영어 대본'],
  [/한글자막/, '한글 대본'],
  [/mp3/i, '전체 음성 MP3'],
];

// ---------------------------------------------------------------- 탐지

function detectSource(dir) {
  const root = path.resolve(dir);
  const ml = path.join(root, 'movielang');
  const common = path.join(ml, 'include', 'commonfile.js');
  if (!fs.existsSync(common)) {
    throw new Error(`변환할 수 있는 학습 자료 폴더가 아닙니다 (movielang/include/commonfile.js 없음): ${root}`);
  }
  const js = fs.readFileSync(common, 'utf8');
  const pick = (name) => {
    const m = js.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`));
    return m ? m[1] : null;
  };
  const pcode = pick('pcode');
  const movieRel = pick('MovieFile');
  if (!pcode || !movieRel) throw new Error(`commonfile.js에서 pcode/MovieFile을 찾지 못했습니다: ${common}`);

  const xmlDir = path.join(ml, 'xml');
  const info = readXmlList(path.join(xmlDir, `${pcode}_info.xml`))[0] || {};
  const { title, originalTitle } = splitTitle(String(info.title || path.basename(root)));

  return {
    root,
    dataDir: ml,
    xmlDir,
    pcode,
    moviePath: path.join(ml, movieRel),
    dataDir: path.join(ml, 'data'),
    title,
    originalTitle,
    language: String(info.lang || '').includes('영어') ? 'en' : 'en',
  };
}

// "쿵푸 팬더(Kung Fu Panda)" → { title: '쿵푸 팬더', originalTitle: 'Kung Fu Panda' }
function splitTitle(raw) {
  const m = raw.trim().match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m) return { title: m[1].trim(), originalTitle: m[2].trim() };
  return { title: raw.trim(), originalTitle: raw.trim() };
}

function slugify(s) {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'title';
}

// ---------------------------------------------------------------- XML

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => name === 'data',
});

function readXmlList(file) {
  if (!fs.existsSync(file)) return [];
  const doc = parser.parse(fs.readFileSync(file, 'utf8'));
  const list = (doc && doc.value && doc.value.data) || [];
  return list.map((d) => {
    const o = {};
    for (const [k, v] of Object.entries(d)) o[k] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    return o;
  });
}

// ---------------------------------------------------------------- 대본

// word 필드: URL 인코딩된 "<b>legend</b>: 전설, 일화<br><b>legendary</b>: 전설의"
function decodeWords(encoded) {
  if (!encoded) return [];
  let html;
  try {
    html = decodeURIComponent(encoded.replace(/\+/g, ' '));
  } catch {
    html = encoded;
  }
  return html
    .split(/<br\s*\/?>/i)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^<b>(.*?)<\/b>\s*:?\s*(.*)$/i);
      const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
      return m ? { term: strip(m[1]), meaning: strip(m[2]) } : { term: '', meaning: strip(line) };
    });
}

function isGap(entry) {
  const en = (entry.eng || '').trim();
  return en === '' || en === '...';
}

function buildScript(entries, duration) {
  const rows = entries
    .map((e) => ({ ...e, time: Number(e.time) }))
    .filter((e) => Number.isFinite(e.time))
    .sort((a, b) => a.time - b.time);

  const cues = [];
  rows.forEach((e, i) => {
    if (isGap(e)) return;
    const next = rows[i + 1];
    const end = next ? next.time : duration || e.time + 5;
    cues.push({
      id: cues.length + 1,
      start: e.time,
      end: Math.max(end, e.time + 0.5),
      en: e.eng,
      ko: e.kor === '...' ? '' : e.kor,
      words: decodeWords(e.word),
    });
  });
  return { schemaVersion: SCHEMA_VERSION, timeUnit: 'seconds', cues };
}

// ---------------------------------------------------------------- 연습 문제

const splitWords = (s) => (s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

// 빈칸 문장과 전체 문장(반복 듣기 문제의 같은 음성)을 단어 단위로 맞춰 정답을 뽑는다.
// <answer> 필드에는 쉼표 누락·오타가 있어 전체 문장을 우선 사용한다.
function answersFromSentence(tokens, sentence) {
  const full = splitWords(sentence);
  if (full.length !== tokens.length) return null;
  const words = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].includes('_')) words.push(full[i]);
    else if (tokens[i] !== full[i]) return null;
  }
  return words;
}

// "Said to be __ ____ ___." + "so sharp you" → parts
function buildBlanks(subject, answer, sentence) {
  const tokens = splitWords(subject);
  const blankCount = tokens.filter((t) => t.includes('_')).length;
  let words = answersFromSentence(tokens, sentence);
  if (!words) {
    words = splitWords(answer).filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (blankCount !== words.length) {
      return { ok: false, reason: `빈칸 ${blankCount}개, 정답 단어 ${words.length}개` };
    }
  }
  const parts = [];
  let w = 0;
  let text = [];
  const flush = () => {
    if (text.length) parts.push(text.join(' '));
    text = [];
  };
  for (const tok of tokens) {
    if (!tok.includes('_')) {
      text.push(tok);
      continue;
    }
    const first = tok.indexOf('_');
    const last = tok.lastIndexOf('_');
    const prefix = tok.slice(0, first);
    const suffix = tok.slice(last + 1);
    let ans = words[w++];
    if (prefix && ans.startsWith(prefix)) ans = ans.slice(prefix.length);
    if (suffix && ans.endsWith(suffix)) ans = ans.slice(0, ans.length - suffix.length);
    flush();
    const blank = { answer: ans };
    if (prefix) blank.prefix = prefix; // 빈칸 바로 앞에 붙는 문장부호 (예: ")
    if (suffix) blank.suffix = suffix; // 빈칸 바로 뒤에 붙는 문장부호 (예: , ! ")
    parts.push(blank);
  }
  flush();
  return { ok: true, parts };
}

function audioName(srcMp3) {
  return path.basename(srcMp3).replace(/\.[^.]+$/, '.mp3');
}

function buildExercises(info, warnings) {
  const dictation = [];
  const listening = [];
  for (const lv of LEVELS) {
    const dic = readXmlList(path.join(info.xmlDir, `${info.pcode}_${lv.dic}.xml`));
    const lst = readXmlList(path.join(info.xmlDir, `${info.pcode}_${lv.lstn}.xml`));
    const sentenceByMp3 = new Map(lst.map((l) => [l.mp3, l.subject]));

    const ditems = dic.map((d, i) => {
      const r = buildBlanks(d.subject, d.answer, sentenceByMp3.get(d.mp3));
      if (!r.ok) warnings.push(`[받아쓰기 ${lv.label} ${i + 1}] ${r.reason}: "${d.subject}"`);
      return {
        id: `${lv.id}-${d.order || i + 1}`,
        audio: `audio/${audioName(d.mp3)}`,
        time: Number(d.mrktime) || 0,
        ko: d.comment,
        sentence: sentenceByMp3.get(d.mp3) || '',
        parts: r.ok ? r.parts : [d.subject.replace(/_+/g, '____')],
      };
    });
    dictation.push({ id: lv.id, label: lv.label, items: ditems });

    listening.push({
      id: lv.id,
      label: lv.label,
      items: lst.map((l, i) => ({
        id: `${lv.id}-${l.order || i + 1}`,
        audio: `audio/${audioName(l.mp3)}`,
        time: Number(l.mrktime) || 0,
        en: l.subject,
        ko: l.comment,
      })),
    });
  }
  return { schemaVersion: SCHEMA_VERSION, dictation, listening };
}

function collectAudioRefs(info) {
  const refs = new Set();
  for (const lv of LEVELS) {
    for (const f of [lv.dic, lv.lstn]) {
      for (const d of readXmlList(path.join(info.xmlDir, `${info.pcode}_${f}.xml`))) if (d.mp3) refs.add(d.mp3);
    }
  }
  return [...refs];
}

// ---------------------------------------------------------------- ffmpeg

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function run(cmd, args, { onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    p.stdout.on('data', (b) => onStdout && onStdout(b.toString()));
    p.stderr.on('data', (b) => {
      err += b.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} 종료 코드 ${code}\n${err.slice(-2000)}`))));
  });
}

// ffprobe 없이 ffmpeg 출력의 "Duration: 01:31:58.50" 을 읽는다 (배포 용량 절약).
function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-i', file], { windowsHide: true });
    let out = '';
    p.stderr.on('data', (b) => (out += b));
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const m = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    });
  });
}

async function hasEncoder(name) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-encoders'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (b) => (out += b));
    p.on('error', () => resolve(false));
    p.on('close', () => resolve(new RegExp(`\\s${name}\\s`).test(out)));
  });
}

async function convertVideo(src, dest, { encoder = 'auto', duration, onProgress } = {}) {
  const tmp = dest + '.part.mp4';
  const common = ['-y', '-hide_banner', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p'];
  const audio = ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'];
  const tail = ['-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp];

  const nvenc = ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-profile:v', 'high'];
  const x264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high'];

  let useNvenc = encoder === 'nvenc' || (encoder === 'auto' && (await hasEncoder('h264_nvenc')));
  const onStdout = (s) => {
    const m = s.match(/out_time_us=(\d+)/g);
    if (m && duration && onProgress) {
      const us = Number(m[m.length - 1].split('=')[1]);
      onProgress(Math.min(1, us / 1e6 / duration));
    }
  };
  try {
    await run(ffmpegPath(), [...common, ...(useNvenc ? nvenc : x264), ...audio, ...tail], { onStdout });
  } catch (e) {
    if (!useNvenc || encoder === 'nvenc') throw e;
    // GPU 인코더가 실패하면 CPU로 다시 시도
    await run(ffmpegPath(), [...common, ...x264, ...audio, ...tail], { onStdout });
    useNvenc = false;
  }
  fs.renameSync(tmp, dest);
  return { encoder: useNvenc ? 'h264_nvenc' : 'libx264' };
}

async function convertAudio(src, dest) {
  if (/\.mp3$/i.test(src)) {
    fs.copyFileSync(src, dest);
    return;
  }
  const tmp = dest + '.part.mp3';
  await run(ffmpegPath(), ['-y', '-hide_banner', '-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '3', tmp]);
  fs.renameSync(tmp, dest);
}

// ---------------------------------------------------------------- 실행

const ALL_STEPS = ['data', 'audio', 'extras', 'video'];

/**
 * @param {string} srcDir 변환할 학습 자료 폴더
 * @param {string} libraryDir 콘텐츠 폴더
 * @param {object} opts { steps, force, encoder, log(msg), onProgress(step, ratio) }
 */
async function convertFolder(srcDir, libraryDir, opts = {}) {
  const steps = opts.steps || ALL_STEPS;
  const log = opts.log || (() => {});
  const progress = opts.onProgress || (() => {});
  const step = opts.onStep || (() => {});
  const info = detectSource(srcDir);
  const id = opts.id || slugify(info.originalTitle);
  const outDir = path.join(libraryDir, id);
  fs.mkdirSync(outDir, { recursive: true });
  const warnings = [];

  const manifestPath = path.join(outDir, 'manifest.json');
  const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

  const duration = (prev && prev.duration) || (await probeDuration(info.moviePath));

  if (steps.includes('data')) {
    step('data', 'start');
    log(`[${id}] 대본·문제 변환`);
    const script = buildScript(readXmlList(path.join(info.xmlDir, 'script.xml')).length
      ? readXmlList(path.join(info.xmlDir, 'script.xml'))
      : readXmlList(path.join(info.xmlDir, `${info.pcode}.xml`)), duration);
    writeJson(path.join(outDir, 'script.json'), script);
    writeJson(path.join(outDir, 'exercises.json'), buildExercises(info, warnings));
    log(`[${id}] 대사 ${script.cues.length}개`);
    step('data', 'done', `대사 ${script.cues.length}개`);
  }

  if (steps.includes('audio')) {
    step('audio', 'start');
    const refs = collectAudioRefs(info);
    const audioDir = path.join(outDir, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    let done = 0;
    for (const ref of refs) {
      const src = path.join(info.dataDir, ref.replace(/^[\\/]+/, ''));
      const dest = path.join(audioDir, audioName(ref));
      if (!fs.existsSync(src)) {
        warnings.push(`음성 파일 없음: ${ref}`);
      } else if (opts.force || !fs.existsSync(dest)) {
        await convertAudio(src, dest);
      }
      progress('audio', ++done / refs.length);
    }
    log(`[${id}] 문제 음성 ${refs.length}개`);
    step('audio', 'done', `${refs.length}개`);
  }

  let extras = (prev && prev.extras) || [];
  if (steps.includes('extras') && fs.existsSync(info.dataDir)) {
    step('extras', 'start');
    const exDir = path.join(outDir, 'extras');
    fs.mkdirSync(exDir, { recursive: true });
    extras = [];
    for (const name of fs.readdirSync(info.dataDir).sort()) {
      const dest = path.join(exDir, name);
      if (opts.force || !fs.existsSync(dest)) fs.copyFileSync(path.join(info.dataDir, name), dest);
      const label = (EXTRA_LABELS.find(([re]) => re.test(name)) || [null, name])[1];
      extras.push({ label, file: `extras/${name}` });
    }
    log(`[${id}] 부록 자료 ${extras.length}개`);
    step('extras', 'done', `${extras.length}개`);
  }

  let videoInfo = (prev && prev.videoEncoder) || null;
  if (steps.includes('video')) {
    step('video', 'start');
    const dest = path.join(outDir, 'movie.mp4');
    if (opts.force || !fs.existsSync(dest)) {
      log(`[${id}] 영상 변환 시작: ${path.basename(info.moviePath)}`);
      const r = await convertVideo(info.moviePath, dest, {
        encoder: opts.encoder,
        duration,
        onProgress: (p) => progress('video', p),
      });
      videoInfo = r.encoder;
      log(`[${id}] 영상 변환 완료 (${r.encoder})`);
    } else {
      log(`[${id}] 영상 이미 있음, 건너뜀`);
    }
    step('video', 'done', videoInfo || '');
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: (prev && prev.title) || info.title,
    originalTitle: (prev && prev.originalTitle) || info.originalTitle,
    language: info.language,
    translationLanguage: 'ko',
    duration,
    video: 'movie.mp4',
    poster: (prev && prev.poster) || null,
    script: 'script.json',
    exercises: 'exercises.json',
    extras,
    videoEncoder: videoInfo,
    source: { type: 'xml-folder', pcode: info.pcode, folder: path.basename(info.root) },
    importedAt: new Date().toISOString(),
  };
  writeJson(manifestPath, manifest);
  return { id, outDir, manifest, warnings };
}

function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

module.exports = {
  ALL_STEPS,
  detectSource,
  convertFolder,
  // 테스트용
  buildBlanks,
  buildScript,
  decodeWords,
  splitTitle,
  slugify,
};
