import test from 'node:test';
import assert from 'node:assert/strict';
import { contractionReminder,contractionMetrics,fromShanghai } from '../shared/domain.mjs';

const now=Date.parse(fromShanghai('2026-11-23T00:04:40'));
function record(id,start,end=start+45000){return {id,kind:'contraction',occurredAt:new Date(start).toISOString(),createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),deletedAt:null,payload:{endAt:end===null?null:new Date(end).toISOString(),pain:null}};}
test('reminder uses start-to-start across midnight: 299s and 300s alert, 301s does not',()=>{
  for(const seconds of [299,300,301]){
    const rows=[record('next',now,null),record('previous',now-seconds*1000)];
    const result=contractionReminder(rows,now);
    assert.equal(result.interval,seconds*1000);
    assert.equal(result.shortInterval,seconds<=300);
    assert.equal(contractionMetrics(rows).get('next').rest,seconds*1000-45000);
  }
});
test('first measurement, old data, future and deleted records do not cause an interval alert',()=>{
  assert.equal(contractionReminder([],now).shortInterval,false);
  assert.equal(contractionReminder([record('first',now,null)],now).interval,null);
  const old=[record('one',now-900001),record('two',now-600001)];
  assert.equal(contractionReminder(old,now).shortInterval,false);
  const future=record('future',now+1000,null);
  assert.equal(contractionReminder([record('one',now),future],now).shortInterval,false);
  assert.equal(contractionReminder([{...record('old',now-300000),deletedAt:new Date(now).toISOString()},record('now',now,null)],now).interval,null);
  assert.equal(contractionReminder([record('yesterday',now-86400000),record('now',now,null)],now).interval,null);
});
test('editing and deletion recompute adjacency, duplicate timestamps do not claim a valid short interval',()=>{
  const rows=[record('a',now-600000),record('b',now-300000),record('c',now,null)];
  assert.equal(contractionReminder(rows,now).shortInterval,true);
  assert.equal(contractionReminder(rows.filter(r=>r.id!=='b'),now).shortInterval,false);
  rows[1].occurredAt=new Date(now-301000).toISOString();
  assert.equal(contractionReminder(rows,now).shortInterval,false);
  assert.equal(contractionReminder([record('a',now),record('b',now,null)],now).shortInterval,false);
});
test('live and recently completed durations alert above two minutes, including exactly 120001ms',()=>{
  for(const duration of [120000,120001]){
    assert.equal(contractionReminder([record('active',now-duration,null)],now).prolonged,duration>120000);
    assert.equal(contractionReminder([record('ended',now-duration,now)],now).prolonged,duration>120000);
  }
  assert.equal(contractionReminder([record('old-ended',now-800000,now-600001)],now).prolonged,false);
  assert.equal(contractionReminder([record('forgotten',now-86400000,null)],now).prolonged,true);
  assert.equal(contractionReminder([record('future-end',now-300000,now+1000)],now).prolonged,false);
});
test('ten-minute frequency window includes its boundary and excludes future/deleted measurements',()=>{
  const rows=Array.from({length:6},(_,i)=>record('c'+i,now-i*120000));
  assert.equal(contractionReminder(rows,now).frequentCount,6);
  assert.equal(contractionReminder(rows,now+1).frequentCount,5);
  rows[0].deletedAt=new Date(now).toISOString();
  assert.equal(contractionReminder([...rows,record('future',now+1)],now).frequentCount,5);
});
