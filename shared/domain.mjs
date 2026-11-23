export const TIME_ZONE = 'Asia/Shanghai';
export const DEFAULT_SETTINGS = Object.freeze({ dueDate: '2027-01-13', fastingTarget: 5.1, postMealTarget: 6.7, bpReminder: '按医嘱每日测量 1～2 次，可随时补测' });
export const SLOTS = Object.freeze({ fasting: '空腹', breakfast: '早餐后 2 小时', lunch: '午餐后 2 小时', dinner: '晚餐后 2 小时' });
export const PAINS = Object.freeze({ none: '无痛', mild: '轻微', moderate: '中等', strong: '强烈' });
export const KINDS = Object.freeze({ glucose: '血糖', pressure: '血压', contraction: '宫缩' });
export function shanghaiInput(value = Date.now(), seconds = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('日期无效');
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, seconds ? 19 : 16);
}
export function dayKey(value = Date.now()) { return shanghaiInput(value).slice(0, 10); }
export function fromShanghai(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error('请选择完整的上海时间');
  const result = new Date(value + '+08:00');
  if (!Number.isFinite(result.getTime()) || shanghaiInput(result.getTime()) !== value.slice(0,16)) throw new Error('日期无效');
  return result.toISOString();
}
export function displayTime(value, date = false) {
  const s = shanghaiInput(value);
  return date ? s.replace('T', ' ') : s.slice(11);
}
export function displaySeconds(value, date = false) { const s=shanghaiInput(value,true);return date?s.replace('T',' '):s.slice(11); }
export function shiftDay(day, delta) { return new Date(Date.parse(day + 'T12:00:00+08:00') + delta * 86400000).toISOString().slice(0, 10); }
export function dateLabel(day) { const [y,m,d] = day.split('-'); return `${y}年${Number(m)}月${Number(d)}日`; }
export function durationLabel(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`;
}
export function targetFor(slot, settings = DEFAULT_SETTINGS) { return slot === 'fasting' ? settings.fastingTarget : settings.postMealTarget; }
export function glucoseHigh(record, settings = DEFAULT_SETTINGS) { return record.payload.value >= targetFor(record.payload.slot, settings); }
export function contractionMetrics(records) {
  const items = records.filter(r => r.kind === 'contraction' && !r.deletedAt).sort((a,b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const metrics = new Map();
  items.forEach((r,i) => {
    const prev = items[i-1]; const start = Date.parse(r.occurredAt);
    // Separate recording sessions after a gap of two hours; never invent an interval for the first entry.
    const gap = prev ? start - Date.parse(prev.occurredAt) : null;
    const interval = gap !== null && gap <= 7200000 ? gap : null;
    const rest = interval !== null && prev.payload.endAt ? start - Date.parse(prev.payload.endAt) : null;
    metrics.set(r.id, { duration: r.payload.endAt ? Date.parse(r.payload.endAt) - start : null, interval, rest: rest !== null && rest >= 0 ? rest : null });
  });
  return metrics;
}
// Display reminders for the latest ten minutes only; this is UI freshness, not a clinical waiting period.
// Medical thresholds and limitations are documented in docs/contractions.md.
export function contractionReminder(records, now = Date.now()) {
  const items = records.filter(r => r.kind === 'contraction' && !r.deletedAt && Date.parse(r.occurredAt) <= now)
    .sort((a,b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const latest = items.at(-1);
  const fresh = latest && now - Date.parse(latest.occurredAt) <= 600000;
  const interval = fresh ? contractionMetrics(items).get(latest.id).interval : null;
  const frequentCount = items.filter(r => now - Date.parse(r.occurredAt) <= 600000).length;
  const prolonged = items.some(r => {
    const start = Date.parse(r.occurredAt);
    if (!r.payload.endAt) return now - start > 120000;
    const end = Date.parse(r.payload.endAt);
    return end <= now && now - end <= 600000 && end - start > 120000;
  });
  return { interval, shortInterval: interval !== null && interval > 0 && interval <= 300000, prolonged, frequentCount };
}
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function recordsCsv(records, settings = DEFAULT_SETTINGS, allRecords = records) {
  const metrics = contractionMetrics(allRecords);
  const lines = [
    ['青孕期健康记录', '预产期', settings.dueDate, '时区', TIME_ZONE],
    ['当前血糖目标（mmol/L）','空腹小于',settings.fastingTarget,'餐后两小时小于',settings.postMealTarget],
    ['类型','测量／开始时间（上海）','时段','血糖（mmol/L）','收缩压（mmHg）','舒张压（mmHg）','心率（次/分）','结束时间（上海）','持续时长（秒）','间隔时长（秒，开始到开始）','休息秒数','疼痛程度','备注','录入时间（上海）']
  ];
  for (const r of records.filter(r=>!r.deletedAt && r.kind !== 'settings').sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt))) {
    const p = r.payload; const m = metrics.get(r.id);
    lines.push([KINDS[r.kind], r.kind==='contraction'?displaySeconds(r.occurredAt, true):displayTime(r.occurredAt, true), SLOTS[p.slot] ?? '', p.value ?? '', p.systolic ?? '', p.diastolic ?? '', p.pulse ?? '', p.endAt ? displaySeconds(p.endAt,true) : '', m?.duration != null ? m.duration/1000 : '', m?.interval != null ? m.interval/1000 : '', m?.rest != null ? m.rest/1000 : '', PAINS[p.pain] ?? '', p.note ?? '', displayTime(r.createdAt,true)]);
  }
  return '\ufeff' + lines.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
// Canonical UTC timestamps keep chronological and lexical ordering consistent.
const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const num = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !/^[\w-]{1,80}$/.test(r.id)) throw new Error('记录编号无效');
  if (!['glucose','pressure','contraction','settings'].includes(r.kind)) throw new Error('记录类型无效');
  if (r.id === 'settings' && r.kind !== 'settings') throw new Error('设置编号不可用于测量记录');
  if (![r.occurredAt,r.createdAt,r.updatedAt].every(iso)) throw new Error('记录时间无效');
  if (r.deletedAt !== null && r.deletedAt !== undefined && !iso(r.deletedAt)) throw new Error('删除时间无效');
  const p = r.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('记录内容无效');
  if (p.note !== undefined && (typeof p.note !== 'string' || p.note.length > 1000)) throw new Error('备注最多 1000 字');
  if (r.kind === 'glucose') {
    if (!num(p.value,0.1,50) || !Object.hasOwn(SLOTS,p.slot)) throw new Error('请填写有效的血糖数值和测量时段');
  } else if (r.kind === 'pressure') {
    if (!Number.isInteger(p.systolic) || !num(p.systolic,30,300) || !Number.isInteger(p.diastolic) || !num(p.diastolic,20,200) || p.systolic <= p.diastolic) throw new Error('请核对血压，高压应大于低压');
    if (p.pulse !== null && p.pulse !== undefined && (!Number.isInteger(p.pulse) || !num(p.pulse,20,250))) throw new Error('请核对心率');
  } else if (r.kind === 'contraction') {
    if (p.endAt !== null && (!iso(p.endAt) || Date.parse(p.endAt) <= Date.parse(r.occurredAt))) throw new Error('结束时间应晚于开始时间');
    if (p.endAt && Date.parse(p.endAt) > Date.now() + 300000) throw new Error('结束时间不能在未来');
    if (p.pain !== null && !Object.hasOwn(PAINS,p.pain)) throw new Error('疼痛程度无效');
  } else {
    if (r.id !== 'settings' || r.deletedAt) throw new Error('设置记录无效');
    if (typeof p.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate) || !Number.isFinite(Date.parse(p.dueDate)) || new Date(p.dueDate).toISOString().slice(0,10) !== p.dueDate) throw new Error('预产期无效');
    if (!num(p.fastingTarget,1,30) || !num(p.postMealTarget,1,30)) throw new Error('请填写有效的医嘱目标值');
    if (typeof p.bpReminder !== 'string' || p.bpReminder.length > 120) throw new Error('血压提醒最多 120 字');
  }
  if (Date.parse(r.occurredAt) > Date.now() + 300000) throw new Error('测量时间不能在未来');
  return r;
}
