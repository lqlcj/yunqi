import { DEFAULT_SETTINGS, dayKey, shiftDay, fromShanghai, validateRecord } from '../../shared/domain.mjs';

/** Deterministic 30 complete Shanghai days. These are synthetic readings, not medical examples. */
export function monthFixture(end=shiftDay(dayKey(),-1)) {
  const start=shiftDay(end,-29);const records=[];const dates=[];
  function add(id,kind,localTime,payload){
    const occurredAt=fromShanghai(localTime);const r={id:`mock-${id}`,kind,occurredAt,createdAt:occurredAt,updatedAt:occurredAt,deletedAt:null,payload:{...payload,note:'【模拟测试数据】'+(payload.note??'')}};
    validateRecord(r);records.push(r);return r;
  }
  for(let i=0;i<30;i++){
    const day=shiftDay(start,i);dates.push(day);
    for(const [s,slot] of ['fasting','breakfast','lunch','dinner'].entries()){
      const values=s===0?[4.6,5.0,5.1,5.2,4.8]:[5.8,6.6,6.7,6.8,7.2];
      add(`g-${i}-${slot}`,'glucose',`${day}T${['06:50','09:30','14:10','20:15'][s]}`,{value:values[(i+s)%values.length],slot,note:i===8&&s===1?'复测备注，含逗号、"引号"\n第二行':i===9&&s===2?'=SUM(1,2)':i===10&&s===3?'<img src=x onerror="alert(1)">':''});
    }
    if(i%5===0)add(`g-${i}-repeat`,'glucose',`${day}T20:35`,{value:6.5,slot:'dinner',note:'晚餐后复测，保留原读数'});
    const counts=i%7===0?4:i%2===0?1:2;
    for(let j=0;j<counts;j++)add(`bp-${i}-${j}`,'pressure',`${day}T${['07:05','13:20','17:35','21:10'][j]}`,{systolic:108+(i*3+j*7)%36,diastolic:65+(i+j*2)%24,pulse:(i+j)%4===0?null:70+(i+j)%25,note:counts>2?'当天多次测量测试':''});
    const count=3+i%5;
    for(let j=0;j<count;j++){
      const at=fromShanghai(`${day}T18:00:00`);const occurredAt=new Date(Date.parse(at)+j*5*60000).toISOString();
      const seconds=[30,45,50,60,90][(i+j)%5];
      const local=new Date(Date.parse(occurredAt)+8*3600000).toISOString().slice(0,19);
      add(`c-${i}-${j}`,'contraction',local,{endAt:new Date(Date.parse(occurredAt)+seconds*1000).toISOString(),pain:[null,'none','mild','moderate','strong'][(i+j)%5]});
    }
  }
  const boundary=dates[14];const next=dates[15];
  add('midnight-before','contraction',`${boundary}T23:59:40`,{endAt:fromShanghai(`${next}T00:00:30`),pain:'moderate',note:'跨午夜持续50秒'});
  add('midnight-after','contraction',`${next}T00:04:40`,{endAt:fromShanghai(`${next}T00:05:10`),pain:'mild',note:'与前次开始间隔300秒，休息250秒'});
  const now=new Date().toISOString();
  const backup={app:'little-days',displayName:'青孕期健康记录',version:1,synthetic:true,exportedAt:now,timeZone:'Asia/Shanghai',records};
  const summary={start,end,days:30,total:records.length,glucose:records.filter(r=>r.kind==='glucose').length,pressure:records.filter(r=>r.kind==='pressure').length,contraction:records.filter(r=>r.kind==='contraction').length,settings:DEFAULT_SETTINGS};
  return {records,backup,summary,dates,boundary,next};
}

export function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  const s=text.replace(/^\ufeff/,'');
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='"'){if(quoted&&s[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  return rows;
}
