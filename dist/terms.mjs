// 学年按北京时间换算；小学期只手动选择，不按月份自动启用。
export const FULL_AUDIT='all';
export const FULL_AUDIT_LABEL='本科全部要求（最终审查）';
export function parseAuditTerm(value){
  if(value===FULL_AUDIT)return FULL_AUDIT;
  const m=String(value).match(/^(\d{4})-(\d{4})-([123])$/);
  if(!m||Number(m[2])!==Number(m[1])+1)throw new Error('审查学期格式应为“2026-2027-1”，末位可选1、2或3。');
  return [Number(m[1]),Number(m[3])];
}
export function formatAuditTerm([year,semester]){
  const value=`${year}-${year+1}-${semester}`;parseAuditTerm(value);return value;
}
export function compareAuditTerms(a,b){return a[0]-b[0]||a[1]-b[1];}
export function currentAuditTerm(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric'}).formatToParts(date);
  const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
  return month>=9?[year,1]:month<=2?[year-1,1]:[year-1,2];
}
export function defaultAuditTerm(mode='current',date=new Date()){
  if(mode===FULL_AUDIT)return FULL_AUDIT;
  if(mode!=='current')throw new Error('默认审查方式无效');
  return formatAuditTerm(currentAuditTerm(date));
}
export function auditTermLabel(value){
  if(value===FULL_AUDIT)return FULL_AUDIT_LABEL;
  const [year,semester]=Array.isArray(value)?value:parseAuditTerm(value);
  return `${year}–${year+1} 学年 · ${semester===1?'第一学期':semester===2?'第二学期':'小学期（3）'}`;
}
export function auditTermOptions(date=new Date()){
  const [year]=currentAuditTerm(date),options=[{value:FULL_AUDIT,label:FULL_AUDIT_LABEL}];
  for(let y=year+5;y>=year-6;y--)for(const semester of [1,2,3]){
    const value=formatAuditTerm([y,semester]);options.push({value,label:auditTermLabel(value)});
  }
  return options;
}
export const auditTermFilename=value=>value===FULL_AUDIT?'本科全部要求':value;
