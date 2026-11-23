import { useState,type FormEvent } from 'react';
import { SLOTS,PAINS,shanghaiInput,fromShanghai } from '../../shared/domain.mjs';
import { newRecord,saveRecord } from '../lib/data';
import type { Entry,Kind,Slot,Pain } from '../types';
import { Modal } from './Modal';

export function EntryForm({kind,entry,slot='fasting',onClose,onSaved}: {kind:Kind;entry?:Entry;slot?:Slot;onClose:()=>void;onSaved:()=>void}){
  const [time,setTime]=useState(shanghaiInput(entry?.occurredAt??Date.now(),kind==='contraction'));
  const [end,setEnd]=useState(shanghaiInput(entry?.payload.endAt??Date.now(),true));
  const [selected,setSelected]=useState(entry?.payload.slot??slot);
  const [value,setValue]=useState(String(entry?.payload.value??''));
  const [sys,setSys]=useState(String(entry?.payload.systolic??''));const [dia,setDia]=useState(String(entry?.payload.diastolic??''));
  const [pulse,setPulse]=useState(String(entry?.payload.pulse??''));const [note,setNote]=useState(entry?.payload.note??'');
  const [pain,setPain]=useState<Pain|null>(entry?.payload.pain??null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      // Preserve seconds on unmodified timestamps when editing a timer record.
      const occurredAt=entry && time===shanghaiInput(entry.occurredAt,kind==='contraction')?entry.occurredAt:fromShanghai(time);
      const payload=kind==='glucose'?{slot:selected,value:Number(value),note}:kind==='pressure'?{systolic:Number(sys),diastolic:Number(dia),pulse:pulse?Number(pulse):null,note}:{endAt:entry?.payload.endAt && end===shanghaiInput(entry.payload.endAt,true)?entry.payload.endAt:fromShanghai(end),pain,note};
      const record=entry?{...entry,occurredAt,payload,updatedAt:new Date().toISOString()}:newRecord(kind,payload,occurredAt);
      await saveRecord(record);onSaved();
    }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}
  }
  const title=(entry?'编辑':'记录')+({glucose:'血糖',pressure:'血压',contraction:'宫缩',settings:'设置'}[kind]);
  return <Modal title={title} onClose={onClose}><form onSubmit={submit} className="entry-form">
    {kind==='glucose' && <><label>测量时段</label><div className="slot-options">{Object.entries(SLOTS).map(([key,label])=><button type="button" className={selected===key?'selected':''} onClick={()=>setSelected(key as Slot)} key={key}>{label}</button>)}</div><label htmlFor="glucose-value">血糖 <span>mmol/L</span></label><input id="glucose-value" autoFocus type="number" inputMode="decimal" min="0.1" max="50" step="0.1" placeholder="例如 4.8" value={value} onChange={e=>setValue(e.target.value)} required className="large-input"/></>}
    {kind==='pressure' && <><div className="input-pair"><label>高压（收缩压）<input autoFocus type="number" inputMode="numeric" min="30" max="300" placeholder="例如 118" value={sys} onChange={e=>setSys(e.target.value)} required/></label><label>低压（舒张压）<input type="number" inputMode="numeric" min="20" max="200" placeholder="例如 76" value={dia} onChange={e=>setDia(e.target.value)} required/></label></div><p className="field-hint">单位 mmHg · 每次测量都会单独保存</p><label>心率（选填）<input type="number" inputMode="numeric" min="20" max="250" placeholder="次 / 分" value={pulse} onChange={e=>setPulse(e.target.value)}/></label></>}
    <label>{kind==='contraction'?'开始时间':'测量时间'}<input type="datetime-local" step={kind==='contraction'?1:60} value={time} onChange={e=>setTime(e.target.value)} required/></label>
    {kind==='contraction' && <><label>结束时间<input type="datetime-local" step={1} value={end} onChange={e=>setEnd(e.target.value)} required/></label><label>疼痛程度 <span>选填</span></label><div className="pain-options">{Object.entries(PAINS).map(([key,label],i)=><button type="button" key={key} className={pain===key?'selected':''} onClick={()=>setPain(pain===key?null:key as Pain)}><span aria-hidden="true" className={`pain-face pain-${i}`}>{['◡','·','⌁','﹏'][i]}</span>{label}</button>)}</div></>}
    <p className="field-hint">全部时间按中国上海时区（UTC+8）保存和展示</p>
    <label>备注 <span>选填</span><textarea maxLength={1000} rows={2} placeholder="例如复测、饮食或身体感受" value={note} onChange={e=>setNote(e.target.value)}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button primary full" disabled={busy}>{busy?'正在保存…':'保存记录'}</button>
  </form></Modal>;
}
