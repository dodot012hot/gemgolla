// 매일 실행: 스팀에서 가격·할인·출시일·표지를 갱신하고, 새 협동/파티 게임 후보를 찾는다.
// ANTHROPIC_API_KEY가 있으면 하루 최대 50개까지 새 게임 설명을 AI로 읽어서 인원·모드·태그를 뽑아 바로 추가하고,
// 없으면 data/candidates.json에만 적어둔다(직접 검토 후 추가).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const GAMES = "public/games.json";
const CANDIDATES = "data/candidates.json";
const REJECTED = "data/rejected.json"; // 추가하지 않을 appid 목록(직접 관리)
const DELAY = Number(process.env.STEAM_DELAY ?? 1600); // 스팀 appdetails 요청 제한(대략 5분 200회) 아래로 유지
const NEW_PER_RUN = 50; // 하루에 새로 추가할 게임 수
const MAX_CHECK_PER_RUN = 200; // 하루에 확인해볼 새 게임 수 상한 (DLC·싱글 게임 등은 걸러지니 넉넉히)
const SKIPPED = "data/skipped.json"; // 자동으로 걸러낸 게임 {appid: 이유}. 다시 확인하지 않음
const RETRY_DAYS = 7; // 출시 전이라 못 넣은 후보는 이 간격으로 다시 확인
const TAGS = ["party","funny","horror","chill","shooter","survival","puzzle","strategy","deduction","fighting","rpg","story","action","skill"];
// 새 게임을 찾을 스팀 검색: 온라인 협동(3843)·파티(7178)·멀티플레이어(3859)·PvP(1775) 태그의 인기 신작 → 인기 판매작 순
const DISCOVER_TAGS = [3843, 7178, 3859, 1775];
const DISCOVER_FILTERS = ["popularnew", "topsellers"];
const DISCOVER_PAGES = 5; // 페이지당 100개

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } };

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "Accept-Language": "ko-KR,ko;q=0.9" } });
    if (res.status === 429 || res.status >= 500) { await sleep(30000 * (i + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`요청 실패: ${url}`);
}

async function appDetails(appid, lang = "english") {
  const d = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=kr&l=${lang}`);
  const e = d?.[appid];
  return e?.success ? e.data : null;
}

/** "20 Oct, 2026" / "Oct 20, 2026" → "2026-10-20". 못 읽으면 undefined */
export function toIsoDate(s) {
  if (!s) return undefined;
  const t = Date.parse(s.replace(",", ""));
  if (Number.isNaN(t)) return undefined;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 스팀 supported_languages(HTML 문자열)에서 한국어 지원 수준을 읽음.
 *  "audio"=한국어 음성, "text"=한국어 자막/인터페이스, "none"=미지원. 정보가 없으면 undefined */
export function koSupport(langs) {
  if (typeof langs !== "string" || !langs.trim()) return undefined;
  const items = langs.split(/<br\s*\/?>/i)[0].split(",");
  const ko = items.find((x) => /korean|한국어/i.test(x.replace(/<[^>]+>/g, "")));
  if (!ko) return "none";
  return /<strong>\*<\/strong>|\*/.test(ko) ? "audio" : "text";
}

const wonOf = (txt) => { const d = String(txt ?? "").replace(/[^\d]/g, ""); return d ? +d : undefined; };
const norm = (t) => String(t ?? "").toLowerCase().replace(/[™®©:]/g, "").replace(/\s+/g, " ").trim();
const optionName = (sub) => String(sub.option_text ?? "").replace(/<[^>]+>/g, "").split(" - ").slice(0, -1).join(" - ");

/** 가격을 원 단위로 정리. 항상 "본편만" 가격을 씀.
 *  스팀 price_overview는 지금 가장 싼 구매 옵션을 주는데, 그게 DLC 포함 에디션 할인가이거나
 *  (예: Overcooked! 2 Gourmet Edition) PC방용 Commercial License일 수 있음.
 *  그래서 구매 옵션 중 이름이 게임 이름과 똑같은 것(=본편)을 찾아 그 가격을 씀. 없으면 price_overview */
export function priceFields(data) {
  if (data.is_free) return { price: 0, finalPrice: undefined, discount: undefined };
  const p = data.price_overview;
  if (!p || p.currency !== "KRW") return null;
  let initial = Math.round(p.initial / 100), final = Math.round(p.final / 100), pct = p.discount_percent;

  const subs = (data.package_groups ?? []).filter((g) => g.name === "default").flatMap((g) => g.subs ?? []);
  const base = subs.find((x) => !x.is_free_license && x.price_in_cents_with_discount > 0 && norm(optionName(x)) === norm(data.name));
  if (base) {
    final = Math.round(base.price_in_cents_with_discount / 100);
    const orig = wonOf(String(base.option_text ?? "").match(/discount_original_price[^>]*>([^<]+)</)?.[1]);
    initial = orig && orig > final ? orig : final;
    pct = initial > final ? (Number(base.percent_savings) || Math.round((1 - final / initial) * 100)) : 0;
  }
  return pct > 0 && initial > final
    ? { price: initial, finalPrice: final, discount: pct }
    : { price: initial, finalPrice: undefined, discount: undefined };
}

// 이 배급사 게임은 가격과 상관없이 대작으로 봄(무료 게임 제외). 인디도 많이 내는 KRAFTON·NetEase·Valve 등은 일부러 뺌
const MAJOR_PUBLISHERS = [
  "electronic arts", "ubisoft", "capcom", "activision", "blizzard", "sony interactive", "playstation",
  "xbox game studios", "microsoft", "bethesda", "bandai namco", "sega", "square enix", "2k", "rockstar",
  "take-two", "warner bros", "konami", "koei tecmo", "ncsoft",
];
export function isMajorPublisher(publishers) {
  return (publishers ?? []).some((p) => {
    const n = norm(p);
    return MAJOR_PUBLISHERS.some((m) => n === m || n.startsWith(m + " ") || n.includes(" " + m + " ") || n.endsWith(" " + m));
  });
}

/** 다운로드 수는 스팀이 공개하지 않아서, 대신 게임 정보에 들어 있는 전체 리뷰 수를 씀. 많을수록 대작으로 봄.
 *  (스팀 리뷰 API는 GitHub 서버에서 부르면 데이터 대신 웹페이지를 돌려줘서 못 씀. 무료 게임은 이 값이 부정확함) */
const reviewsOf = (data) => { const n = Number(data?.recommendations?.total); return Number.isFinite(n) && n >= 0 ? n : undefined; };

async function refresh(games) {
  let ok = 0, fail = 0, rv = 0;
  for (const g of games) {
    try {
      const data = await appDetails(g.appid);
      if (!data) { fail++; continue; }
      const pf = priceFields(data);
      if (pf) Object.assign(g, pf);
      const rel = data.release_date;
      if (rel && !rel.coming_soon) g.release = toIsoDate(rel.date) ?? g.release;
      if (data.header_image) g.header = data.header_image.split("?")[0];
      if (Array.isArray(data.publishers)) { g.publisher = data.publishers[0]; g.major = isMajorPublisher(data.publishers); }
      const n = reviewsOf(data); if (n !== undefined) { g.reviews = n; rv++; }
      const ko = koSupport(data.supported_languages);
      if (ko) g.ko = ko;
      for (const k of ["finalPrice", "discount"]) if (g[k] === undefined) delete g[k];
      ok++;
    } catch (err) { fail++; console.warn("갱신 실패", g.name, err.message); }
    await sleep(DELAY);
  }
  const msg = `가격 갱신 성공 ${ok}, 실패 ${fail} · 리뷰 수 받은 게임 ${rv}개`;
  console.log(msg);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=갱신 요약::${msg}`); // Actions 실행 화면에 요약으로 표시
}

