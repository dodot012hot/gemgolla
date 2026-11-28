import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY, GROUPN, LEN, TAGN, type Game, type Group, type Query, type Disc, type Len,
  fromParams, headerUrl, inGroup, isBig, kindOf, onSale, parse, recommend, summary, toParams, won,
  SORTS, sortGames, type SortKey,
} from "./logic";

const EXAMPLES = [
  "3명이서 할 신작 협동", "유명한 거 말고 4명 공포", "둘이서 할 스토리 협동 게임",
  "4명이서 무서운 거 2만원 이하", "할인 중인 4명 협동", "한국어 되는 2인 협동", "친구 5명 무료로 웃긴 거", "6명 마피아 게임",
];
const PRICES = [["", "상관없음"], ["0", "무료만"], ["5000", "5천원 이하"], ["10000", "1만원 이하"],
  ["20000", "2만원 이하"], ["30000", "3만원 이하"], ["50000", "5만원 이하"]];
const PLACEHOLDER = "EX: 친구 3명이서 할 건데 경쟁 게임이면 좋겠어";

function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T | null; options: [T | "", string][]; onChange: (v: T | null) => void;
}) {
  return (
    <div className="frow" role="radiogroup" aria-label={label}>
      <span className="lab">{label}</span>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" className="seg" aria-checked={(value ?? "") === v}
          onClick={() => onChange((v || null) as T | null)}>{text}</button>
      ))}
    </div>
  );
}

