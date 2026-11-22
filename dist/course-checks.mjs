import {FULL_AUDIT,parseAuditTerm,compareAuditTerms} from './terms.mjs?v=20261104-rows1';
export const phaseCourseHeaders=['此前应修课程是否通过','本学期应修课程是否满足'];
// 只拆分现有逐门判断，不重新认定成绩、不改变总判断。
export function phaseCourseChecks(student,value){
  if(value===FULL_AUDIT)return null;
  const current=Array.isArray(value)?value:parseAuditTerm(value),previous=[],now=[];
  for(const c of student.mandatory||[]){
    const passed=['已通过','已通过/替代通过'].includes(c.state);
    let comparison;
    if(['截至所选学期','截至本学期'].includes(c.schedule))comparison=-1;
    else{
      try{comparison=compareAuditTerms(parseAuditTerm(c.schedule),current);}
      catch{previous.push({course:c,ok:false,issue:`${c.name}（${c.code}）：应修学期无法识别，需核对`});continue;}
    }
    if(comparison>0)continue;
    const bucket=comparison===0?now:previous,ok=passed||comparison===0&&c.state==='本学期在修';
    bucket.push({course:c,ok,issue:ok?'':`${c.name}（${c.code}）：${c.state}${c.category==='计次课程'?'；'+c.evidence:''}`});
  }
  return {previous_ok:previous.every(c=>c.ok),current_ok:now.every(c=>c.ok),previous_issues:previous.filter(c=>!c.ok).map(c=>c.issue),current_issues:now.filter(c=>!c.ok).map(c=>c.issue),previous_count:previous.length,current_count:now.length};
}
export const courseCheckHeaders=value=>value===FULL_AUDIT?['必修']:phaseCourseHeaders;
export function courseCheckValues(student,value){
  if(value===FULL_AUDIT)return [student.required_ok?'√':'×'];
  const result=phaseCourseChecks(student,value);return [result.previous_ok?'√':'×',result.current_ok?'√':'×'];
}
