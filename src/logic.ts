export type Mode = "coop" | "pvp" | "both";
export type Len = "short" | "mid" | "long";
export type Kind = "new" | "gem" | "hit";
export type Disc = "new" | "gem" | "nohit";
export type Ko = "audio" | "text" | "none";

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
  big?: boolean; // 대작 여부를 직접 지정할 때만 씀. 없으면 정가로 판단
  ko?: Ko; // 한국어 지원: audio=음성, text=자막·인터페이스, none=미지원
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
}

export const EMPTY: Query = { players: null, price: null, mode: null, len: null, tags: [], disc: null, ko: null, sale: false, big: false };

export const TAGN: Record<string, string> = {
  party: "파티", funny: "웃김", horror: "공포", chill: "잔잔", shooter: "슈팅", survival: "생존",
  puzzle: "퍼즐", strategy: "전략", deduction: "마피아", fighting: "난투", rpg: "RPG",
  story: "스토리", action: "액션", skill: "실력겜",
};
export const LEN: Record<Len, string> = { short: "한 판 짧음", mid: "한 판 30분 안팎", long: "오래 붙잡는 게임" };

const VIBE: [string, RegExp][] = [
  ["funny", /웃|개그|병맛|빵터|웃기|재밌/], ["party", /파티|미니게임|다같이|다 같이|술/],
  ["horror", /공포|무서|호러|귀신|유령/], ["chill", /힐링|잔잔|편하|여유|느긋|평화/],
  ["shooter", /총|fps|슈팅|사격|배그/i], ["survival", /생존|서바이벌|크래프팅|건축|집 짓/],
  ["puzzle", /퍼즐|머리 ?쓰|두뇌/], ["strategy", /전략|머리싸움|보드게임/],
  ["deduction", /마피아|추리|속이|라이어|거짓말|어몽어스/], ["fighting", /격투|난투|때리|치고받/],
  ["rpg", /rpg|성장|모험|레벨/i], ["story", /스토리|이야기|서사/], ["action", /액션/],
  ["skill", /빡겜|실력|랭크|진지/],
];
const NUMW: Record<string, number> = { 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

export function parse(t: string): Query {
  const r: Query = { ...EMPTY, tags: [] };
  let m = t.match(/(\d+)\s*(명|인|이서)/);
  if (m) r.players = +m[1];
  else if (/혼자/.test(t)) r.players = 1;
  else if ((m = t.match(/(다섯|여섯|일곱|여덟|아홉|둘|셋|넷|두|세|네|열)\s*(명|이서|이)/))) r.players = NUMW[m[1]];

  if (/무료|공짜|돈 ?안|프리/.test(t)) r.price = 0;
  else if ((m = t.match(/(\d+(?:\.\d+)?)\s*만\s*원?/))) r.price = Math.round(parseFloat(m[1]) * 10000);
  else if ((m = t.match(/(\d+)\s*천\s*원?/))) r.price = +m[1] * 1000;
  else if ((m = t.match(/(\d{4,6})\s*원/))) r.price = +m[1];
  else if (/싼|저렴|부담 ?없/.test(t)) r.price = 15000;

  const pvp = /경쟁|대결|대전|pvp|싸우|이기는|배틀|붙는|겨루/i.test(t);
  const coop = /협동|같이 깨|힘 ?합|coop|협력|팀으로/i.test(t);
  if (pvp && !coop) r.mode = "pvp"; else if (coop && !pvp) r.mode = "coop";
  if (/짧|한 ?판|가볍|잠깐/.test(t)) r.len = "short"; else if (/오래|장기|길게|꾸준/.test(t)) r.len = "long";
  if (/신작|새로 나온|최신|요즘 나온/.test(t)) r.disc = "new";
  else if (/숨은|원석|안 ?유명|모르는|마이너|덜 알려/.test(t)) r.disc = "nohit";
  if (/한국어|한글|더빙/.test(t)) r.ko = "text";
  if (/할인|세일/.test(t)) r.sale = true;
  if (/대작|aaa|트리플 ?a/i.test(t)) r.big = true;
  for (const [k, re] of VIBE) if (re.test(t)) r.tags.push(k);
  if (r.tags.includes("deduction") && !r.mode) r.mode = "pvp";
  return r;
}

/** 유명작(hit)은 그대로. 나머지는 출시 1년 이내면 신작, 아니면 숨은 명작 */
export function kindOf(g: Game, today = new Date()): Kind {
  if (g.kind === "hit") return "hit"; // 유명작은 출시일과 상관없이 유명작
  if (g.release) {
    const days = (today.getTime() - new Date(g.release).getTime()) / 86400000;
    if (days <= 365) return "new";
    return "gem";
  }
  return g.kind;
}
export const nowPrice = (g: Game) => g.finalPrice ?? g.price;
export const onSale = (g: Game) => !!g.discount && g.finalPrice !== undefined;

/** 본편 정가가 이 금액 이상이면 대작으로 봄. 대작은 "대작 포함"을 켰을 때만 추천에 나옴 */
export const BIG_PRICE = 50000;
export const isBig = (g: Game) => g.big ?? g.price >= BIG_PRICE;

export function fits(g: Game, r: Query, relax: boolean): boolean {
  if (r.players && (r.players < g.min || r.players > g.max)) return false;
  if (r.price !== null && nowPrice(g) > r.price * (relax ? 1.5 : 1)) return false;
  const k = kindOf(g);
  if (r.disc === "new" && k !== "new") return false;
  if (r.disc === "gem" && k !== "gem") return false;
  if (r.disc === "nohit" && k === "hit") return false;
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
  const k = kindOf(g);
  if (k === "new") s += 1.5; else if (k === "gem") s += 1;
  if (g.discount) s += r.sale ? g.discount / 20 : 0.5; // 할인만 볼 때는 많이 깎인 순으로
  s += r.price === null ? -nowPrice(g) / 100000 : 0.5;
  return s;
}

export function recommend(all: Game[], r: Query): { list: Game[]; note: string } {
  const games = r.big ? all : all.filter((g) => !isBig(g));
  let pool = games.filter((g) => fits(g, r, false));
  let note = "";
  if (pool.length < 3) {
    pool = games.filter((g) => fits(g, r, true));
    if (pool.length) note = "딱 맞는 게임이 적어서 가격과 모드 조건을 조금 넓혔어요.";
  }
  if (!pool.length) { pool = games.slice(); note = "조건에 맞는 게임이 없어서 전체에서 비슷한 걸 골랐어요."; }
  pool.sort((a, b) => score(b, r) - score(a, r));
  return { list: pool.slice(0, 8), note };
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
  return toParams(q).toString() ? q : null;
}

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
  q.tags.forEach((t) => parts.push(TAGN[t]));
  return parts.join(" · ");
}