function Card({ g, want }: { g: Game; want: number }) {
  const [imgOk, setImgOk] = useState(true);
  const k = kindOf(g);
  const slots = Math.min(g.max, 8);
  const hasSale = !!g.discount && g.finalPrice !== undefined;
  const url = `https://store.steampowered.com/app/${g.appid}/`;
  const noinfo = g.group === "noinfo";
  const people = g.mode === "solo" ? "싱글" : noinfo ? "인원 정보 없음" : g.min === g.max ? `${g.max}명 전용` : `${g.min}~${g.max}명`;
  const chips = [people,
    ...(g.mode === "solo" ? [] : [g.mode === "pvp" ? "경쟁" : g.mode === "coop" ? "협동" : "협동+대전"]),
    LEN[g.len], ...g.tags.slice(0, 3).map((t) => TAGN[t])];
  return (
    <li className="card">
      <a className="cover" href={url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        {imgOk
          ? <img src={headerUrl(g)} alt="" loading="lazy" onError={() => setImgOk(false)} />
          : <span className="noimg">{g.name}</span>}
        {k === "new" && <span className="badge new">신작</span>}
        {k === "gem" && <span className="badge gem">숨은 명작</span>}
        {isBig(g) && <span className="badge big">대작</span>}
      </a>
      <div className="body">
        <div className="top">
          <h2><a href={url} target="_blank" rel="noopener noreferrer">{g.name}</a></h2>
          <div className={"price" + (hasSale ? " sale-on" : "")}>
            {hasSale && <span className="sale">-{g.discount}%</span>}
            <span className="amt">
              {hasSale && <s>{won(g.price)}</s>}
              <b>{won(hasSale ? g.finalPrice! : g.price)}</b>
            </span>
          </div>
        </div>
        {!noinfo && <div className="slots" aria-label={g.mode === "solo" ? "혼자 하는 게임" : `${g.min}명부터 ${g.max}명까지`}>
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className={"s" + (i < want ? " on" : "")}>{i + 1}</span>
          ))}
          {g.max > 8 && <span className="cap">최대 {g.max}명</span>}
          {g.mode === "solo" && <span className="cap">싱글</span>}
        </div>}
        <p className="desc">{g.desc}</p>
        <div className="tags">
          {(g.ko === "audio" || g.ko === "text") && <span className="ko">한국어</span>}
          {g.ko === "none" && <span className="ko-no">한국어 미지원</span>}
          {chips.map((c) => <span key={c}>{c}</span>)}
        </div>
      </div>
    </li>
  );
}

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [error, setError] = useState("");
  const [shared] = useState(() => fromParams(new URLSearchParams(window.location.search)));
  const [text, setText] = useState("");
  const [q, setQ] = useState<Query>(() => shared ?? { ...EMPTY, tags: [] });
  const [hint, setHint] = useState(shared ? "친구가 공유한 조건이에요. 바꿔도 돼요." : "말로 물어보거나 아래에서 직접 골라 보세요.");
  const [shareMsg, setShareMsg] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // PC에서는 들어오자마자 바로 입력할 수 있게 커서를 둠 (폰은 키보드가 튀어나와서 제외)
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  // 조건이 바뀔 때마다 주소에도 반영해서, 지금 주소를 그대로 보내도 같은 목록이 보이게 함
  useEffect(() => {
    const sp = toParams(q).toString();
    window.history.replaceState(null, "", sp ? `?${sp}` : window.location.pathname);
  }, [q]);

  const share = async () => {
    const url = window.location.href;
    const title = `겜골라 · ${summary(q) || "친구랑 할 게임"}`;
    // 폰에서는 카톡 등으로 바로 보내는 공유창을 띄움
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title, text: title, url }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("링크를 복사했어요. 단톡방에 붙여넣으면 친구도 같은 목록을 봐요.");
    } catch {
      setShareMsg(`복사가 안 돼서 주소를 직접 복사해 주세요: ${url}`);
    }
    window.setTimeout(() => setShareMsg(""), 5000);
  };

  useEffect(() => {
    fetch("/games.json")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setGames(d.games); setUpdatedAt(d.updatedAt); })
      .catch(() => setError("게임 목록을 불러오지 못했어요. 새로고침해 주세요."));
  }, []);

  const result = useMemo(() => recommend(games, q), [games, q]);

  // 페이지 나누기: 한 페이지에 12개 (3열 4줄). 조건이 바뀌면 1페이지로
  const [sortKey, setSortKey] = useState<SortKey>("rec");
  const sorted = useMemo(() => sortGames(result.list, sortKey), [result, sortKey]);
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const shown = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const resultsTop = useRef<HTMLDivElement>(null);
  useEffect(() => { setPage(1); }, [q, games, sortKey]);

  // "아무거나 골라줘": 지금 결과 중 하나를 랜덤으로. 다시 누르면 방금 것과 다른 게임
  const [pick, setPick] = useState<Game | null>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setPick(null); }, [q, games]);
  const pickRandom = () => {
    const pool = result.list.length > 1 && pick ? result.list.filter((g) => g.appid !== pick.appid) : result.list;
    if (!pool.length) return;
    setPick(pool[Math.floor(Math.random() * pool.length)]);
    window.setTimeout(() => pickRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const goPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), pageCount));
    resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // 페이지 번호는 현재 페이지 주변만: 1 … 4 5 [6] 7 8 … 20
  const pageNums = useMemo(() => {
    const nums = new Set([1, pageCount]);
    for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= pageCount) nums.add(p);
    return [...nums].sort((a, b) => a - b);
  }, [page, pageCount]);
  const saleCount = useMemo(() => games.filter((g) => inGroup(g, q.group) && onSale(g) && (q.big || !isBig(g))).length, [games, q.big, q.group]);
  const bigCount = useMemo(() => games.filter((g) => inGroup(g, q.group) && isBig(g)).length, [games, q.group]);
  // 목록 옆 숫자는 지금 실제로 보이는 개수 (대작 포함을 안 켰으면 대작은 빼고 셈)
  const groupCount = (gr: Group | null) => games.filter((g) => inGroup(g, gr) && (q.big || !isBig(g))).length;
  // 대작이라 숨겨져서 결과가 비었을 때 안내용
  const hiddenBig = q.big ? 0 : games.filter((g) => inGroup(g, q.group) && isBig(g)).length;

  const ask = (t: string) => {
    const r = parse(t);
    const any = r.players || r.price !== null || r.mode || r.len || r.tags.length || r.disc || r.ko || r.sale || r.big || r.group;
    setHint(any ? "문장에서 읽은 조건을 채웠어요. 직접 바꿔도 돼요." : "조건을 못 찾았어요. 아래에서 직접 골라 주세요.");
    setQ(r);
  };
  const edit = (patch: Partial<Query>) => { setHint("필터"); setQ((p) => ({ ...p, ...patch })); };
  const priceOpts = q.price !== null && !PRICES.some(([v]) => v === String(q.price))
    ? [...PRICES, [String(q.price), won(q.price) + " 이하"]] : PRICES;
  const playerOpts = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16];
  if (q.players && !playerOpts.includes(q.players)) playerOpts.push(q.players);

  return (
    <div className="wrap">
      <header>
        <h1>겜<span>골라</span></h1>
        <p>누구랑, 몇 명이서, 얼마까지. 편하게 말하면 맞는 게임을 골라줘요.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label htmlFor="q">어떤 게임을 원하나요?</label>
        <div className="ask">
          <textarea id="q" ref={inputRef} rows={1} placeholder={PLACEHOLDER} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(text); }
            }} />
          <button className="go" type="submit">골라줘</button>
        </div>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="ex" onClick={() => { setText(ex); ask(ex); }}>{ex}</button>
          ))}
        </div>
      </form>

      <section className="filters" aria-label="필터">
        <div className="fhead">
          <span>{hint}</span>
          <button type="button" className="reset" onClick={() => { setText(""); setHint("필터"); setQ({ ...EMPTY, tags: [] }); }}>초기화</button>
        </div>
        <div className="frow">
          <label htmlFor="fp">인원</label>
          <select id="fp" value={q.players ?? ""} onChange={(e) => edit({ players: e.target.value ? +e.target.value : null })}>
            <option value="">상관없음</option>
            {playerOpts.sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}명</option>)}
          </select>
          <label htmlFor="fc">가격</label>
          <select id="fc" value={q.price === null ? "" : String(q.price)}
            onChange={(e) => edit({ price: e.target.value === "" ? null : +e.target.value })}>
            {priceOpts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <button type="button" className="tag sale-toggle" aria-pressed={q.sale} onClick={() => edit({ sale: !q.sale })}>
            할인 중만{saleCount > 0 && <span className="cnt">{saleCount}</span>}
          </button>
          <button type="button" className="tag big-toggle" aria-pressed={q.big} onClick={() => edit({ big: !q.big })}
            title="스팀 리뷰 10만 개 이상인 게임은 대작으로 보고 기본으로 숨겨둬요">
            대작 포함{bigCount > 0 && <span className="cnt">{bigCount}</span>}
          </button>
        </div>
        <Seg<Group> label="목록" value={q.group} onChange={(group) => edit({ group })}
          options={[["", "친구랑 하는 게임"],
            ...(["noinfo", "single"] as Group[]).map((k) => [k, `${GROUPN[k]} ${groupCount(k)}`] as [Group, string])]} />
        <Seg label="방식" value={q.mode} onChange={(mode) => edit({ mode })}
          options={[["", "전체"], ["pvp", "경쟁"], ["coop", "협동"]]} />
        <Seg<Len> label="길이" value={q.len} onChange={(len) => edit({ len })}
          options={[["", "전체"], ["short", "짧게"], ["mid", "30분 안팎"], ["long", "오래"]]} />
        <Seg<Disc> label="발견" value={q.disc} onChange={(disc) => edit({ disc })}
          options={[["", "전체"], ["new", "신작"], ["gem", "숨은 명작"], ["nohit", "유명작 빼기"]]} />
        <Seg<"text"> label="언어" value={q.ko} onChange={(ko) => edit({ ko })}
          options={[["", "전체"], ["text", "한국어 지원"]]} />
        <div className="frow">
          <span className="lab">분위기</span>
          {Object.entries(TAGN).map(([k, v]) => (
            <button key={k} type="button" className="tag" aria-pressed={q.tags.includes(k)}
              onClick={() => edit({ tags: q.tags.includes(k) ? q.tags.filter((x) => x !== k) : [...q.tags, k] })}>{v}</button>
          ))}
        </div>
      </section>

      {error && <p className="notice">{error}</p>}
      {!error && !games.length && <p className="notice">게임 목록을 불러오는 중…</p>}
      {games.length > 0 && (
        <div className="resbar" ref={resultsTop}>
          <span>
            {summary(q) ? <>추천 · <b>{summary(q)}</b></> : "조건 없이 추천"}
            <span className="count"> · {result.list.length}개</span>
          </span>
          <div className="resbar-actions">
            <label className="sort">
              <span className="sr-only">정렬</span>
              <select id="sort" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                {SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <button type="button" className="share" onClick={share}>이 결과 공유</button>
            <button type="button" className="pick-btn" onClick={pickRandom} disabled={!result.list.length}>
              아무거나 골라줘
            </button>
          </div>
        </div>
      )}
      {pick && (
        <div className="pick" ref={pickRef} role="region" aria-label="랜덤으로 고른 게임">
          <div className="pick-head">
            <b>오늘은 이거 어때요?</b>
            <span className="pick-sub">{result.list.length}개 중에서 골랐어요</span>
          </div>
          <ul className="list pick-list">
            <Card key={pick.appid} g={pick} want={q.players ?? 0} />
          </ul>
          <div className="pick-actions">
            <button type="button" className="pick-btn" onClick={pickRandom} disabled={result.list.length < 2}>다시 뽑기</button>
            <button type="button" className="pick-close" onClick={() => setPick(null)}>닫기</button>
          </div>
        </div>
      )}
      {shareMsg && <p className="notice share-msg" role="status">{shareMsg}</p>}
      {result.note && <p className="notice">{result.note}</p>}
      {games.length > 0 && !result.list.length && (
        <p className="notice">{hiddenBig
          ? `이 목록은 대작만 ${hiddenBig}개 있어서 숨겨져 있어요. 위에서 '대작 포함'을 켜면 보여요.`
          : "이 목록에는 아직 게임이 없어요."}</p>
      )}
      <ul className="list">
        {shown.map((g) => <Card key={g.appid} g={g} want={q.players ?? 0} />)}
      </ul>

      {pageCount > 1 && (
        <nav className="pager" aria-label="결과 페이지">
          <button type="button" className="pg-step" onClick={() => goPage(page - 1)} disabled={page === 1}>이전</button>
          {pageNums.map((p, i) => (
            <span key={p} className="pg-group">
              {i > 0 && p - pageNums[i - 1] > 1 && <span className="pg-gap" aria-hidden="true">…</span>}
              <button type="button" className="pg-num" aria-current={p === page ? "page" : undefined}
                onClick={() => goPage(p)}>{p}</button>
            </span>
          ))}
          <button type="button" className="pg-step" onClick={() => goPage(page + 1)} disabled={page === pageCount}>다음</button>
        </nav>
      )}

      <footer>
        게임 {games.length}개 · 가격과 할인은 스팀 한국 스토어 기준으로 매일 갱신돼요
        {updatedAt && ` (마지막 갱신 ${updatedAt})`}. 앞서 해보기 게임은 인원·내용이 바뀔 수 있어요.
      </footer>
    </div>
  );
}
