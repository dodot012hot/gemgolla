export type Mode = "coop" | "pvp" | "both" | "solo"; // solo=싱글 게임
export type Len = "short" | "mid" | "long";
export type Kind = "new" | "gem" | "hit";
export type Disc = "new" | "gem" | "nohit";
export type Ko = "audio" | "text" | "none";
/** 따로 모아두는 분류. 없으면 친구랑 하는 멀티 게임(기본 목록)
 *  noinfo=멀티는 되는데 몇 명까지인지 확인 못 한 게임(min·max는 0), single=혼자 하는 게임(1명) */
export type Group = "noinfo" | "single";

export interface Game {
  appid: number;
  name: string;
  min: number;
  max: number;
  mode: Mode;
  price: number; // 스팀 한국 정가(원)
  len: Len;
  tags: string[];
  desc: string;
  kind: Kind; // 수동 분류. hit=다들 아는 인기작
  // 아래는 매일 갱신 스크립트가 채움
  finalPrice?: number; // 할인 적용가
  discount?: number; // 할인율(%)
  release?: string; // YYYY-MM-DD
  header?: string; // 스팀 표지 이미지 URL
  big?: boolean; // 대작 여부를 직접 지정할 때만 씀. 없으면 아래 규칙으로 판단
  publisher?: string; // 배급사 (매일 갱신)
  major?: boolean; // 대형 배급사 게임인지 (매일 갱신)
  reviews?: number; // 스팀 전체 리뷰 수(긍정+부정). 다운로드 수 대신 규모를 가늠하는 용도 (매일 갱신)
  ko?: Ko; // 한국어 지원: audio=음성, text=자막·인터페이스, none=미지원
  group?: Group;
}

export interface Query {
  players: number | null;
  price: number | null;
  mode: "coop" | "pvp" | null;
  len: Len | null;
  tags: string[];
  disc: Disc | null;
  ko: "text" | null; // text=한국어 지원 게임만
  sale: boolean; // 지금 할인 중인 게임만
  big: boolean; // 대작도 포함해서 보기 (기본은 숨김)
  group: Group | null; // null=기본 목록(인원 확인된 멀티 게임), 아니면 그 분류만
}

export const EMPTY: Query = { players: null, price: null, mode: null, len: null, tags: [], disc: null, ko: null, sale: false, big: false, group: null };

export const TAGN: Record<string, string> = {
  party: "파티", funny: "웃김", horror: "공포", chill: "잔잔", shooter: "슈팅", survival: "생존",
  puzzle: "퍼즐", strategy: "전략", deduction: "마피아", fighting: "난투", rpg: "RPG",
  story: "스토리", action: "액션", skill: "실력겜",
};
export const LEN: Record<Len, string> = { short: "한 판 짧음", mid: "한 판 30분 안팎", long: "오래 붙잡는 게임" };