async function* discover(known) {
  const seen = new Set();
  for (const filter of DISCOVER_FILTERS) {
    for (let page = 0; page < DISCOVER_PAGES; page++) {
      for (const tag of DISCOVER_TAGS) {
        const url = `https://store.steampowered.com/search/results/?tags=${tag}&filter=${filter}&cc=kr&json=1&count=100&start=${page * 100}`;
        try {
          const d = await getJson(url);
          for (const it of d.items ?? []) {
            const m = String(it.logo ?? "").match(/\/apps\/(\d+)\//);
            const id = m ? +m[1] : 0;
            if (id && !known.has(id) && !seen.has(id)) { seen.add(id); yield id; }
          }
        } catch (err) { console.warn("신작 목록 실패", err.message); }
        await sleep(DELAY);
      }
    }
  }
}

/** 후보 게임을 사람(또는 Claude)이 보고 정리할 수 있게 판단 재료를 모아둠 */
export function detailOf(data, pf) {
  const strip = (h) => String(h ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return {
    short: strip(data.short_description),
    text: strip(data.detailed_description).slice(0, 1500),
    cats: (data.categories ?? []).map((c) => c.description),
    genres: (data.genres ?? []).map((g) => g.description),
    ...(pf ?? {}), release: toIsoDate(data.release_date?.date), header: data.header_image?.split("?")[0],
    ko: koSupport(data.supported_languages), publisher: data.publishers?.[0], major: isMajorPublisher(data.publishers),
    reviews: reviewsOf(data),
  };
}

// 온라인으로 같이 할 수 있는 게임인지: 멀티플레이어(1)·온라인 PvP(36)·온라인 협동(38)·크로스플랫폼 멀티(27)
const ONLINE_CATEGORIES = new Set([1, 27, 36, 38]);
const isOnlineMulti = (data) => (data.categories ?? []).some((c) => ONLINE_CATEGORIES.has(Number(c.id)));

async function classify(data) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const text = `${data.name}\n${(data.short_description ?? "")}\n${(data.detailed_description ?? "").replace(/<[^>]+>/g, " ").slice(0, 6000)}\n카테고리: ${(data.categories ?? []).map((c) => c.description).join(", ")}`;
  const prompt = `다음은 스팀 게임 상점 설명이다. 친구들과 온라인으로 같이 하는 게임 추천 앱에 넣을 정보를 JSON 하나로만 답해라.
온라인 최대 인원은 설명이나 카테고리에서 확인되는 값만 써라. 어디에도 인원이 없으면 지어내지 말고 multiplayer를 false로 해라.
{"multiplayer": boolean, "min": 정수, "max": 정수, "mode": "coop"|"pvp"|"both", "len": "short"|"mid"|"long", "tags": [${TAGS.map((t) => `"${t}"`).join(",")} 중 1~3개], "desc": "한국어 한 문장, 40자 안팎, 홍보 문구 말고 무엇을 하는 게임인지"}

${text}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) { console.warn("AI 분류 실패", res.status, await res.text()); return null; }
  const out = await res.json();
  const raw = out.content?.find((c) => c.type === "text")?.text ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  return validate(JSON.parse(m[0]));
}

/** AI 응답이 앱에서 쓸 수 있는 형태인지 확인. 아니면 null */
export function validate(c) {
  if (!c || c.multiplayer !== true) return null;
  const min = Math.round(c.min), max = Math.round(c.max);
  if (!(min >= 1 && max >= 2 && max >= min && max <= 100)) return null;
  if (!["coop", "pvp", "both"].includes(c.mode) || !["short", "mid", "long"].includes(c.len)) return null;
  const tags = (Array.isArray(c.tags) ? c.tags : []).filter((t) => TAGS.includes(t)).slice(0, 3);
  if (!tags.length || typeof c.desc !== "string" || c.desc.length < 5) return null;
  return { min, max, mode: c.mode, len: c.len, tags, desc: c.desc.trim() };
}

export async function main() {
  const db = await readJson(GAMES, null);
  if (!db?.games?.length) throw new Error(`${GAMES}를 읽지 못함`);
  const rejected = new Set(await readJson(REJECTED, []));
  const skipped = await readJson(SKIPPED, {});
  let candidates = await readJson(CANDIDATES, []);
  const hasAI = !!process.env.ANTHROPIC_API_KEY;
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // KST 날짜
  const daysSince = (d) => (Date.parse(today) - Date.parse(d ?? "2000-01-01")) / 86400000;

  await refresh(db.games);

  // 확인할 순서: 기다리던 후보(마지막 확인 후 RETRY_DAYS 지난 것) → 새로 찾은 게임
  const inDb = new Set(db.games.map((g) => g.appid));
  const known = new Set([...inDb, ...rejected, ...Object.keys(skipped).map(Number), ...candidates.map((c) => c.appid)]);
  // AI 키가 없어서 못 넣었던 후보는 바로, 출시 전이라 기다리던 후보는 RETRY_DAYS마다 다시 확인
  const waitingForSort = (c) => !c.why || c.why === "AI 키 없음" || c.why === "정리 대기";
  const retry = candidates
    .filter((c) => (hasAI ? waitingForSort(c) : !c.info) || daysSince(c.tried ?? c.found) >= RETRY_DAYS)
    .map((c) => c.appid);
  async function* queue() { yield* retry; yield* discover(known); }

  let added = 0, checked = 0, newSkipped = 0, waiting = 0;
  const byId = new Map(candidates.map((c) => [c.appid, c]));
  const dropCandidate = (appid) => { candidates = candidates.filter((c) => c.appid !== appid); byId.delete(appid); };
  const keepCandidate = (appid, name, why, data, pf) => {
    const c = byId.get(appid) ?? { appid, name, url: `https://store.steampowered.com/app/${appid}/`, found: today };
    c.name = name; c.tried = today; c.why = why;
    if (data) c.info = detailOf(data, pf);
    if (!byId.has(appid)) { byId.set(appid, c); candidates.push(c); }
    waiting++;
  };
  const skip = (appid, why) => { skipped[appid] = why; dropCandidate(appid); newSkipped++; };

  for await (const appid of queue()) {
    if (added >= NEW_PER_RUN || checked >= MAX_CHECK_PER_RUN) break;
    if (inDb.has(appid)) continue;
    checked++;
    try {
      const data = await appDetails(appid, "koreana");
      await sleep(DELAY);
      if (!data) { skip(appid, "정보 없음"); continue; }
      if (data.type !== "game") { skip(appid, "게임 아님"); continue; }
      if (!isOnlineMulti(data)) { skip(appid, "온라인 멀티 없음"); continue; }
      const pf = priceFields(data);
      const rel = data.release_date;
      if (!pf || rel?.coming_soon) { keepCandidate(appid, data.name, "출시 전 또는 가격 없음", data, pf); continue; }
      if (!hasAI) { keepCandidate(appid, data.name, "정리 대기", data, pf); continue; }
      const info = await classify(data);
      if (!info) { skip(appid, "인원 정보 없음"); continue; }
      db.games.push({
        appid, name: data.name, ...info, price: pf.price,
        ...(pf.discount ? { finalPrice: pf.finalPrice, discount: pf.discount } : {}),
        kind: "gem", release: toIsoDate(rel?.date),
        header: data.header_image?.split("?")[0], ko: koSupport(data.supported_languages),
        publisher: data.publishers?.[0], major: isMajorPublisher(data.publishers), reviews: reviewsOf(data),
        auto: true, added: today,
      });
      inDb.add(appid); dropCandidate(appid);
      added++;
    } catch (err) { console.warn("후보 처리 실패", appid, err.message); }
  }

  db.updatedAt = today;
  await writeFile(GAMES, JSON.stringify(db, null, 1) + "\n");
  await mkdir("data", { recursive: true });
  await writeFile(CANDIDATES, JSON.stringify(candidates, null, 1) + "\n");
  await writeFile(SKIPPED, JSON.stringify(skipped, null, 1) + "\n");
  const msg = `새 게임 ${checked}개 확인 → 자동 추가 ${added}개, 대기 ${waiting}개, 제외 ${newSkipped}개 · 전체 ${db.games.length}개${hasAI ? "" : " · AI 키 없음: 후보는 정리 대기로 저장"}`;
  console.log(msg);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=새 게임 추가::${msg}`);
}

if (process.argv[1]?.endsWith("update-games.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
