<p align="center">
  <img src="app/build/icon.png" width="128" height="128" alt="씬톡 아이콘">
</p>

<h1 align="center">씬톡 <sub>SceneTalk</sub></h1>

<p align="center">영화를 보며 외국어를 배우는 Windows 데스크톱 학습 플레이어</p>

---

씬톡(SceneTalk)은 영화 한 편을 대사 단위로 나눠 보고, 듣고, 받아쓰며 외국어를 익히는 Electron 데스크톱 앱입니다.
앱과 콘텐츠가 분리되어 있어 학습용 영상을 폴더 단위로 계속 추가할 수 있습니다.

## 주요 기능

| 영상 학습 | 받아쓰기 | 반복 듣기 |
|---|---|---|
| 영어·우리말·동시자막·자막 끄기 | 초급·중급·고급 3단계 | 문장 음성을 1·3·5·10회 반복 |
| 대본 목록에서 문장을 누르면 해당 장면으로 이동 | 단어별 빈칸 입력과 즉시 채점 | 따라 말할 수 있게 문장 사이에 쉬는 시간 |
| 문장 반복, A–B 구간 반복 | 틀린 단어와 정답 비교 | 영어 가리기(쉐도잉) |
| 재생 속도 0.6×~1.5× | 느리게 듣기 0.7× | 자동으로 다음 문장 |
| 단어 풀이, 단어 목록, 북마크 | 문제에서 영상 장면으로 바로 이동 | 들은 문장 기록 |

- **이어보기**: 마지막으로 멈춘 장면을 기억합니다.
- **콘텐츠 추가**: 영상·음성·XML 대본으로 된 학습 자료 폴더를 앱 안에서 바로 변환합니다(WMV→MP4, WMA→MP3, XML→JSON).
- **학습 기록 분리**: 진도·북마크·채점 기록은 사용자 데이터 폴더에 저장되어, 콘텐츠를 바꿔도 남습니다.

## 다운로드 / 설치