// 분위기 태그: 사람들이 실제로 쓰는 말 → 태그. 다른 단어 속에 섞여 걸리지 않게 일부러 좁게 잡음
// (예: "총 5명"의 총, "기술"의 술, "재밌는"은 모든 게임에 붙는 말이라 뺌)
const VIBE: [string, RegExp][] = [
  ["funny", /웃긴|웃기|웃음|개그|병맛|빵터|개웃/],
  ["party", /파티|미니게임|술게임|술겜|술 ?마시|술자리|왁자지껄|시끌벅적/],
  ["horror", /공포|무서|무섭|호러|귀신|유령|깜놀|소름/],
  ["chill", /힐링|잔잔|편하|편한|편안|여유|느긋|평화|아늑/],
  ["shooter", /총 ?(?:쏘|게임|겜|싸움|질)|총겜|fps|tps|슈팅|슈터|사격|배그|발로란트|오버워치|카스/i],
  ["survival", /생존|서바이벌|크래프팅|건축|집 ?짓|마크|마인크래프트|샌드박스|좀비/],
  ["puzzle", /퍼즐|머리 ?(?:쓰|굴리)|두뇌|방탈출/],
  ["strategy", /전략|머리싸움|보드게임|턴제|rts|aos|moba|(?:^|[\s,])롤(?=\s|같|처럼|이랑|느낌|$)/i],
  ["deduction", /마피아|추리|속이|라이어|거짓말|어몽어스|눈치/],
  ["fighting", /격투|난투|때리|치고받|대난투/],
  ["rpg", /rpg|롤플레잉|성장|모험|레벨업|던전/i],
  ["story", /스토리|이야기|서사/],
  ["action", /액션/],
  ["skill", /빡겜|빡센|빡세|실력|랭크|진지|어려운|고난도|하드코어|(?:^|[\s,])롤(?=\s|같|처럼|이랑|느낌|$)/i],
];
const NUMW: Record<string, number> = { 혼자: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const NUM = "(\\d+|혼자|다섯|여섯|일곱|여덟|아홉|둘|셋|넷|두|세|네|열)";
const toNum = (x: string) => (/^\d+$/.test(x) ? +x : NUMW[x]);

/** 어떤 말이 문장에 "부정 없이" 나왔는지. "공포 말고", "안 무서운", "무섭지 않은", "무료 아니어도"는 부정으로 봄 */
type Hit = { yes: boolean; no: boolean };
function hit(t: string, re: RegExp): Hit {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const res: Hit = { yes: false, no: false };
  for (const m of t.matchAll(g)) {
    const i = m.index ?? 0;
    const after = t.slice(i + m[0].length, i + m[0].length + 14);
    const before = t.slice(Math.max(0, i - 3), i);
    const negated =
      /^\S{0,4}\s?(?:거|것|게임|겜|류|쪽|장르|건)?\s?(?:말고|말구|빼고|제외|싫|아닌|아니|별로|ㄴㄴ|노노|상관\s?없|안\s?(?:돼|되)|없어도|몰라도)/.test(after) ||
      /^\S{0,3}지\s?(?:않|말)/.test(after) ||
      /안\s?$/.test(before);
    if (negated) res.no = true; else res.yes = true;
  }
  return res;
}

export function parse(t: string): Query {
  const r: Query = { ...EMPTY, tags: [] };
  let m: RegExpMatchArray | null;

  // ── 인원 ──
  // "3~4명"처럼 범위면 큰 쪽. "1인칭/3인칭"은 인원이 아님
  if ((m = t.match(/(\d+)\s*[~\-–,]\s*(\d+)\s*(?:명|인(?!칭))/))) r.players = Math.max(+m[1], +m[2]);
  // "나 포함 넷", "나까지 5명"
  else if ((m = t.match(new RegExp(`(?:나\\s?포함(?:해서)?|나까지|나\\s?빼고\\s?)\\s*${NUM}`)))) {
    r.players = toNum(m[1]) + (/빼고/.test(m[0]) ? 1 : 0);
  }
  // "친구 3명이랑/하고/와" → 나까지 +1
  else if ((m = t.match(new RegExp(`친구(?:들)?\\s*${NUM}\\s*(?:명)?\\s*(?:이랑|랑|하고|과|와|이와|데리고)`)))) r.players = toNum(m[1]) + 1;
  else if ((m = t.match(/(\d+)\s*(?:명|인(?!칭)|이서)/))) r.players = +m[1];
  // "셋이서", "네 명", "둘이" — "세이브", "네이버" 같은 단어에 안 걸리게 뒤를 좁게 봄
  else if ((m = t.match(/(다섯|여섯|일곱|여덟|아홉|둘|셋|넷|두|세|네|열)\s*(?:명|이서|이랑|이(?=\s|$|[,.!?~]))/))) r.players = NUMW[m[1]];
  else if (/혼자/.test(t)) r.players = 1;
  else if (/여친|남친|애인|커플|와이프|남편|여자친구|남자친구/.test(t)) r.players = 2;
  // 혼자 하거나 "싱글 게임"이라고 하면 싱글 분류로
  if (r.players === 1 || hit(t, /싱글|1인용|솔로 ?(?:플레이|게임|겜)/).yes) { r.group = "single"; r.players = 1; }

  // ── 가격 ── (뒤에 "이상/넘어도/부터"가 붙으면 상한이 아니라서 안 걸음)
  const free = hit(t, /무료|공짜|돈 ?안 ?드는|프리 ?투|f2p/i);
  const notCap = (s: string) => /^\s*(?:원)?\s*(?:대\s*)?(?:이상|넘어도|넘는|넘게|부터|초과|이상도)/.test(s);
  if (free.yes) r.price = 0;
  else if ((m = t.match(/(\d+(?:\.\d+)?)\s*만\s*(원)?\s*(대)?/)) && !notCap(t.slice((m.index ?? 0) + m[0].length - (m[3] ? 1 : 0)))) {
    r.price = Math.round(parseFloat(m[1]) * 10000) + (m[3] ? 9999 : 0);
  } else if ((m = t.match(/(\d+)\s*천\s*원?/)) && !notCap(t.slice((m.index ?? 0) + m[0].length))) r.price = +m[1] * 1000;
  else if ((m = t.match(/(\d{4,6})\s*원/)) && !notCap(t.slice((m.index ?? 0) + m[0].length))) r.price = +m[1];
  else if ((m = t.match(/(?:^|[^\d.])만\s*원/)) && !notCap(t.slice((m.index ?? 0) + m[0].length))) r.price = 10000;
  else if (/(?:^|[^비])싼|저렴|부담 ?없|가성비/.test(t)) r.price = 15000;

  // ── 협동 / 경쟁 ── 한쪽을 "말고"로 빼면 반대쪽으로
  const pvp = hit(t, /경쟁|대결|대전|pvp|싸우|이기는|배틀|붙는|붙자|겨루|팀전|\d\s*(?:대|:|vs)\s*\d|vs/i);
  const coop = hit(t, /협동|같이 ?깨|힘 ?합|co-?op|협력|pve/i);
  if (pvp.yes && !coop.yes) r.mode = "pvp";
  else if (coop.yes && !pvp.yes) r.mode = "coop";
  else if (!pvp.yes && !coop.yes) r.mode = pvp.no ? "coop" : coop.no ? "pvp" : null;

  // ── 한 판 길이 ── "30분"처럼 숫자로 말하면 그걸 우선
  if ((m = t.match(/(\d+)\s*분/))) r.len = +m[1] <= 15 ? "short" : "mid";
  else if (/짧|한 ?판|가볍|잠깐/.test(t)) r.len = "short";
  else if (/오래|장기|길게|꾸준|밤새|몇 ?시간/.test(t)) r.len = "long";

  // ── 신작 / 유명작 ──
  const famous = hit(t, /유명|인기 ?(?:있|많)|다 ?아는|국민 ?게임/);
  if (/신작|새로 ?나온|최신|요즘 ?(?:나온|뜨는|핫|유행)|최근(?:에)? ?나온|나온 ?지 ?얼마/.test(t)) r.disc = "new";
  else if (famous.no || /숨은|원석|안 ?유명|모르는|마이너|덜 ?알려/.test(t)) r.disc = "nohit";

  if (hit(t, /한국어|한글|더빙|자막/).yes) r.ko = "text";
  if (hit(t, /할인|세일/).yes) r.sale = true;
  if (hit(t, /대작|aaa|트리플 ?a/i).yes) r.big = true;

  for (const [k, re] of VIBE) if (hit(t, re).yes && !r.tags.includes(k)) r.tags.push(k);
  if (r.tags.includes("deduction") && !r.mode) r.mode = "pvp";
  return r;
}

/** 신작: 출시 1년 이내. 출시일을 아직 모르면 직접 정해둔 분류(kind)를 따름 */
export function isNew(g: Game): boolean {
  if (g.release) return (Date.now() - new Date(g.release).getTime()) / 86400000 <= 365;
  return g.kind === "new";
}

/** 유명작: 스팀 리뷰 3만 개 이상이거나 대형 배급사 게임. 신작이어도 유명작일 수 있음.
 *  무료 게임은 리뷰 수가 부정확해서(실제보다 훨씬 적게 나옴) 직접 정해둔 분류와 배급사만 봄 */
export const HIT_REVIEWS = 30000;
export function isHit(g: Game): boolean {
  if (g.kind === "hit" || g.major === true) return true;
  return g.price > 0 && (g.reviews ?? 0) >= HIT_REVIEWS;
}

/** 숨은 명작: 신작도 유명작도 아닌 게임 */
export const isGem = (g: Game) => !isNew(g) && !isHit(g);

/** 카드 배지용: 신작이면 "신작", 아니면 숨은 명작/유명작 */
export function kindOf(g: Game): Kind {
  if (isNew(g)) return "new";
  return isHit(g) ? "hit" : "gem";
}
export const nowPrice = (g: Game) => g.finalPrice ?? g.price;
export const onSale = (g: Game) => !!g.discount && g.finalPrice !== undefined;

/** 대작 판단 순서 (대작은 "대작 포함"을 켰을 때만 추천에 나옴)
 *  1. games.json에 "big"을 직접 적었으면 그대로
 *  2. 무료 게임은 부담이 없으니 대작에서 제외
 *  3. 리뷰 수(긍정+부정)가 있으면 그걸로만 판단: BIG_REVIEWS 이상이면 대작
 *  4. 리뷰 수가 아직 없는 새 게임은 대형 배급사 게임이면 대작
 *  가격은 보지 않음: 비싸서 못 사는 경우도 있으니 비싼 게임도 기본 추천에 나오게 함 */
export const BIG_REVIEWS = 100000;
export function isBig(g: Game): boolean {
  if (g.big !== undefined) return g.big;
  if (g.price === 0) return false;
  if (g.reviews !== undefined) return g.reviews >= BIG_REVIEWS;
  return g.major === true;
}

export function fits(g: Game, r: Query, relax: boolean): boolean {
  // 인원 정보 없는 게임은 인원으로 거르지 않음 (몇 명까지인지 모르니까)
  if (r.players && g.group !== "noinfo" && (r.players < g.min || r.players > g.max)) return false;
  if (r.price !== null && nowPrice(g) > r.price * (relax ? 1.5 : 1)) return false;
  if (r.disc === "new" && !isNew(g)) return false;
  if (r.disc === "gem" && !isGem(g)) return false;
  if (r.disc === "nohit" && isHit(g)) return false;
  // 스팀의 "음성 지원" 표시는 개발사 자체 체크라 부정확해서, 음성/자막 구분 없이 한국어 지원 여부만 봄
  if (r.ko === "text" && g.ko !== "audio" && g.ko !== "text") return false;
  if (r.sale && !onSale(g)) return false;
  if (relax) return true;
  if (r.mode && !(g.mode === r.mode || g.mode === "both")) return false;
  if (r.len && g.len !== r.len) return false;
  if (r.tags.length && !r.tags.some((t) => g.tags.includes(t))) return false;
  return true;
}

export function score(g: Game, r: Query): number {
  let s = 0;
  if (r.mode && (g.mode === r.mode || g.mode === "both")) s += 4;
  for (const t of r.tags) if (g.tags.includes(t)) s += 3;
  if (r.len && g.len === r.len) s += 2;
  if (r.players && g.max === r.players) s += 1;
  if (isNew(g)) s += 1.5; else if (isGem(g)) s += 1;
  if (isHit(g)) s -= 0.5; // 같은 조건이면 덜 알려진 게임을 먼저
  if (g.discount) s += r.sale ? g.discount / 20 : 0.5; // 할인만 볼 때는 많이 깎인 순으로
  s += r.price === null ? -nowPrice(g) / 100000 : 0.5;
  return s;
}

/** 지금 고른 분류(기본/인원 정보 없음/싱글)에 속하는 게임인지 */
export const inGroup = (g: Game, group: Group | null) => (g.group ?? null) === group;

export function recommend(all: Game[], r: Query): { list: Game[]; note: string } {
  const games = all.filter((g) => inGroup(g, r.group) && (r.big || !isBig(g)));
  let pool = games.filter((g) => fits(g, r, false));
  let note = "";
  if (pool.length < 3) {
    pool = games.filter((g) => fits(g, r, true));
    if (pool.length) note = "딱 맞는 게임이 적어서 가격과 모드 조건을 조금 넓혔어요.";
  }
  if (!pool.length) { pool = games.slice(); note = "조건에 맞는 게임이 없어서 전체에서 비슷한 걸 골랐어요."; }
  pool.sort((a, b) => score(b, r) - score(a, r));
  return { list: pool, note }; // 전부 돌려주고 화면에서 페이지로 나눠 보여줌
}

/** 결과 정렬. "rec"은 추천 점수 순(recommend가 이미 정렬해서 그대로) */
export type SortKey = "rec" | "price" | "sale" | "reviews" | "new";
export const SORTS: [SortKey, string][] = [
  ["rec", "추천순"], ["price", "가격 낮은 순"], ["sale", "할인 많은 순"], ["reviews", "리뷰 많은 순"], ["new", "최신 출시순"],
];
export function sortGames(list: Game[], key: SortKey): Game[] {
  if (key === "rec") return list;
  const out = list.slice(); // 같은 값이면 추천순을 유지 (sort는 안정 정렬)
  if (key === "price") out.sort((a, b) => nowPrice(a) - nowPrice(b));
  if (key === "sale") out.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0));
  if (key === "reviews") out.sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1));
  if (key === "new") out.sort((a, b) => (b.release ?? "").localeCompare(a.release ?? ""));
  return out;
}

