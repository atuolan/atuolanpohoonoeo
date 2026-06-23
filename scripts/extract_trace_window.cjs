const fs = require('fs');

const path = process.argv[2] || 'Trace-20260624T005351.json';
const centerMs = Number(process.argv[3] || 10969886);
const radiusMs = Number(process.argv[4] || 400);
const raw = fs.readFileSync(path, 'utf8');
const data = JSON.parse(raw);
const events = Array.isArray(data) ? data : (data.traceEvents || []);
const minTs = events.reduce((min, e) => typeof e.ts === 'number' ? Math.min(min, e.ts) : min, Infinity);
const start = minTs + (centerMs - radiusMs) * 1000;
const end = minTs + (centerMs + radiusMs) * 1000;

function pickArgs(e) {
  const args = e.args || {};
  const d = args.data || args.beginData || args.endData || {};
  return {
    frame: d.frame || args.frame || d.frameTreeNodeId || '',
    url: d.url || args.url || d.stackTrace?.[0]?.url || '',
    functionName: d.functionName || d.name || args.name || '',
    type: d.type || '',
    stack: d.stackTrace ? d.stackTrace.slice(0, 5) : undefined,
    callFrame: d.callFrame,
    scriptName: d.scriptName,
    lineNumber: d.lineNumber,
    columnNumber: d.columnNumber,
  };
}

const rows = events
  .filter(e => typeof e.ts === 'number' && e.ts <= end && ((e.ts + (e.dur || 0)) >= start))
  .filter(e => typeof e.dur === 'number' && e.dur >= 1000)
  .sort((a,b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0))
  .slice(0, 250)
  .map(e => ({
    relMs: +((e.ts - minTs) / 1000).toFixed(2),
    durMs: +((e.dur || 0) / 1000).toFixed(2),
    name: e.name,
    cat: e.cat,
    pid: e.pid,
    tid: e.tid,
    args: pickArgs(e),
  }));
console.log(JSON.stringify({ centerMs, radiusMs, count: rows.length, rows }, null, 2));
