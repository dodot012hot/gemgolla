// 정리할 후보를 우선순위대로 뽑아서 보여주는 도구 (매일 예약 작업에서 사용)
//
// 사용법: node scripts/next-candidates.mjs [개수=50] > 후보.txt
// 우선순위: 리뷰 수가 많을수록 + 최근 180일 안에 출시됐으면 가산점. 출시 전 게임은 제외
import { readFile } from "node:fs/promises";

const n = Number(process.argv[2] ?? 50);
const candidates = JSON.parse(await readFile("data/candidates.json", "utf8"));
const today = Date.now();

const score = (c) => {
  const d = c.info ?? {};
  const recent = d.release && today - Date.parse(d.release) < 180 * 86400000 ? 2 : 0;
  return Math.log10((d.reviews ?? 0) + 1) + recent;
};

const ready = candidates
  .filter((c) => c.info && c.info.price !== undefined && c.why !== "출시 전 또는 가격 없음")
  .sort((a, b) => score(b) - score(a))
  .slice(0, n);

const MULTI = /online|multi|pvp|co-op|협동|멀티|대전|온라인|lan|분할|split|shared/i;
const hint = (t) => (String(t).match(/(\d+\s*[-~–]\s*\d+\s*(?:인|명|players?)?|최대\s*\d+\s*(?:인|명)?|up to \d+|\d+\s*(?:인|명|players?))/gi) ?? []).slice(0, 5).join(" ");

console.log(`정리 대기 후보 ${candidates.length}개 중 우선순위 상위 ${ready.length}개\n`);
for (const c of ready) {
  const d = c.info;
  console.log(`## ${c.appid} ${c.name}`);
  console.log(`가격 ${d.price}원 · 리뷰 ${d.reviews ?? "-"} · 출시 ${d.release ?? "-"} · 배급 ${d.publisher ?? "-"}`);
  console.log(`카테고리: ${(d.cats ?? []).filter((x) => MULTI.test(x)).join(" / ")} | 장르: ${(d.genres ?? []).join(", ")}`);
  console.log(`인원 단서: ${hint(`${d.short} ${d.text}`) || "-"}`);
  console.log(`소개: ${String(d.short).slice(0, 200)}`);
  console.log(`설명: ${String(d.text).replace(/\s+/g, " ").slice(0, 700)}\n`);
}
