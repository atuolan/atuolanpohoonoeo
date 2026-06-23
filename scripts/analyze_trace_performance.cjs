const fs = require('fs');

const path = process.argv[2] || 'Trace-20260624T005351.json';
const raw = fs.readFileSync(path, 'utf8');
const data = JSON.parse(raw);
const events = Array.isArray(data) ? data : (data.traceEvents || []);

function ms(us) { return us / 1000; }
function fmt(n) { return Number.isFinite(n) ? n.toFixed(2) : '0.00'; }
function add(map, key, dur) {
  const item = map.get(key) || { count: 0, dur: 0, max: 0 };
  item.count++;
  item.dur += dur;
  if (dur > item.max) item.max = dur;
  map.set(key, item);
}
function top(map, n = 30) {
  return [...map.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, n)
    .map(([key, v]) => ({ key, count: v.count, totalMs: +fmt(ms(v.dur)), maxMs: +fmt(ms(v.max)) }));
}
function topMax(map, n = 30) {
  return [...map.entries()].sort((a, b) => b[1].max - a[1].max).slice(0, n)
    .map(([key, v]) => ({ key, count: v.count, totalMs: +fmt(ms(v.dur)), maxMs: +fmt(ms(v.max)) }));
}

let minTs = Infinity, maxTs = -Infinity;
const byName = new Map();
const byCat = new Map();
const byThread = new Map();
const byFrame = new Map();
const byUrl = new Map();
const byFunction = new Map();
const longTasks = [];
const bigEvents = [];
const nameCounts = new Map();
const catCounts = new Map();

for (const e of events) {
  if (typeof e.ts === 'number') {
    minTs = Math.min(minTs, e.ts);
    const end = typeof e.dur === 'number' ? e.ts + e.dur : e.ts;
    maxTs = Math.max(maxTs, end);
  }
  const name = e.name || '(no name)';
  nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  if (e.cat) catCounts.set(e.cat, (catCounts.get(e.cat) || 0) + 1);
  if (typeof e.dur !== 'number') continue;
  const dur = e.dur;
  add(byName, name, dur);
  add(byCat, e.cat || '(no cat)', dur);
  add(byThread, `${e.pid ?? '?'}:${e.tid ?? '?'}`, dur);
  const args = e.args || {};
  const dataArg = args.data || args.beginData || args.endData || {};
  const url = dataArg.url || dataArg.stackTrace?.[0]?.url || args.url || dataArg.frame || '';
  if (url) add(byUrl, url, dur);
  const func = dataArg.functionName || dataArg.name || dataArg.type || '';
  if (func) add(byFunction, func, dur);
  const frame = dataArg.frame || dataArg.frameTreeNodeId || args.frame || '';
  if (frame) add(byFrame, String(frame), dur);
  if (dur >= 50000 || name === 'RunTask' || name === 'Task') {
    longTasks.push({ name, cat: e.cat || '', ph: e.ph || '', tsMs: +fmt(ms(e.ts - minTs)), durMs: +fmt(ms(dur)), pid: e.pid, tid: e.tid, url, func, argsName: args.name || dataArg.name || '' });
  }
  if (dur >= 10000) {
    bigEvents.push({ name, cat: e.cat || '', ph: e.ph || '', tsMs: +fmt(ms(e.ts - minTs)), durMs: +fmt(ms(dur)), pid: e.pid, tid: e.tid, url, func, argsName: args.name || dataArg.name || '' });
  }
}

const metaKeys = data.metadata ? Object.keys(data.metadata) : [];
const sourceMapUrls = data.metadata?.sourceMaps?.map(s => s.url).slice(0, 50) || [];

const output = {
  file: path,
  topLevelKeys: Object.keys(data).slice(0, 30),
  metadataKeys: metaKeys,
  sourceMapCount: data.metadata?.sourceMaps?.length || 0,
  sourceMapUrls,
  eventCount: events.length,
  durationMs: +fmt(ms(maxTs - minTs)),
  topByTotalDuration: top(byName, 40),
  topByMaxDuration: topMax(byName, 40),
  topCategories: top(byCat, 30),
  topThreads: top(byThread, 30),
  topUrls: top(byUrl, 40),
  topFunctionsOrTypes: top(byFunction, 40),
  longTaskCount50ms: longTasks.filter(x => x.durMs >= 50).length,
  topLongTasks: longTasks.sort((a, b) => b.durMs - a.durMs).slice(0, 80),
  topBigEvents10ms: bigEvents.sort((a, b) => b.durMs - a.durMs).slice(0, 120),
  topEventCounts: [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([key, count]) => ({ key, count })),
  topCatCounts: [...catCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([key, count]) => ({ key, count })),
};
console.log(JSON.stringify(output, null, 2));
