// 정리 대기 후보를 사이트 목록에 넣는 도구 (AI 키 없이 사람이나 Claude가 정리할 때 사용)
//
// 사용법: node scripts/add-games.mjs 정리한파일.json
// 정리한 파일 형식 (appid별로):
// {
//   "3949040": { "min": 1, "max": 4, "mode": "coop", "len": "mid", "tags": ["funny"], "desc": "캠핑카를 몰고 험한 길을 넘는 물리 협동" },
//   "1234567": { "skip": "로컬 멀티만 있음" }
// }
// - 넣은 게임은 data/candidates.json에서 빠지고 public/games.json에 추가됨
// - skip이면 data/skipped.json으로 옮겨서 다시 후보로 올라오지 않음
import { readFile, writeFile } from "node:fs/promises";
import { validate } from "./update-games.mjs";

const GAMES = "public/games.json", CANDIDATES = "data/candidates.json", SKIPPED = "data/skipped.json";
const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };

const file = process.argv[2];
if (!file) { console.error("사용법: node scripts/add-games.mjs 정리한파일.json"); process.exit(1); }

const sorted = await readJson(file, null);
if (!sorted) { console.error(`${file}을 읽지 못함`); process.exit(1); }
const db = await readJson(GAMES, null);
let candidates = await readJson(CANDIDATES, []);
const skipped = await readJson(SKIPPED, {});
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const inDb = new Set(db.games.map((g) => g.appid));

let added = 0, skippedN = 0;
const problems = [];
for (const [key, entry] of Object.entries(sorted)) {
  const appid = Number(key);
  const c = candidates.find((x) => x.appid === appid);
  if (!c) { problems.push(`${appid}: 후보 목록에 없음`); continue; }
  if (entry.skip) {
    skipped[appid] = String(entry.skip);
    candidates = candidates.filter((x) => x.appid !== appid);
    skippedN++;
    continue;
  }
  if (inDb.has(appid)) { problems.push(`${c.name}: 이미 사이트에 있음`); continue; }
  const info = validate({ multiplayer: true, ...entry });
  if (!info) { problems.push(`${c.name}: 정리한 값이 형식에 안 맞음 ${JSON.stringify(entry)}`); continue; }
  const d = c.info ?? {};
  if (d.price === undefined) { problems.push(`${c.name}: 가격 정보가 아직 없음 (다음 갱신 후 다시)`); continue; }
  db.games.push({
    appid, name: c.name, ...info, price: d.price,
    ...(d.discount ? { finalPrice: d.finalPrice, discount: d.discount } : {}),
    kind: "gem", release: d.release, header: d.header, ko: d.ko,
    publisher: d.publisher, major: d.major, reviews: d.reviews,
    added: today, sortedBy: "manual",
  });
  inDb.add(appid);
  candidates = candidates.filter((x) => x.appid !== appid);
  added++;
}

await writeFile(GAMES, JSON.stringify(db, null, 1) + "\n");
await writeFile(CANDIDATES, JSON.stringify(candidates, null, 1) + "\n");
await writeFile(SKIPPED, JSON.stringify(skipped, null, 1) + "\n");
console.log(`추가 ${added}개, 제외 ${skippedN}개 · 사이트 ${db.games.length}개, 남은 후보 ${candidates.length}개`);
if (problems.length) console.log("확인 필요:\n  " + problems.join("\n  "));