`app/dist/`에서 빌드된 두 가지 실행 파일 중 하나를 사용합니다. ([직접 빌드하기](#exe-빌드))

| 파일 | 설명 | 콘텐츠 폴더 기본 위치 |
|---|---|---|
| `SceneTalk-Setup-<버전>.exe` | 설치형 | `문서\SceneTalk Library` |
| `SceneTalk-Portable-<버전>.exe` | 설치 없이 실행 | exe 옆의 `SceneTalk Library` 폴더 |

콘텐츠 폴더 위치는 앱의 **폴더 변경** 버튼으로 바꿀 수 있습니다.

> 코드 서명을 하지 않은 exe라서 처음 실행할 때 Windows SmartScreen 경고가 나올 수 있습니다. **추가 정보 → 실행**을 누르세요.

## 개발 환경

필요한 것:

- Windows 10/11
- Node.js 20 이상
- [ffmpeg](https://ffmpeg.org/) (PATH에 있거나 `FFMPEG_PATH` 환경 변수로 지정): 콘텐츠 변환과 exe 빌드에 사용

```bash
cd app
npm install        # Electron 바이너리를 내려받습니다
npm start          # 개발 모드 실행
```

> npm 11 이상에서는 패키지 설치 스크립트가 기본으로 막혀 있습니다. `package.json`의 `allowScripts`에 Electron이 허용되어 있으니, `npm install` 뒤에 Electron이 실행되지 않으면 `npm rebuild electron`을 실행하세요.

개발 모드에서는 저장소의 `library/` 폴더를 콘텐츠 폴더로 씁니다.

### exe 빌드

```bash
cd app
npm run dist       # ffmpeg 복사 → 설치형·포터블 exe 생성 (app/dist/)
```

### 아이콘 다시 만들기

`app/build/icon.svg`를 고친 뒤 아래 명령을 실행하면 `icon.png`, `icon.ico`(16~256px), 앱 내부 로고가 다시 만들어집니다.

```bash
npm run make-icon
```

## 학습 자료 변환

**앱에서:** 라이브러리의 **콘텐츠 추가 → 학습 자료 폴더 변환**에서 폴더를 선택합니다.

**명령줄에서:** 여러 편을 한꺼번에 변환할 때 편합니다.

```bash
cd app
node scripts/import-folder.js "D:/videos/title-a" "D:/videos/title-b" --out ../library

# 옵션
#   --only data,audio,extras,video   일부 단계만 실행 (영상 변환은 오래 걸림)
#   --encoder auto|nvenc|x264        영상 인코더 (기본: NVIDIA GPU가 있으면 nvenc)
#   --force                          이미 있는 파일도 다시 변환
```

변환기는 선택한 폴더를 수정하지 않습니다. 받아쓰기 정답에 오타·누락이 있으면 같은 음성을 쓰는 반복 듣기 문장으로 보정합니다.

## 콘텐츠 폴더 구조

콘텐츠 폴더 안의 하위 폴더 하나가 타이틀 하나입니다. `manifest.json`이 있는 폴더만 라이브러리에 나타나고, **폴더 이름이 곧 타이틀 ID**입니다.

```
SceneTalk Library/
└─ kung-fu-panda/
   ├─ manifest.json      # 제목, 언어, 길이, 파일 경로
   ├─ movie.mp4          # H.264/AAC 권장
   ├─ script.json        # 시간별 대사·번역·단어 풀이
   ├─ exercises.json     # 받아쓰기·반복 듣기 문제 (선택)
   ├─ audio/*.mp3        # 문제 음성 (선택)
   ├─ poster.jpg         # 포스터 (선택)
   └─ extras/            # 대본 txt, 전체 음성 등 부록 (선택)
```

<details>
<summary><b>manifest.json</b></summary>

```json
{
  "schemaVersion": 1,
  "id": "kung-fu-panda",
  "title": "쿵푸 팬더",
  "originalTitle": "Kung Fu Panda",
  "language": "en",
  "translationLanguage": "ko",
  "duration": 5518.5,
  "video": "movie.mp4",
  "poster": null,
  "script": "script.json",
  "exercises": "exercises.json",
  "extras": [{ "label": "영어 대본", "file": "extras/영문자막.txt" }]
}
```

`poster`에 이미지 경로(예: `"poster.jpg"`)를 넣으면 라이브러리에 포스터가 표시됩니다.
</details>

<details>
<summary><b>script.json</b> (시간 단위: 초)</summary>

```json
{
  "schemaVersion": 1,
  "timeUnit": "seconds",
  "cues": [
    {
      "id": 1,
      "start": 35,
      "end": 39,
      "en": "Legend tells of a legendary warrior...",
      "ko": "전설적인 용사에 대한 전설이 있었다...",
      "words": [{ "term": "legend", "meaning": "전설, 일화, 위인전" }]
    }
  ]
}
```
</details>

<details>
<summary><b>exercises.json</b></summary>

```json
{
  "schemaVersion": 1,
  "dictation": [
    {
      "id": "beginner",
      "label": "초급",
      "items": [
        {
          "id": "beginner-1",
          "audio": "audio/L-1.mp3",
          "time": 43,
          "ko": "그는 적수가 되는 악당을 찾아 세상을 떠돌았다.",
          "sentence": "He traveled the land in search of worthy foes.",
          "parts": ["He", { "answer": "traveled" }, { "answer": "the" }, "worthy foes."]
        }
      ]
    }
  ],
  "listening": [
    {
      "id": "beginner",
      "label": "초급",
      "items": [{ "id": "beginner-1", "audio": "audio/L-1.mp3", "time": 43, "en": "He traveled the land in search of worthy foes.", "ko": "그는 적수가 되는 악당을 찾아 세상을 떠돌았다." }]
    }
  ]
}
```

`parts`의 문자열은 그대로 보이는 부분이고, `{ "answer": ... }`는 빈칸입니다. 빈칸에 붙는 문장부호는 `prefix`/`suffix`로 지정합니다.
</details>

## 단축키

| 화면 | 키 | 동작 |
|---|---|---|
| 영상 학습 | `Space` | 재생 / 일시정지 |
| | `←` `→` | 이전 / 다음 문장 |
| | `Shift` + `←` `→` | 5초 뒤로 / 앞으로 |
| | `R` | 문장 반복 |
| | `A` | 구간 반복 (A 지점 → B 지점 → 해제) |
| | `S` | 자막 모드 전환 |
| | `[` `]` | 재생 속도 |
| | `B` | 북마크 |
| | `-` `=` | 자막 크기 |
| | `↑` `↓` | 볼륨 |
| | `F` | 전체화면 |
| 받아쓰기 | `Enter` | 채점 / 다음 문제 |
| | `Ctrl` + `Space` | 다시 듣기 |
| 반복 듣기 | `Space` | 반복 재생 / 정지 |
| | `←` `→` | 이전 / 다음 문장 |
| | `H` | 영어 가리기 |

## 프로젝트 구조

```
app/
├─ src/
│  ├─ main/          # Electron 메인 프로세스
│  │  ├─ main.js       창, IPC, 콘텐츠 폴더 위치
│  │  ├─ protocol.js   ml:// 프로토콜 (영상 탐색용 Range 요청 지원)
│  │  ├─ library.js    콘텐츠 폴더 읽기
│  │  └─ store.js      설정·학습 기록 (JSON)
│  ├─ preload/       # 화면에 노출하는 API (contextIsolation)
│  ├─ importer/      # 학습 자료 변환기 (앱과 CLI가 함께 사용)
│  └─ renderer/      # 화면 (프레임워크 없는 HTML/CSS/JS)
├─ scripts/          # import-folder, make-icon, prepare-ffmpeg
└─ build/            # 아이콘 원본 (svg, png, ico)
library/             # 개발용 콘텐츠 폴더 (git에서 제외)
```

학습 기록과 설정 저장 위치: `%APPDATA%\SceneTalk\` (`settings.json`, `progress.json`)

## 저작권 안내

이 저장소에는 **앱 코드만** 들어 있습니다. 영화 영상, 대본, 음성 같은 학습 콘텐츠는 각 권리자의 저작물이므로 저장소에 포함하지 않으며(`library/`는 `.gitignore`로 제외), 정당하게 소유한 콘텐츠로만 사용해 주세요.

배포용 exe에는 [ffmpeg](https://ffmpeg.org/)(GPL 빌드)가 함께 들어갑니다. exe를 외부에 배포할 때는 ffmpeg 라이선스 조건을 확인하세요.

## 앞으로 할 일

- [ ] 영상 + 자막 파일(.srt/.vtt)로 새 콘텐츠 만들기
- [ ] 포스터 이미지 지정 UI
- [ ] 단어장 화면, 학습 통계
- [ ] 변환 영상 용량 최적화 옵션
