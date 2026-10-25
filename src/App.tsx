import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY, LEN, TAGN, type Game, type Query, type Disc, type Len,
  headerUrl, kindOf, parse, recommend, won,
} from "./logic";

const EXAMPLES = [
  "3명이서 할 신작 협동", "유명한 거 말고 4명 공포", "둘이서 할 스토리 협동 게임",
  "4명이서 무서운 거 2만원 이하", "한국어 되는 2인 협동", "친구 5명 무료로 웃긴 거", "6명 마피아 게임",
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
  const chips = [g.min === g.max ? `${g.max}명 전용` : `${g.min}~${g.max}명`,
    g.mode === "pvp" ? "경쟁" : g.mode === "coop" ? "협동" : "협동+대전",
    LEN[g.len], ...g.tags.slice(0, 3).map((t) => TAGN[t])];
  return (
    <li className="card">
      <a className="cover" href={url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        {imgOk
          ? <img src={headerUrl(g)} alt="" loading="lazy" onError={() => setImgOk(false)} />
          : <span className="noimg">{g.name}</span>}
        {k === "new" && <span className="badge new">신작</span>}
        {k === "gem" && <span className="badge gem">숨은 명작</span>}
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
        <div className="slots" aria-label={`${g.min}명부터 ${g.max}명까지`}>
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className={"s" + (i < want ? " on" : "")}>{i + 1}</span>
          ))}
          {g.max > 8 && <span className="cap">최대 {g.max}명</span>}
        </div>
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
  const [text, setText] = useState("");
  const [q, setQ] = useState<Query>(() => ({ ...EMPTY, tags: [] }));
  const [hint, setHint] = useState("말로 물어보거나 아래에서 직접 골라 보세요.");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // PC에서는 들어오자마자 바로 입력할 수 있게 커서를 둠 (폰은 키보드가 튀어나와서 제외)
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    fetch("/games.json")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setGames(d.games); setUpdatedAt(d.updatedAt); })
      .catch(() => setError("게임 목록을 불러오지 못했어요. 새로고침해 주세요."));
  }, []);

  const result = useMemo(() => recommend(games, q), [games, q]);

  const ask = (t: string) => {
    const r = parse(t);
    const any = r.players || r.price !== null || r.mode || r.len || r.tags.length || r.disc || r.ko;
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
        </div>
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
      {result.note && <p className="notice">{result.note}</p>}
      <ul className="list">
        {result.list.map((g) => <Card key={g.appid} g={g} want={q.players ?? 0} />)}
      </ul>

      <footer>
        게임 {games.length}개 · 가격과 할인은 스팀 한국 스토어 기준으로 매일 갱신돼요
        {updatedAt && ` (마지막 갱신 ${updatedAt})`}. 앞서 해보기 게임은 인원·내용이 바뀔 수 있어요.
      </footer>
    </div>
  );
}
