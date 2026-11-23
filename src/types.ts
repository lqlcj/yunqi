export type Kind = 'glucose' | 'pressure' | 'contraction' | 'settings';
export type Slot = 'fasting' | 'breakfast' | 'lunch' | 'dinner';
export type Pain = 'none' | 'mild' | 'moderate' | 'strong';
export interface Settings { dueDate:string; fastingTarget:number; postMealTarget:number; bpReminder:string; }
export interface Payload {
  slot?:Slot; value?:number; systolic?:number; diastolic?:number; pulse?:number|null;
  endAt?:string|null; pain?:Pain|null; note?:string;
  dueDate?:string; fastingTarget?:number; postMealTarget?:number; bpReminder?:string;
}
export interface Entry { id:string; kind:Kind; occurredAt:string; createdAt:string; updatedAt:string; deletedAt:string|null; payload:Payload; }
export interface Mutation { seq?:number; mutationId:string; recordId:string; record:Entry; }
