import { dayKey,displayTime,SLOTS } from '../../shared/domain.mjs';
import type { Entry,Slot } from '../types';

const palette=['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)'];
export function Trend({records,kind}:{records:Entry[];kind:'glucose'|'pressure'}){
  const rows=records.filter(r=>r.kind===kind&&!r.deletedAt).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
  const series=kind==='pressure'?[{name:'收缩压',color:palette[0],rows:rows.map(r=>({r,v:r.payload.systolic!}))},{name:'舒张压',color:palette[2],rows:rows.map(r=>({r,v:r.payload.diastolic!}))}]:Object.entries(SLOTS).map(([key,name],i)=>({name,color:palette[i],rows:rows.filter(r=>r.payload.slot===key as Slot).map(r=>({r,v:r.payload.value!}))}));
  if(!rows.length)return <div className="chart-empty"><span>记录后，这里会出现变化趋势</span><div className="chart-empty-lines"/></div>;
  const values=series.flatMap(s=>s.rows.map(p=>p.v));const low=Math.max(0,Math.min(...values)-(kind==='glucose'?1:10));const high=Math.max(...values)+(kind==='glucose'?1:10);
  const first=Date.parse(rows[0].occurredAt);const last=Date.parse(rows.at(-1)!.occurredAt);const span=Math.max(last-first,3600000);
  const x=(r:Entry)=>rows.length===1?330:54+(Date.parse(r.occurredAt)-first)/span*570;
  const y=(v:number)=>172-(v-low)/(high-low)*140;
  const ticks=Array.from({length:4},(_,i)=>low+(high-low)*i/3);
  return <div className="trend"><svg viewBox="0 0 660 215" role="img" aria-label={`${kind==='glucose'?'血糖':'血压'}测量趋势，具体数值见下方明细`}>
    {ticks.map((v,i)=><g key={i}><line x1="48" x2="635" y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeDasharray="3 4"/><text x="37" y={y(v)+4} textAnchor="end" fill="var(--chart-label)" fontSize="11">{kind==='glucose'?v.toFixed(1):Math.round(v)}</text></g>)}
    {series.map(s=><g key={s.name}>{s.rows.map((p,i)=>{
      const prev=s.rows[i-1];const linked=prev&&dayKey(prev.r.occurredAt)===dayKey(p.r.occurredAt);
      return <g key={p.r.id}>{linked&&<line x1={x(prev.r)} y1={y(prev.v)} x2={x(p.r)} y2={y(p.v)} stroke={s.color} strokeWidth="2" opacity=".45"/>}<circle cx={x(p.r)} cy={y(p.v)} r="4.5" fill={s.color} stroke="var(--chart-point-border)" strokeWidth="2"><title>{s.name} · {displayTime(p.r.occurredAt,true)} · {p.v}</title></circle></g>;
    })}</g>)}
    <text x="54" y="205" fill="var(--chart-label)" fontSize="11">{displayTime(rows[0].occurredAt,true).slice(5,16)}</text><text x="624" y="205" textAnchor="end" fill="var(--chart-label)" fontSize="11">{rows.length>1?displayTime(rows.at(-1)!.occurredAt,true).slice(5,16):''}</text>
  </svg><div className="chart-legend">{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}</span>)}</div></div>;
}
