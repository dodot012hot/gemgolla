# 겜골라

몇 명이서, 얼마까지, 어떤 분위기인지 말하면 친구랑 할 스팀 멀티 게임을 골라주는 웹앱.

- 문장 입력 → 인원·가격·경쟁/협동·길이·분위기·신작 여부를 읽어서 필터에 채움
- 필터로 직접 조정 가능
- 신작·숨은 명작이 인기작보다 위로 오도록 정렬
- 가격·할인·출시일·표지는 매일 새벽 스팀 한국 스토어에서 자동 갱신

## 로컬 실행

```bash
npm install
npm run dev
```

## 처음 배포하기 (한 번만)

1. **GitHub에 올리기**: GitHub에서 새 저장소를 만들고 이 폴더를 push. GitHub Desktop으로 해도 됩니다.
2. **Vercel 연결**: vercel.com에서 GitHub로 로그인 → Add New Project → 이 저장소 선택 → 설정은 기본값(Vite 자동 인식) 그대로 Deploy.
   이후 `main`에 push될 때마다 자동으로 다시 배포됩니다.
3. **자동 갱신 켜기**: 저장소의 Actions 탭에서 워크플로 사용을 허용. 처음엔 "게임 데이터 매일 갱신" → Run workflow로 한 번 수동 실행해서 잘 도는지 확인하세요.
4. **(선택) AI 자동 분류**: Settings → Secrets and variables → Actions → New repository secret에 `ANTHROPIC_API_KEY` 추가.
   - 넣으면: 새로 발견한 게임의 설명을 AI가 읽고 인원·모드·태그를 뽑아서 바로 목록에 추가합니다(하루 최대 15개).
   - 안 넣으면: 새 게임은 `data/candidates.json`에만 쌓이고, 직접 확인해서 `public/games.json`에 넣으면 됩니다.

## 매일 무슨 일이 일어나나

`scripts/update-games.mjs`가 매일 한국 시간 새벽 4시쯤 실행됩니다.

1. 목록의 모든 게임에 대해 스팀에서 현재 원화 가격, 할인율, 출시일, 표지 이미지를 받아옴
2. 스팀 "협동"·"파티 게임" 태그의 인기 신작 중 아직 목록에 없는 게임을 찾음
3. 바뀐 게 있으면 `public/games.json`을 커밋 → Vercel이 자동 배포

출시 1년 이내 게임은 자동으로 "신작" 배지가 붙고, 1년이 지나면 "숨은 명작"으로 바뀝니다(`kind`가 `hit`인 인기작은 그대로).

## 데이터 직접 고치기

`public/games.json`의 게임 하나는 이렇게 생겼습니다.

```json
{ "appid": 4656000, "name": "BOMBANANA!", "min": 3, "max": 3, "mode": "coop",
  "price": 8700, "len": "short", "tags": ["puzzle","party","funny"],
  "desc": "원숭이 셋이 정보를 나눠 갖고 폭탄을 해체하는 대화 퍼즐.", "kind": "new" }
```

- `mode`: `coop`(협동) / `pvp`(경쟁) / `both`
- `len`: `short` / `mid` / `long`
- `kind`: `hit`(다들 아는 인기작) / `gem` / `new`
- `price`, `finalPrice`, `discount`, `release`, `header`는 스크립트가 덮어쓰니 손으로 고칠 필요 없음
- 넣기 싫은 게임은 `data/rejected.json`에 appid를 적으면 다시 후보로 안 올라옵니다
- AI가 자동 추가한 게임은 `"auto": true`가 붙어 있으니 가끔 확인해 주세요

## 알아둘 점

- 스팀은 "최대 몇 명"을 따로 제공하지 않아서 인원 정보는 수동 입력이나 AI 추출에 의존합니다. AI가 틀릴 수 있어요.
- 스팀 API는 요청 제한이 있어서 게임이 수백 개로 늘면 갱신 시간이 길어집니다(게임당 약 1.6초).
- 표지 이미지는 스팀 공식 이미지 서버에서 바로 불러옵니다.
