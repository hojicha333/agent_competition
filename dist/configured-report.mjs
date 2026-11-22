import {normalize,planLabel} from './rule-schema.mjs?v=20261104-rows1';
import {courseCheckHeaders,courseCheckValues,phaseCourseChecks} from './course-checks.mjs?v=20261104-rows1';
import {describeUnmatched,graduationScope,recommendationScope} from './review.mjs';
export function moduleColumns(students){
  const result=new Map();for(const s of students)for(const m of s.module_results||[])if(m.show_in_summary)result.set(normalize(m.name),{key:normalize(m.name),name:m.name,role:m.role});return [...result.values()];
}
export function flagColumns(students){const result=new Map();for(const s of students)for(const f of s.flag_results||[])result.set(normalize(f.name),{key:normalize(f.name),name:f.name});return [...result.values()];}
export const studentModule=(s,column)=>(s.module_results||[]).find(m=>normalize(m.name)===column.key);
export const studentFlag=(s,column)=>(s.flag_results||[]).find(f=>normalize(f.name)===column.key);
export function skippedScopeNote(data){
  return describeUnmatched(data.skipped_students||[])||null;
}
export function configuredWorkbookRows(data,sortStudents){
  const final=data.term==='all',recommendation=data.mode==='recommendation',students=sortStudents(data.students),modules=moduleColumns(students),flags=flagColumns(students),selection=data.rule_selection;
  const batch=Array.isArray(data.applied_plans);
  const label=batch?'按年级和专业自动匹配':selection?.grade_name||'所选培养规则',version=selection?.revision??0;
  const summary=[['姓名','学号','专业','审查判断',...courseCheckHeaders(data.term),...modules.map(m=>m.name),...flags.map(f=>f.name),'其他限选/指定课',...modules.flatMap(m=>[`${m.name}已获/认可`,`${m.name}阶段缺口`]),...(!final?['此前课程问题','本学期课程问题']:[]),'必修/计次问题','限选及实践问题','判断依据','采用培养规则',batch?'培养方案来源':'规则库版本','补充说明','来源页码']];
  const courses=[['姓名','学号','专业','模块','课程代码','课程名称','学分','应修/记录学期','审查状态','成绩/备注依据','来源']];
  const credits=[['姓名','学号','专业','模块','要求学分','已获/认可','豁免学分','在修学分','本阶段需补','子模块/最低门数要求','判定','来源']];
  const history=[['姓名','学号','专业','核对项目','要求数量/学分','已通过/认可','有修读记录','缺修读记录','单位','记录依据']];
  for(const s of students){
    const majorRule=selection?.majors.find(m=>m.major===s.major);
    const checks=phaseCourseChecks(s,data.term);
    const applied=batch?[planLabel(s.rule_meta),s.rule_meta.source]:[majorRule?`${label} / ${majorRule.name} v${majorRule.version}`:label,version];
    summary.push([s.name,s.sid,s.major,s.stage,...courseCheckValues(s,data.term),...modules.map(col=>{const m=studentModule(s,col);return m?m.status==='×'?'×':'√':'不适用';}),...flags.map(col=>{const f=studentFlag(s,col);return f?f.ok?'√':String(f.value):'不适用';}),s.elective_issues.length?'×':'√',...modules.flatMap(col=>{const m=studentModule(s,col);return m?[m.credited,m.uncovered]:[null,null];}),...(!final?[checks.previous_issues.join('\n')||'无',checks.current_issues.join('\n')||'无']:[]),s.required_issues.join('\n')||'无',s.elective_issues.join('\n')||'无',s.outcome_reason,...applied,s.notes.join('\n'),`${s.file} 第${s.start_page}-${s.end_page}页`]);
    for(const c of s.mandatory)courses.push([s.name,s.sid,s.major,c.category,c.code,c.name,c.credits,c.schedule,c.state,c.evidence,c.page?`${s.file} 第${c.page}页`:'无课程记录']);
    const seen=new Set();
    for(const m of s.module_results){
      credits.push([s.name,s.sid,s.major,m.name,m.required,m.credited,m.waived,m.inprogress,m.uncovered,[m.minimum_courses?`至少${m.minimum_courses}门`:null,...m.children.map(c=>`${c.name}至少${c.required}学分${c.minimum_courses?'、'+c.minimum_courses+'门':''}`)].filter(Boolean).join('；'),m.status,m.page?`${s.file} 第${m.page}页`:'缺模块记录']);
      for(const child of m.children)credits.push([s.name,s.sid,s.major,`${m.name}/${child.name}`,child.required,child.credited,child.waived,child.inprogress,child.uncovered,child.minimum_courses?`至少${child.minimum_courses}门`:'',child.status,child.page?`${s.file} 第${child.page}页`:'缺模块记录']);
      for(const c of m.courses){const key=JSON.stringify([c.code,c.year,c.semester,c.page]);if(seen.has(key)||!c.score&&['未修',''].includes(c.remark))continue;seen.add(key);courses.push([s.name,s.sid,s.major,m.name,c.code,c.name,c.credits,`${c.year}-${c.semester}`,c.remark||'有成绩',`${c.score} ${c.remark} ${c.replacement}`,`${s.file} 第${c.page}页`]);}
    }
    if(s.read_history){for(const c of s.read_history.course_rows)history.push([s.name,s.sid,s.major,`${c.name}（${c.code}）`,c.required,c.passed,c.recorded,c.gap,c.unit,c.evidence]);for(const m of s.read_history.credit_rows)history.push([s.name,s.sid,s.major,m.group,m.required,m.credited,m.recorded,m.gap,'学分',m.evidence]);}
  }
  const rules=[['项目','审查口径','来源'],['采用规则',`${label}，规则库版本${version}；审查范围${final?'本科全部要求':data.term}`,'本次选择'],['总判断',final?'全部合格为毕业；修读记录齐全但未合格/在修/专项未达标为结业；课程或模块学分修读记录不足为肄业。':'满足所选学期及培养方案显示√，否则×。','用户设定'],...(!final?[['课程分列','此前列核对所选学期之前应修课程及截至该学期的计次通过要求；本学期列核对本学期应修课程已通过或明确在修。未到学期课程暂缓；无对应应修课程显示√。学分模块与专项仍在各自列检查。','本次审查范围']]:[]),['范围','只检查所选专业规则中存在的课程、模块、次数和专项；已删除模块不再审查。','所选规则'],['计次与替代','按每条规则自己的代码、名称别名、次数及去重方式检查；系统明确的校内被替代认可通过。','所选规则'],['数据','学生PDF与Excel仅在浏览器内处理；共享规则库只保存培养方案和默认设置。','网站运行方式']];
  if(data.mode){
    rules.splice(2,rules.length-2,
      ['范围',recommendation?recommendationScope:graduationScope,'本次选择'],
      ['核查提示','结果供人工复核，正式资格以学校和学院认定为准。','初赛演示'],
      ['数据','修业 PDF 与 Excel 仅在浏览器内处理。','网站运行方式']);
    for(const row of summary.slice(1))row[3]=['毕业','√'].includes(row[3])?'达到本次规则':'待复核';
  }
  if(batch)rules[1]=['采用规则',`${label}，本次采用${data.applied_plans.length}份方案。审查范围：${final?'本科全部要求':data.term}`,'本次匹配'];
  for(const p of data.applied_plans||Object.values(data.plans)){
    const rule=planLabel(p);
    rules.push([rule,`入学年级${p.cohort_year}；来源${p.source}`,p.source]);
    for(const m of recommendation?[]:p.modules)rules.push([`${rule}/${m.name}`,`最低${m.required}学分；对应修业分组：${m.groups.join('、')}；${m.course_scope==='listed'?'仅列出课程及明确替代':'按教务认可学分'}；${m.children.map(c=>`${c.name}≥${c.required}`).join('；')}`,m.source?`${m.source} 第${m.page}页`:'已保存规则']);
    for(const r of recommendation?[]:p.repetitions)rules.push([`${rule}/${r.name}`,`要求${r.required_count}次，每次${r.credits_per_attempt}学分；代码${r.codes.join('、')}；名称别名${r.names.join('、')}`,'已保存规则']);
    for(const note of p.notes||[])rules.push([`${rule}/文字提示`,`${note.text}\n识别说明：${note.binding||'原文保留供参考'}`,`${note.source} 第${note.page}页`]);
    for(const source of p.sources||[])rules.push([`${rule}/规则文件`,source.name,source.type==='standard'?'毕业标准':'培养计划']);
  }
  const unmatched=skippedScopeNote(data);
  if(unmatched)rules.push(['未匹配及跳过说明',unmatched,'本次修业记录与培养方案']);
  const skippedRows=sortStudents(data.skipped_students||[]).map(s=>[s.name,s.sid,s.cohort||'未识别',s.major,s.cohort?'未导入该年级与专业的方案':'未识别入学年级',`${s.file} 第${s.start_page}-${s.end_page}页`]);
  return [
    {name:'审查汇总',title:`${recommendation?'推免学业审查':'毕业预审'}　${label}　${final?'本科全部要求':data.term}`,rows:summary,widths:[12,19,25,16,...(final?[14]:[27,29]),...modules.map(()=>16),...flags.map(()=>16),22,...modules.flatMap(()=>[20,20]),...(!final?[82,82]:[]),82,82,95,32,batch?43:16,76,50]},
    {name:'课程审查明细',title:'按所选规则核对课程',rows:courses,widths:[12,19,25,30,25,58,12,24,28,95,55]},
    ...(recommendation?[]:[{name:'学分明细',title:'所选培养方案的模块要求与缺口',rows:credits,widths:[12,19,25,38,18,20,18,18,20,82,20,55]}]),
    {name:'审查说明',title:'采用规则、来源及逐行文字处理',rows:rules,widths:[40,135,70]},
    ...(batch&&skippedRows.length?[{name:'未匹配',title:'未匹配培养方案的学生',rows:[['姓名','学号','入学年级','专业','跳过原因','来源页码'],...skippedRows],widths:[12,19,15,30,45,50]}]:[]),
    ...(final?[{name:'修读记录核对',title:'区分未修读与已修读但未合格',rows:history,widths:[12,19,25,65,20,20,20,20,10,115]}]:[])
  ];
}
