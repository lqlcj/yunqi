import { KINDS, SLOTS, PAINS, displayTime, displaySeconds, durationLabel, contractionMetrics, glucoseHigh } from '../../shared/domain.mjs';
import type { Entry,Settings } from '../types';
import { Icon } from './Icon';

export function Empty({title='还没有记录',text='从今天开始，慢慢记下每一天。'}:{title?:string;text?:string}){
  return <div className="empty"><span className="empty-icon"><Icon name="leaf" size={30}/></span><strong>{title}</strong><p>{text}</p></div>;
}
export function RecordList({records,allRecords=records,settings,onEdit,onDelete,limit}:{records:Entry[];allRecords?:Entry[];settings:Settings;onEdit:(r:Entry)=>void;onDelete:(r:Entry)=>void;limit?:number}){
  const metrics=contractionMetrics(allRecords);
  const rows=records.filter(r=>r.kind!=='settings'&&!r.deletedAt).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit);
  if(!rows.length)return <Empty/>;
  return <div className="record-list">{rows.map(r=>{
    const p=r.payload;const m=metrics.get(r.id);const high=r.kind==='glucose'&&glucoseHigh(r,settings);
    return <article className={`record-row record-${r.kind}`} data-record-id={r.id} key={r.id}>
      <span className={`record-icon ${r.kind}`}><Icon name={r.kind==='glucose'?'drop':r.kind==='pressure'?'pulse':'timer'} size={19}/></span>
      <div className="record-description"><strong>{r.kind==='glucose'?SLOTS[p.slot!]:KINDS[r.kind as keyof typeof KINDS]}</strong>{r.kind==='contraction'?<dl className="contraction-fields"><div><dt>开始时间</dt><dd><time dateTime={r.occurredAt}>{displaySeconds(r.occurredAt,true)}</time></dd></div><div><dt>持续时长</dt><dd>{p.endAt?durationLabel(m?.duration??0):'计时中'}</dd></div><div><dt>间隔时长</dt><dd>{m?.interval!=null?durationLabel(m.interval):'—'}</dd></div></dl>:<time>{displayTime(r.occurredAt,true)}</time>}{p.note&&<p className="record-note">{p.note}</p>}{r.kind==='contraction'&&<span className="subtle">{p.pain?`疼痛：${PAINS[p.pain]}`:'疼痛未填写'}</span>}</div>
      {r.kind!=='contraction'&&<div className="record-result">{r.kind==='glucose'?<><strong className={high?'text-amber':''}>{p.value?.toFixed(1)}</strong><small>mmol/L</small>{high&&<span className="flag">达到 / 超过目标</span>}</>:<><strong>{p.systolic}<span className="slash">/</span>{p.diastolic}</strong><small>mmHg{p.pulse?` · 心率 ${p.pulse}`:''}</small></>}</div>}
      <div className="record-actions"><button className="icon-button" aria-label={`编辑${KINDS[r.kind as keyof typeof KINDS]}记录`} onClick={()=>onEdit(r)}><Icon name="edit" size={17}/></button><button className="icon-button" aria-label={`删除${KINDS[r.kind as keyof typeof KINDS]}记录`} onClick={()=>onDelete(r)}><Icon name="trash" size={17}/></button></div>
    </article>;
  })}</div>;
}