export const won = (n: number) => (n === 0 ? "무료" : n.toLocaleString("ko-KR") + "원");
export const headerUrl = (g: Game) =>
  g.header ?? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`;

// ── 링크 공유: 조건을 주소(?p=3&m=pvp...)에 담고 다시 읽기 ──
const MODES = ["coop", "pvp"], LENS = ["short", "mid", "long"], DISCS = ["new", "gem", "nohit"];

export function toParams(q: Query): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.players) sp.set("p", String(q.players));
  if (q.price !== null) sp.set("c", String(q.price));
  if (q.mode) sp.set("m", q.mode);
  if (q.len) sp.set("l", q.len);
  if (q.disc) sp.set("d", q.disc);
  if (q.tags.length) sp.set("t", q.tags.join(","));
  if (q.ko) sp.set("k", "1");
  if (q.sale) sp.set("s", "1");
  if (q.big) sp.set("b", "1");
  if (q.group) sp.set("g", q.group);
  return sp;
}

/** 주소에 조건이 하나도 없으면 null. 이상한 값은 무시 */
export function fromParams(sp: URLSearchParams): Query | null {
  const q: Query = { ...EMPTY, tags: [] };
  const n = (v: string | null) => (v !== null && /^\d{1,6}$/.test(v) ? +v : null);
  const p = n(sp.get("p")); if (p && p <= 100) q.players = p;
  q.price = n(sp.get("c"));
  const m = sp.get("m"); if (m && MODES.includes(m)) q.mode = m as Query["mode"];
  const l = sp.get("l"); if (l && LENS.includes(l)) q.len = l as Len;
  const d = sp.get("d"); if (d && DISCS.includes(d)) q.disc = d as Disc;
  q.tags = (sp.get("t") ?? "").split(",").filter((t) => t in TAGN);
  if (sp.get("k") === "1") q.ko = "text";
  if (sp.get("s") === "1") q.sale = true;
  if (sp.get("b") === "1") q.big = true;
  const g = sp.get("g"); if (g === "noinfo" || g === "single") q.group = g;
  return toParams(q).toString() ? q : null;
}

export const GROUPN: Record<Group, string> = { noinfo: "인원 정보 없음", single: "싱글" };
const DISCN: Record<Disc, string> = { new: "신작", gem: "숨은 명작", nohit: "유명작 빼고" };
const LENN: Record<Len, string> = { short: "짧게", mid: "30분 안팎", long: "오래" };
/** "3명 · 경쟁 · 2만원 이하" 같은 한 줄 요약. 조건이 없으면 빈 문자열 */
export function summary(q: Query): string {
  const parts: string[] = [];
  if (q.players) parts.push(`${q.players}명`);
  if (q.mode) parts.push(q.mode === "pvp" ? "경쟁" : "협동");
  if (q.price !== null) parts.push(q.price === 0 ? "무료" : `${won(q.price)} 이하`);
  if (q.sale) parts.push("할인 중");
  if (q.len) parts.push(LENN[q.len]);
  if (q.disc) parts.push(DISCN[q.disc]);
  if (q.ko) parts.push("한국어");
  if (q.big) parts.push("대작 포함");
  if (q.group) parts.push(GROUPN[q.group]);
  q.tags.forEach((t) => parts.push(TAGN[t]));
  return parts.join(" · ");
}
