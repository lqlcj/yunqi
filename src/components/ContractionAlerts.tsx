import { contractionReminder,durationLabel } from '../../shared/domain.mjs';
import type { Entry } from '../types';

export function ContractionAlerts({records,now}:{records:Entry[];now:number}){
  const reminder=contractionReminder(records,now);
  if(!reminder.shortInterval&&!reminder.prolonged&&reminder.frequentCount<6)return null;
  const urgent=reminder.prolonged||reminder.frequentCount>=6;
  return <aside className={`contraction-alert ${urgent?'urgent':''}`} role="alert" aria-label="宫缩记录提醒">
    <strong>{urgent?'请立即联系产科，核对宫缩情况':'宫缩间隔已达到提醒范围'}</strong>
    {reminder.shortInterval&&<p>本次与上次开始相隔 <b>{durationLabel(reminder.interval!)}</b>（≤ 5 分钟）。若宫缩已规律、逐渐增强，请联系生产医院。单次短间隔不能确认临产。</p>}
    {reminder.prolonged&&<p>有一次宫缩记录持续超过 2 分钟。若实际宫缩确实如此，请立即联系产科；也请核对是否忘记结束计时或录错时间。</p>}
    {reminder.frequentCount>=6&&<p>最近 10 分钟已记录 {reminder.frequentCount} 次宫缩（≥ 6 次）。请立即联系产科，并核对是否重复记录。</p>}
    <p>疑似破水、阴道出血、胎动减少，或未满 37 周怀疑临产时，请立即联系产科，无需等待上述条件。以生产医院的个体医嘱为准。</p>
  </aside>;
}
