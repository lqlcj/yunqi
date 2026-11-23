import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey,fromShanghai,shanghaiInput,DEFAULT_SETTINGS,glucoseHigh,validateRecord,contractionMetrics,recordsCsv,shiftDay } from '../shared/domain.mjs';
const record=(kind,payload,id='entry-1',occurredAt='2026-11-22T16:00:00.000Z')=>({id,kind,payload,occurredAt,createdAt:occurredAt,updatedAt:occurredAt,deletedAt:null});
test('Shanghai day boundaries and local input do not depend on host timezone',()=>{
  assert.equal(dayKey('2026-11-22T15:59:59.000Z'),'2026-11-22');
  assert.equal(dayKey('2026-11-22T16:00:00.000Z'),'2026-11-23');
  assert.equal(fromShanghai('2026-11-23T00:00'),'2026-11-22T16:00:00.000Z');
  assert.equal(shanghaiInput('2026-11-22T16:00:00.000Z'),'2026-11-23T00:00');
  assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
  assert.throws(()=>fromShanghai('2026-02-30T10:00'));
});
test('strict doctor targets flag equality; all meals use the post-meal target',()=>{
  for(const slot of ['fasting','breakfast','lunch','dinner']){
    const limit=slot==='fasting'?5.1:6.7;
    assert.equal(glucoseHigh(record('glucose',{slot,value:limit}),DEFAULT_SETTINGS),true);
    assert.equal(glucoseHigh(record('glucose',{slot,value:limit-0.1}),DEFAULT_SETTINGS),false);
  }
});
test('contraction frequency uses start-to-start, duration and rest stay distinct',()=>{
  const first=record('contraction',{endAt:'2026-11-22T16:00:50.000Z',pain:'mild'},'one');
  const next=record('contraction',{endAt:'2026-11-22T16:05:45.000Z',pain:'moderate'},'two','2026-11-22T16:05:00.000Z');
  const later=record('contraction',{endAt:null,pain:null},'three','2026-11-22T20:00:00.000Z');
  const metrics=contractionMetrics([later,next,first]);
  assert.deepEqual(metrics.get('one'),{duration:50000,interval:null,rest:null});
  assert.deepEqual(metrics.get('two'),{duration:45000,interval:300000,rest:250000});
  assert.deepEqual(metrics.get('three'),{duration:null,interval:null,rest:null});
});
test('validation rejects malformed readings without imposing daily measurement counts',()=>{
  assert.throws(()=>validateRecord(record('pressure',{systolic:80,diastolic:100,pulse:null})));
  assert.throws(()=>validateRecord(record('glucose',{value:NaN,slot:'fasting'})));
  assert.throws(()=>validateRecord(record('glucose',{value:4.8,slot:'snack'})));
  assert.throws(()=>validateRecord(record('contraction',{endAt:'2026-11-22T15:59:00.000Z',pain:null})));
  for(let i=0;i<8;i++)assert.doesNotThrow(()=>validateRecord(record('pressure',{systolic:118,diastolic:78,pulse:75},`bp-${i}`)));
});
test('CSV includes due date, Shanghai time, units, pain and protects spreadsheet formulas',()=>{
  const csv=recordsCsv([record('glucose',{value:5.1,slot:'fasting',note:'=HYPERLINK("bad")'}),record('contraction',{endAt:'2026-11-22T16:00:50.000Z',pain:'strong'},'two')]);
  assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/2027-01-13/);assert.match(csv,/Asia\/Shanghai/);assert.match(csv,/2026-11-23 00:00/);assert.match(csv,/mmol\/L/);assert.match(csv,/强烈/);assert.match(csv,/'=HYPERLINK/);
});
