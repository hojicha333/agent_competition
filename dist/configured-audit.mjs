import {createRecordAudit} from './record-audit.mjs?v=20261104-rows1';
import {normalize} from './rule-schema.mjs?v=20261104-rows1';
import {FULL_AUDIT,compareAuditTerms} from './terms.mjs?v=20261104-rows1';
const term=c=>c.year&&c.semester?[Number(c.year.slice(0,4)),Number(c.semester)]:null;
const same=(a,b)=>a&&b&&compareAuditTerms(a,b)===0;
const distinct=records=>[...new Map(records.map(c=>[c.code||normalize(c.name),c])).values()];
const sum=records=>records.reduce((n,c)=>n+Number(c.credits||0),0);
const recordText=c=>`${c.code} ${c.name} ${c.year||''}-${c.semester||''} ${c.score||'无成绩'} ${c.remark||'无备注'}`;
const matches=(record,course)=>record.code===course.code||(course.alias_codes||[]).includes(record.code)||(course.alias_names||[]).some(n=>normalize(n)===normalize(record.name));
export function repeatCount(all,rule,predicate){
  const names=new Set((rule.names||[]).map(normalize));
  const selected=all.filter(c=>rule.codes.includes(c.code)||names.has(normalize(c.name)));
  const key=c=>rule.dedup==='term'?JSON.stringify(term(c)||[c.code,c.page]):JSON.stringify([c.code,c.year,c.semester]);
  const original=new Map(),replaced=new Map();
  for(const c of selected.filter(predicate)){
    if(c.remark.includes('校内被替代')){
      const refs=normalize(c.replacement).replace(/^替代课程:/,'').split(/[,，、;；]/).filter(name=>names.has(name)||name===normalize(rule.name));
      replaced.set(key(c),Math.max(replaced.get(key(c))||0,refs.length||1));
    }else original.set(key(c),c);
  }
  return {count:Math.max(original.size,[...replaced.values()].reduce((a,b)=>a+b,0)),records:selected,originals:[...original.values()],replacement_count:[...replaced.values()].reduce((a,b)=>a+b,0)};
}
export function auditConfiguredStudent(student,plan,current,extra,helpers){
  const final=current===FULL_AUDIT,all=student.sections.flatMap(sec=>sec.courses),notes=[],mandatory=[],requiredIssues=[],electiveIssues=[],historyMissing=[],courseHistory=[];
  const recordAudit=createRecordAudit(student);
  if(plan.notes?.length)notes.push('培养计划文字说明为参考提示；自动审查按已保存的课程、模块、次数和专项配置执行。');
  const passed=c=>(plan.p_override_codes||[]).includes(c.code)&&normalize(c.score)==='P'||helpers.passed(c);
  const hasRead=c=>passed(c)||helpers.hasReadRecord(c);
  const cohort=Number(student.cohort)||plan.cohort_year;
  const schedule=(definitions,records)=>[...definitions.map(c=>[cohort+c.grade-1,c.semester]),...records.map(term).filter(Boolean)].sort(compareAuditTerms)[0]||[cohort,1];
  const inferred=(plan.track_inference||[]).find(t=>all.some(c=>t.codes.includes(c.code)&&passed(c)))?.track;
  const track=String(extra['培养类型']||inferred||plan.default_track||Object.keys(plan.tracks)[0]||'普通').trim();
  if(!Object.hasOwn(plan.tracks,track))throw new Error(`${student.sid} 的培养类型“${track}”不在所选规则中，请核对补充CSV或培养类型设置`);
  if(!extra['培养类型']&&inferred)notes.push(`按已通过专属课程推定${inferred}培养，请核对`);
  if(student.cohort&&Number(student.cohort)!==plan.cohort_year)notes.push(`学生为${student.cohort}级，所选培养规则为${plan.cohort_year}级；请核对是否选择了对应年级规则`);
  const repetitionMatch=c=>plan.repetitions.some(r=>r.codes.includes(c.code)||(r.names||[]).some(n=>normalize(n)===normalize(c.name)));
  const checked=new Set();
  function checkCourse(p,category){
    if(checked.has(p.code))return;checked.add(p.code);
    const records=all.filter(c=>matches(c,p)),done=records.some(passed),due=schedule([p],records),inprogress=!final&&same(due,current)&&records.some(c=>same(term(c),current)&&c.remark.includes('在修'));
    const deferred=!final&&compareAuditTerms(due,current)>0;
    recordAudit.mark(records,`${category}：${p.name}`,!deferred);
    const pending=records.find(c=>c.remark.includes('在修'));
    const state=done?'已通过/替代通过':deferred?'暂不审查':inprogress?'本学期在修':final&&pending?'在修，待成绩':records.length?'未通过':'缺少课程记录';
    const evidence=records.find(passed)||pending||records.at(-1);
    mandatory.push({code:p.code,name:p.name,category,credits:p.credits,state,schedule:`${due[0]}-${due[0]+1}-${due[1]}`,page:evidence?.page||null,evidence:evidence?recordText(evidence):'培养规则要求此课程，修业报告无对应记录'});
    if(!done&&!deferred&&!inprogress)(category==='指定课程'?electiveIssues:requiredIssues).push(`${p.name}(${p.code}) ${p.credits}学分：${state}`);
    const recorded=records.some(hasRead)?1:0;
    courseHistory.push({name:p.name,code:p.code,required:1,passed:done?1:0,recorded,gap:1-recorded,unit:'门',evidence:records.filter(hasRead).map(recordText).join('；')||'无修读记录'});
    if(!recorded)historyMissing.push(`${p.name}（${p.code}）没有修读记录`);
  }
  for(const c of plan.courses)if(c.nature==='必修'&&!repetitionMatch(c))checkCourse(c,'必修');
  for(const code of plan.tracks[track]||[]){const definition=plan.courses.find(c=>c.code===code)||{code,name:code,credits:0,grade:1,semester:1};checkCourse(definition,'指定课程');}
  for(const r of plan.repetitions){
    const done=repeatCount(all,r,passed),recorded=repeatCount(all,r,hasRead),gap=Math.max(0,r.required_count-done.count);
    recordAudit.mark(done.records,`计次课程：${r.name}`);
    if(gap)requiredIssues.push(`${r.name}仅通过${done.count}次，差${gap}次/${gap*r.credits_per_attempt}学分`);
    mandatory.push({code:r.codes.join('/'),name:`${r.name}（${r.required_count}次）`,category:'计次课程',credits:r.required_count*r.credits_per_attempt,state:gap?'未通过':'已通过',schedule:final?'本科全部期间':'截至所选学期',page:done.records[0]?.page||null,evidence:`不同有效修读记录：通过${done.count}次，有记录${recorded.count}次，要求${r.required_count}次；`+done.records.filter(hasRead).map(recordText).join('；')});
    courseHistory.push({name:r.name,code:r.codes.join('/'),required:r.required_count,passed:done.count,recorded:recorded.count,gap:Math.max(0,r.required_count-recorded.count),unit:'次',evidence:'新旧代码按此规则的代码/名称匹配，替代汇总与原始修读不重复计次'});
    if(recorded.count<r.required_count)historyMissing.push(`${r.name}只有${recorded.count}次修读记录，差${r.required_count-recorded.count}次`);
  }
  const groupIs=(g,names)=>names.some(name=>normalize(name)===normalize(g));
  const grouped=(groups,scope='credited')=>{
    const summaries=student.summary.filter(s=>groupIs(s.group,groups)),sections=student.sections.filter(s=>groupIs(s.group,groups));
    let earned=summaries.length?summaries.reduce((n,s)=>n+s.earned,0):sections.reduce((n,s)=>n+s.earned,0);const waived=summaries.reduce((n,s)=>n+s.waived,0);
    let courses=sections.flatMap(s=>s.courses);
    if(scope==='listed'){
      const allowed=plan.courses.filter(c=>groupIs(c.group,groups));
      courses=courses.filter(c=>allowed.some(p=>matches(c,p)||/替代/.test(c.remark)&&normalize(c.replacement).includes(normalize(p.name))));
      earned=Math.min(earned,sum(distinct(courses.filter(passed))));
    }
    const inprogress=distinct(courses.filter(c=>!all.some(a=>a.code===c.code&&passed(a))&&c.remark.includes('在修')&&(final||same(term(c),current))));
    return {earned,waived,credited:earned+waived,courses,inprogress:sum(inprogress),pending:inprogress,found:!!(summaries.length||sections.length),page:summaries[0]?.page||sections[0]?.page||null};
  };
  const dueFor=(m,groups=m.groups)=>m.due?[cohort+m.due.grade-1,m.due.semester]:plan.courses.filter(c=>groupIs(c.group,groups)).map(c=>[cohort+c.grade-1,c.semester]).sort(compareAuditTerms).at(-1);
  const phaseCheck=(required,data,due,phase,minimum=0)=>{
    const deficit=Math.max(0,required-data.credited),future=!final&&phase==='scheduled'&&due&&compareAuditTerms(due,current)>0,now=!final&&phase==='scheduled'&&due&&same(due,current);
    const count=distinct(data.courses.filter(passed)).length+(data.waived>=required&&required>0?minimum:0);
    const countGap=Math.max(0,minimum-count),stageCountGap=future?0:Math.max(0,countGap-(now?data.pending.length:0));
    const uncovered=future?0:Math.max(0,deficit-(now?data.inprogress:0));
    return {deficit,uncovered,countGap,stageCountGap,status:future?'暂不审查':uncovered||stageCountGap?'×':deficit||countGap?'在修覆盖':'√'};
  };
  const moduleResults=[];
  for(const m of plan.modules){
    const data=grouped(m.groups,m.course_scope),check=phaseCheck(m.required,data,dueFor(m),m.phase,m.minimum_courses||0);
    const children=(m.children||[]).map(child=>{
      const childData=grouped(child.groups,m.course_scope),childCheck=phaseCheck(child.required,childData,dueFor(child,child.groups),m.phase,child.minimum_courses||0);
      recordAudit.mark(childData.courses,`模块：${m.name}/${child.name}`,childCheck.status!=='暂不审查');
      return {...child,...childData,...childCheck};
    });
    recordAudit.mark(data.courses,`模块：${m.name}`,check.status!=='暂不审查');
    const childDeficit=children.reduce((n,c)=>n+c.deficit,0),childUncovered=children.reduce((n,c)=>n+c.uncovered,0);
    check.deficit=Math.max(check.deficit,childDeficit);check.uncovered=Math.max(check.uncovered,childUncovered);
    if(children.some(c=>c.status==='×')||check.uncovered||check.stageCountGap)check.status='×';
    else if(children.some(c=>c.status==='在修覆盖')&&check.status!=='暂不审查')check.status='在修覆盖';
    const result={...m,...data,...check,children,gap:check.deficit};
    moduleResults.push(result);
    if(check.uncovered)electiveIssues.push(`${m.name}差${check.uncovered}学分`);
    if(check.stageCountGap)electiveIssues.push(`${m.name}差${check.stageCountGap}门有效通过课程`);
    for(const child of children)if(child.stageCountGap)electiveIssues.push(`${m.name}/${child.name}差${child.stageCountGap}门有效通过课程`);
  }
  // 修读记录与已获学分独立：去重后的失败/在修记录只用于结业、肄业分类。
  const coveredCodes=new Set(all.filter(passed).map(c=>c.code)),coveredNames=new Set(all.filter(passed).flatMap(c=>[normalize(c.name),...normalize(c.replacement).replace(/^(?:被替代课程|替代课程):/,'').split(/[,，、;；]/)]));
  const owner=new Map(),extras=new Map();
  for(const c of all)if(plan.courses.some(p=>p.nature==='必修'&&matches(c,p))||plan.repetitions.some(r=>r.codes.includes(c.code)||(r.names||[]).some(n=>normalize(n)===normalize(c.name))))owner.set(c.code||normalize(c.name),'required');
  const ordered=[...moduleResults].sort((a,b)=>(a.kind==='surplus'?1:0)-(b.kind==='surplus'?1:0));
  for(const m of ordered){
    const map=new Map();
    for(const c of m.courses){
      if(!hasRead(c)||coveredCodes.has(c.code)||coveredNames.has(normalize(c.name)))continue;
      const key=c.code||normalize(c.name);if(owner.has(key)&&owner.get(key)!==m.id)continue;owner.set(key,m.id);
      if(!map.has(key)||map.get(key).credits<c.credits)map.set(key,c);
    }
    extras.set(m.id,[...map.values()]);
  }
  const overflows=new Map();
  for(const m of moduleResults){
    m.recorded=m.credited+sum(extras.get(m.id)||[]);
    if(m.overflow_to){const increment=Math.max(0,m.recorded-m.required)-Math.max(0,m.credited-m.required);overflows.set(m.overflow_to,(overflows.get(m.overflow_to)||0)+increment);}
  }
  const creditHistory=[];
  for(const m of moduleResults){
    m.recorded+=overflows.get(m.id)||0;
    const childMissing=[];
    for(const child of m.children){
      const extraRecords=(extras.get(m.id)||[]).filter(c=>student.sections.some(sec=>groupIs(sec.group,child.groups)&&sec.courses.includes(c)));
      const recorded=child.credited+sum(extraRecords),gap=Math.max(0,child.required-recorded);
      creditHistory.push({group:`${m.name}/${child.name}`,required:child.required,credited:child.credited,recorded,gap,evidence:extraRecords.map(recordText).join('；')});childMissing.push(gap);
      if(gap)historyMissing.push(`${m.name}/${child.name}缺${gap}学分修读记录`);
      const recordedCount=distinct(child.courses.filter(hasRead)).length+(child.waived>=child.required&&child.required>0?(child.minimum_courses||0):0);
      if(recordedCount<(child.minimum_courses||0))historyMissing.push(`${m.name}/${child.name}缺${child.minimum_courses-recordedCount}门修读记录`);
    }
    m.record_gap=Math.max(Math.max(0,m.required-m.recorded),childMissing.reduce((a,b)=>a+b,0));
    const historyCount=distinct(m.courses.filter(hasRead)).length+(m.waived>=m.required&&m.required>0?(m.minimum_courses||0):0);
    if(historyCount<(m.minimum_courses||0))historyMissing.push(`${m.name}缺${m.minimum_courses-historyCount}门修读记录`);
    if(m.required>m.recorded)historyMissing.push(`${m.name}要求${m.required}学分，只有${m.recorded}学分修读/认可记录，差${m.required-m.recorded}学分记录`);
    creditHistory.push({group:m.name,required:m.required,credited:m.credited,recorded:m.recorded,gap:m.record_gap,evidence:[...(extras.get(m.id)||[]).map(recordText),overflows.get(m.id)?`另有${overflows.get(m.id)}学分新增修读溢出，仅用于区分有无修读记录`:null].filter(Boolean).join('；')});
  }
  const flagResults=plan.flags.filter(f=>f.required!==false).map(f=>{
    const value=f.keys.map(key=>extra[key]??student.flags[key]).find(v=>v!==undefined&&v!==null&&String(v)!=='');
    const ok=f.kind==='minimum'?Number.isFinite(Number(value))&&Number(value)>=f.minimum:value==='√'||value===true||String(value||'').startsWith('是');
    return {...f,value:value??'未提供',ok};
  });
  const allPassed=!requiredIssues.length&&!electiveIssues.length&&flagResults.every(f=>f.ok);
  const stage=final?(allPassed?'毕业':historyMissing.length?'肄业':'结业'):(allPassed?'√':'×');
  const outstanding=[...requiredIssues,...electiveIssues,...flagResults.filter(f=>!f.ok).map(f=>`${f.name}：${f.value}`)];
  const roleModules=role=>moduleResults.filter(m=>m.role===role),roleValue=(role,key)=>roleModules(role).reduce((n,m)=>n+(m[key]||0),0);
  const general=roleModules('general')[0];
  const generalValues=Object.fromEntries((general?.children||[]).map(c=>[c.name,c.credited]));
  const history={missing_records:historyMissing,course_rows:courseHistory,credit_rows:creditHistory};
  const {labor,labor_hours,...baseStudent}=student;
  return {...baseStudent,record_audit:recordAudit.finish(),schema_version:2,rule_meta:{cohort_year:plan.cohort_year,major:plan.major,source:plan.source,sources:plan.sources},audit_mode:final?'final':'term',track,mandatory,module_results:moduleResults,flag_results:flagResults,module_rows:moduleResults.filter(m=>m.role==='other').map(m=>({group:m.name,required:m.required,earned:m.earned,waived:m.waived,inprogress:m.inprogress,deficit:m.deficit,uncovered:m.uncovered,status:m.status,page:m.page})),required_ok:!requiredIssues.length,required_issues:requiredIssues,elective_issues:electiveIssues,now_mandatory:mandatory.filter(c=>c.state==='本学期在修'),general_values:generalValues,general_total:roleValue('general','credited'),general_gap:roleValue('general','uncovered'),general_total_gap:general?Math.max(0,general.required-general.credited):0,general_text:roleModules('general').filter(m=>m.uncovered).map(m=>`${m.name}差${m.uncovered}学分`).join('；'),personal:roleValue('personal','credited'),personal_gap:roleValue('personal','uncovered'),cross:roleValue('cross','credited'),cross_gap:roleValue('cross','uncovered'),swim:flagResults.find(f=>f.id==='swim')?.value??'不适用',english:flagResults.find(f=>f.id==='english')?.value??'不适用',notes,stage,read_history:final?history:null,outcome_reason:final?(allPassed?'所选培养规则的全部课程、学分及专项要求合格':historyMissing.length?historyMissing.join('；'):'修读记录齐全，仍有未合格/在修或专项缺口。'+outstanding.join('；')):allPassed?'满足所选学期及培养规则要求':outstanding.join('；')};
}
