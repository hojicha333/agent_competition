export const recordCountHeaders=['课程记录总数','已归类记录数','本次已审查记录数','本次未审查记录数'];
export const recordCountRule='按PDF课程表出现的每一条课程记录计数，不按课程代码、学年学期合并。缓考与后续成绩各算一条，跨学期重修分别计数，未修占位行也各算一条；同一条记录匹配多个规则只计一次已审查。已归类指匹配到当前培养规则，已审查指本次实际参与课程或模块判断；暂缓审查及未匹配记录不计已审查。通过与否不影响计数，跳过专业不计入。';
export function createRecordAudit(student){
  const records=[],bySource=new Map();
  for(const section of student.sections||[])for(const c of section.courses||[]){
    const row={index:records.length+1,code:c.code,name:c.name,year:c.year||'',semester:c.semester??'',raw_rows:1,groups:new Set([section.group]),scores:new Set([[c.score,c.remark].filter(Boolean).join(' ')||'未提供成绩/备注']),pages:new Set(c.page?[c.page]:[]),classified:new Set(),reviewed:new Set()};
    records.push(row);if(!bySource.has(c))bySource.set(c,[]);bySource.get(c).push(row);
  }
  return {
    mark(courses,reason,reviewed=true){for(const c of courses)for(const row of bySource.get(c)||[]){row.classified.add(reason);if(reviewed)row.reviewed.add(reason);}},
    finish(){
      const rows=records.map(r=>({...r,groups:[...r.groups],scores:[...r.scores],pages:[...r.pages].sort((a,b)=>a-b),classified:[...r.classified],reviewed:[...r.reviewed],is_reviewed:r.reviewed.size>0,reason:r.reviewed.size?'参与本次审查':r.classified.size?'已匹配规则，本阶段暂缓审查':'未匹配到本次课程或模块规则'}));
      const reviewed=rows.filter(r=>r.is_reviewed).length,classified=rows.filter(r=>r.classified.length).length;
      return {count_mode:'rows-v1',total:rows.length,classified,reviewed,unreviewed:rows.length-reviewed,raw_rows:rows.reduce((n,r)=>n+r.raw_rows,0),rows};
    }
  };
}
export function recordCounts(student){return student.record_audit?.count_mode==='rows-v1'?student.record_audit:{...createRecordAudit(student).finish(),unavailable:true};}
export function recordCountValues(student){const r=recordCounts(student);return [r.total,r.unavailable?null:r.classified,r.unavailable?null:r.reviewed,r.unavailable?null:r.unreviewed];}
export function recordAuditSheet(students){
  const rows=[['姓名','学号','专业','课程代码','课程名称','学年','学期','记录序号','原分组','成绩及备注记录','归类依据','本次是否审查','说明','来源页码']];
  for(const s of students){const audit=recordCounts(s);for(const r of audit.rows)rows.push([s.name,s.sid,s.major,r.code,r.name,r.year,r.semester,r.index,r.groups.join('；'),r.scores.join('；'),r.classified.join('；')||'未匹配',!audit.unavailable?r.is_reviewed?'是':'否':'需重新审查',!audit.unavailable?r.reason:'旧结果缺少审查追踪，请重新审查',`${s.file} 第${r.pages.join('、')}页`]);}
  return {name:'课程记录核对',title:'逐条课程记录、归类及本次审查范围',rows,widths:[12,19,25,20,45,20,10,15,35,70,65,18,55,45]};
}

export function withRecordAudit(sheets,data){
  const people=new Map(data.students.map(s=>[String(s.sid),s])),summary=sheets.find(s=>s.name==='审查汇总');
  if(summary){summary.rows[0].push(...recordCountHeaders);for(const row of summary.rows.slice(1))row.push(...recordCountValues(people.get(String(row[1]))));summary.widths.push(20,20,22,22);}
  const rules=sheets.find(s=>s.name==='审查说明');if(rules)rules.rows.push(['课程记录计数',recordCountRule,'本次统计口径']);
  const totals=data.students.reduce((n,s)=>{const r=recordCounts(s);for(const k of ['total','classified','reviewed','unreviewed'])n[k]+=r[k];return n;},{total:0,classified:0,reviewed:0,unreviewed:0}),unavailable=data.students.some(s=>recordCounts(s).unavailable);
  sheets.push({name:'记录统计汇总',title:'本次审查学生的课程记录统计',widths:[28,20,12,100],rows:[['统计项目','数量','单位','说明'],['审查学生人数',data.students.length,'人','仅统计本次已审查专业的学生'],['课程记录总数',totals.total,'条','每出现一条课程记录就计一条，未修也计入'],['已归类记录数',unavailable?null:totals.classified,'条','已匹配当前培养规则'],['本次已审查记录数',unavailable?null:totals.reviewed,'条','本次实际参与课程或模块判断'],['本次未审查记录数',unavailable?null:totals.unreviewed,'条','暂缓审查或未匹配规则'],['计数口径',null,'',recordCountRule],...(unavailable?[['提示',null,'','旧结果缺少逐条追踪，请重新审查']]:[])]});
  sheets.push(recordAuditSheet(data.students.slice().sort((a,b)=>String(a.sid).localeCompare(String(b.sid),'en',{numeric:true}))));return sheets;
}
