import {createRecordAudit} from './record-audit.mjs?v=20261104-rows1';
// 基于2023级三专业计划及用户补充的成绩、替代和计次规则；学生数据仅存在浏览器内存中。
import {compareAuditTerms as compareTerm,FULL_AUDIT} from './terms.mjs?v=20261104-rows1';
import {auditConfiguredStudent} from './configured-audit.mjs?v=20261104-rows1';
export const GENERAL=['人文学科','社会科学','自然科学','艺术修养','工程科学与技术'];
const PE_CODES=new Set(['KE1201','KE1202','KE2201','KE2202']);
const INTERNSHIP_CODES=new Set(['ICE3324','EST3322','MST3312']);
const MAJORS=['信息工程','电子科学与技术','微电子科学与工程'];
const codeRE=/^[A-Z]{2,}\d+[A-Z0-9]*$/;
const headingRE=/^(\S+)\s+要求最低(\d+(?:\.\d+)?)分\s+获得(\d+(?:\.\d+)?)分$/;
const clean=s=>String(s??'').replace(/\s+/g,'');
const norm=s=>clean(String(s??'').normalize('NFKC')).replaceAll('Ⅰ','I').replaceAll('Ⅱ','II');
const num=s=>/^\d+(?:\.\d+)?$/.test(clean(s))?Number(clean(s)):null;
const term=c=>c.year&&c.semester?[Number(c.year.slice(0,4)),c.semester]:null;
const sameTerm=(a,b)=>a&&b&&compareTerm(a,b)===0;
const order=(a,b)=>Math.round(a.cy*10)-Math.round(b.cy*10)||a.x0-b.x0;
export function pdfItems(content,height){
  return content.items.filter(t=>t.str?.trim()).map(t=>({text:t.str.trim(),x0:t.transform[4],x1:t.transform[4]+t.width,cy:height-t.transform[5]-t.height*.38,height:t.height}));
}
function cell(items,x0,x1,lo,hi,spaces=false){return items.filter(i=>i.x0>=x0-.5&&(i.x0+i.x1)/2<x1&&i.cy>=lo&&i.cy<hi).sort(order).map(i=>i.text).join(spaces?' ':'').trim();}
function lines(items){
  const groups=[];
  for(const i of [...items].sort(order)){
    let g=groups.find(g=>Math.abs(g.cy-i.cy)<1.6);
    if(!g){g={cy:i.cy,items:[]};groups.push(g);}g.items.push(i);
  }
  return groups.sort((a,b)=>a.cy-b.cy).map(g=>({...g,text:g.items.sort((a,b)=>a.x0-b.x0).map(i=>i.text).join(' ')}));
}
export class StudentParser{
  constructor({majors=MAJORS}={}){this.majors=[...majors];this.students=[];this.skipped=[];this.student=null;this.section=null;this.summaryMode=false;this.transferMode=false;this.skipping=false;this.skippedStudent=null;}
  startFile(name){this.filename=name;this.student=null;this.section=null;this.summaryMode=false;this.transferMode=false;this.skipping=false;this.skippedStudent=null;}
  page(items,pn,width=595){
    if(Math.abs(width-595)>5) throw new Error(`${this.filename} 第${pn}页：PDF版式与当前教务导出格式不同，请使用原始修业情况PDF。`);
    if(!items.length)throw new Error(`${this.filename} 第${pn}页没有可提取文字，扫描件需先识别文字。`);
    if(items.some(i=>i.text==='学生信息')){
      const name=cell(items,110,250,50,85,true).replace(/^姓名\s*[:：]\s*/,'').replace(/\s+/g,' ').trim();
      const sid=cell(items,110,250,85,105).match(/学号[:：]\s*(\d+)/)?.[1];
      const majorText=clean(cell(items,350,445,50,85));
      const majorName=norm(majorText).replace(/^专业(?:名称)?[:：]?/,'');
      const major=this.majors.find(m=>norm(m)===majorName);
      const cohort=cell(items,250,340,85,105).match(/年级[:：]\s*(\d{4})/)?.[1]||'';
      const enrollment=cell(items,225,335,100,120).replace(/^学籍状态[:：]\s*/,'').trim();
      if(!name||!sid||!majorName)throw new Error(`${this.filename} 第${pn}页：无法完整识别姓名、学号或专业。`);
      this.skipping=!major;this.section=null;this.summaryMode=false;this.transferMode=false;this.skippedStudent=null;
      if(this.skipping){
        this.student=null;this.skippedStudent={name,sid,major:majorName,file:this.filename,start_page:pn,end_page:pn};this.skipped.push(this.skippedStudent);return;
      }
      this.student={name,sid,major,cohort,enrollment,file:this.filename,start_page:pn,end_page:pn,sections:[],summary:[],transfers:[],flags:{},warnings:[]};
      this.students.push(this.student);this.section=null;this.summaryMode=true;this.transferMode=false;
    }
    if(this.skipping){this.skippedStudent.end_page=pn;return;}
    const s=this.student;
    if(!s)throw new Error(`${this.filename} 第${pn}页缺少学生信息，无法关联学生。`);
    s.end_page=pn;
    const ls=lines(items);
    const headings=ls.map(l=>({...l,match:l.text.match(headingRE)})).filter(l=>l.match);
    const firstHeading=headings[0]?.cy??Infinity;
    if(this.summaryMode){
      const markers=items.filter(i=>i.x0>510&&['√','×'].includes(i.text)&&i.cy<firstHeading).sort(order);
      for(let j=0;j<markers.length;j++){
        const m=markers[j],cy=m.cy;
        const required=num(cell(items,300,367,cy-2,cy+2));
        const earned=num(cell(items,367,433,cy-2,cy+2));
        const waived=num(cell(items,433,500,cy-2,cy+2));
        const lo=Math.max(cy-19,j?(markers[j-1].cy+cy)/2:0);
        const hi=Math.min(cy+19,j+1<markers.length?(markers[j+1].cy+cy)/2:cy+19);
        const parent=clean(cell(items,29,121,lo,hi));
        const group=clean(cell(items,210,300,cy-2,cy+2)||cell(items,121,210,cy-2,cy+2)||parent);
        if(required!==null){
          if(earned===null||waived===null)throw new Error(`${s.sid} 第${pn}页模块学分不完整。`);
          s.summary.push({parent,group,required,earned,waived,mark:m.text,page:pn});
        }else if(parent)s.flags[parent]=m.text;
      }
    }
    const anchors=items.filter(i=>i.x0<105&&codeRE.test(i.text)).sort(order);
    const events=[...headings.map(l=>({cy:l.cy,kind:'section',value:l.match})),...anchors.map(i=>({cy:i.cy,kind:'course',value:i})),...ls.filter(l=>l.text==='个性化课程修读情况').map(l=>({cy:l.cy,kind:'transfer'}))].sort((a,b)=>a.cy-b.cy);
    for(const event of events){
      if(event.kind==='section'){
        const [,group,required,earned]=event.value;
        this.section={group,required:Number(required),earned:Number(earned),page:pn,courses:[]};
        s.sections.push(this.section);this.summaryMode=false;this.transferMode=false;
      }else if(event.kind==='transfer'){this.transferMode=true;}
      else{
        const a=event.value;
        if(!this.section||this.transferMode)throw new Error(`${s.sid} 第${pn}页课程${a.text}没有有效分组。`);
        const idx=anchors.indexOf(a),cy=a.cy;
        const lo=Math.max(cy-15,idx?(anchors[idx-1].cy+cy)/2:0);
        const hi=Math.min(cy+15,idx+1<anchors.length?(anchors[idx+1].cy+cy)/2:Infinity);
        const name=clean(cell(items,103,249,lo,hi));
        const year=clean(cell(items,249,298,cy-4,cy+5));
        const sem=clean(cell(items,298,322,cy-4,cy+5));
        const credits=num(cell(items,322,346,cy-4,cy+5));
        const score=clean(cell(items,346,371,lo,hi));
        const remark=clean(cell(items,371,468,cy-4,cy+5));
        const replacement=clean(cell(items,468,565,lo,hi));
        if(credits===null||(year&&!/^\d{4}-\d{4}$/.test(year)))throw new Error(`${s.sid} 第${pn}页课程${a.text}无法解析学分或学期。`);
        this.section.courses.push({code:a.text,name,year,semester:/^\d+$/.test(sem)?Number(sem):null,credits,score,remark,replacement,page:pn});
      }
    }
    if(this.transferMode){
      const marker=ls.find(l=>l.text==='个性化课程修读情况')?.cy??0;
      for(const l of ls.filter(l=>l.cy>marker&&!l.text.includes('学分来源'))){
        const m=l.text.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
        if(m)s.transfers.push({group:clean(m[1]),credits:Number(m[2]),raw:m[2],page:pn});
      }
    }
  }
  finish(){
    const seen=new Set();
    for(const s of this.students){if(seen.has(s.sid))throw new Error(`重复学号 ${s.sid}（${s.name}）。请勿同时上传同一学生的多个版本。`);seen.add(s.sid);}
    if(!this.students.length&&!this.skipped.length)throw new Error('未识别到学生，请上传教务系统导出的学生修业情况PDF。');
    return this.students;
  }
}
export function passed(c){
  const r=norm(c.remark),s=norm(c.score).toUpperCase();
  if((INTERNSHIP_CODES.has(c.code)||['专业实习','生产实习'].some(name=>norm(c.name).startsWith(name)))&&norm(s)==='P')return true;
  // 替代认定可覆盖原课程曾经不及格的成绩；其最终状态已由系统确认。
  if(r.includes('校内被替代'))return true;
  if(['未修','在修','需要重修','未通过','不通过','不及格','挂科'].some(v=>r.includes(v)))return false;
  if(/^[△×]/.test(s)||/^F[+-]?$/.test(s)||['NP','U','不及格','不合格','不通过','未通过','缓','缓考','缺','缺考'].includes(s))return false;
  const numeric=num(s);
  if(numeric!==null)return numeric>=60;
  if(['合格','及格','优秀','良好','中等'].includes(s)||/^[A-EPS][+-]?$/.test(s))return true;
  return !r.includes('已重修或补考')&&r.includes('√');
}
function pePassed(c){
  return passed(c);
}
function effectivePass(c,all){
  return passed(c);
}
const policyName=c=>/^形势与政策(?:\([^()]+\))?$/.test(norm(c.name));
export function hasReadRecord(c){
  return passed(c)||Boolean(norm(c.score))||/在修|需要重修|已重修|补考|缺考|认定|替代|已修/.test(norm(c.remark));
}
export function policyAttempts(courses,plan){
  const records=courses.filter(c=>c.code===plan.policy_code||c.code==='TH020'||policyName(c));
  const key=c=>term(c)?.join('-')||`${c.code}:${c.page}`;
  const originals=new Map(),replaced=new Map();
  for(const c of records){
    if(!passed(c))continue;
    if(c.remark.includes('校内被替代')){
      // 一行可汇总多个被认可的修读次数；与原修读记录取较大值，不能重复叠加。
      const names=norm(c.replacement).replace(/^替代课程:/,'').split(/[,，、;；]/).filter(n=>policyName({name:n}));
      const count=Math.max(1,names.length),previous=replaced.get(key(c));
      if(!previous||previous.count<count)replaced.set(key(c),{course:c,count});
    }else if(!originals.has(key(c)))originals.set(key(c),c);
  }
  const replacementCount=[...replaced.values()].reduce((v,r)=>v+r.count,0);
  return {count:Math.max(originals.size,replacementCount),originals:[...originals.values()],replacements:[...replaced.values()],records};
}
function readHistory(s,plan){
  const all=s.sections.flatMap(sec=>sec.courses),missing=[],rows=[],courseRows=[];
  const description=c=>`${c.code} ${c.name} ${c.score||'无成绩'} ${c.remark||'无备注'}`;
  for(const c of s.mandatory){
    if(c.name==='体育模块（4次）'||c.name==='形势与政策（4次）')continue;
    const records=all.filter(r=>r.code===c.code&&hasReadRecord(r));
    courseRows.push({name:c.name,code:c.code,required:1,passed:c.state.startsWith('已通过')?1:0,recorded:records.length?1:0,gap:records.length?0:1,unit:'门',evidence:records.map(description).join('；')||'只有未修占位或无课程记录'});
    if(!records.length)missing.push(`${c.name}（${c.code}）没有修读记录`);
  }
  const specific=new Set([...(plan.special_tracks[s.track]||[]),...(s.major==='微电子科学与工程'?[]:s.track==='卓工'?['EE0503','ICE3513','ICE3519']:['EE0503','ICE2502','ICE3505'])]);
  for(const code of specific)if(!s.mandatory.some(c=>c.code===code)){
    const records=all.filter(c=>c.code===code&&hasReadRecord(c));
    courseRows.push({name:'培养类型指定课程',code,required:1,passed:records.some(passed)?1:0,recorded:records.length?1:0,gap:records.length?0:1,unit:'门',evidence:records.map(description).join('；')||'没有修读记录'});
    if(!records.length)missing.push(`培养类型指定课程${code}没有修读记录`);
  }
  const pe=new Map();
  for(const c of all)if(PE_CODES.has(c.code)&&hasReadRecord(c))pe.set(JSON.stringify([c.code,c.year,c.semester]),c);
  if(pe.size<4)missing.push(`体育只有${pe.size}次修读记录，差${4-pe.size}次`);
  courseRows.push({name:'体育模块',code:[...PE_CODES].join('/'),required:4,passed:[...pe.values()].filter(pePassed).length,recorded:pe.size,gap:Math.max(0,4-pe.size),unit:'次',evidence:[...pe.values()].map(description).join('；')});
  const policyRead=policyAttempts(all.filter(hasReadRecord).map(c=>({...c,score:'P',remark:c.remark.includes('校内被替代')?'校内被替代':'√'})),plan).count;
  if(policyRead<plan.policy_passes)missing.push(`形势与政策只有${policyRead}次修读记录，差${plan.policy_passes-policyRead}次`);
  courseRows.push({name:'形势与政策',code:plan.policy_code,required:plan.policy_passes,passed:policyAttempts(all,plan).count,recorded:policyRead,gap:Math.max(0,plan.policy_passes-policyRead),unit:'次',evidence:'按不同学期累计，新旧代码合并，替代汇总不重复计次'});
  // 已认可学分（含替代、豁免和已分配溢出）直接保留；只增加尚未通过的真实修读记录。
  // 已通过同代码/同名课的旧失败记录不再增加学分，避免重修和替代重复累计。
  const coveredCodes=new Set(),coveredNames=new Set();
  for(const c of all.filter(passed)){
    coveredCodes.add(c.code);coveredNames.add(norm(c.name));
    for(const name of norm(c.replacement).replace(/^(?:被替代课程|替代课程):/,'').split(/[,，、;；]/))if(name)coveredNames.add(name);
  }
  const bucket=g=>g.includes('交叉')?'交叉合计':g==='个性化教育'?'个性化合计':GENERAL.includes(g)?`通识/${g}`:g;
  const rank=g=>g==='必修'?0:s.module_rows.some(m=>m.group===g)?1:GENERAL.includes(g)?2:g.includes('交叉')?3:g==='个性化教育'?4:5;
  const owner=new Map(),additional=new Map();
  for(const sec of [...s.sections].sort((a,b)=>rank(a.group)-rank(b.group))){
    const group=bucket(sec.group);
    for(const c of sec.courses){
      if(!hasReadRecord(c)||coveredCodes.has(c.code)||coveredNames.has(norm(c.name)))continue;
      const key=c.code||norm(c.name);
      if(owner.has(key)&&owner.get(key)!==group)continue;
      owner.set(key,group);
      const map=additional.get(group)||new Map();
      if(!map.has(key)||map.get(key).credits<c.credits)map.set(key,c);
      additional.set(group,map);
    }
  }
  const extra=group=>[...(additional.get(group)?.values()||[])].reduce((sum,c)=>sum+c.credits,0);
  const evidence=group=>[...(additional.get(group)?.values()||[])].map(description).join('；');
  const add=(group,required,credited,recorded,why='')=>{
    const gap=Math.max(0,required-recorded);
    rows.push({group,required,credited,recorded,gap,evidence:why});
    if(gap)missing.push(`${group}要求${required}学分，只有${recorded}学分修读/认可记录，差${gap}学分记录`);
    return Math.max(0,recorded-required)-Math.max(0,credited-required);
  };
  let overflow=0;
  for(const m of s.module_rows)overflow+=add(m.group,m.required,m.earned+m.waived,m.earned+m.waived+extra(m.group),evidence(m.group));
  const generalRecorded={};
  for(const g of GENERAL){
    const group=`通识/${g}`,credited=s.general_values[g];generalRecorded[g]=credited+extra(group);
    add(group,g==='工程科学与技术'?0:2,credited,generalRecorded[g],evidence(group));
  }
  overflow+=add('通识合计',plan.general_credits,s.general_total,Object.values(generalRecorded).reduce((a,b)=>a+b,0),'通识总量与四模块分布分别核对，学分不重复相加');
  overflow+=add('交叉合计',plan.cross_credits,s.cross,s.cross+extra('交叉合计'),evidence('交叉合计'));
  // 只计算新增修读记录超过原模块最低要求的部分；已认可的溢出已含在个性化中。
  const transferGroups=new Set(s.transfers.map(t=>t.group));
  for(const sec of s.sections)if(transferGroups.has(sec.group)&&!GENERAL.includes(sec.group)&&!sec.group.includes('交叉')&&!s.module_rows.some(m=>m.group===sec.group)&&sec.group!=='个性化教育'){
    overflow+=Math.max(0,sec.earned+extra(sec.group)-sec.required)-Math.max(0,sec.earned-sec.required);
  }
  add('个性化合计',plan.personal_credits,s.personal,s.personal+extra('个性化合计')+overflow,[evidence('个性化合计'),overflow?`另有${overflow}学分新增修读记录可形成溢出（仅用于区分修读记录是否齐全，不算已获学分）`:null].filter(Boolean).join('；'));
  return {missing_records:missing,course_rows:courseRows,credit_rows:rows,pe_recorded:pe.size,policy_recorded:policyRead};
}
function currentCourses(courses,current,all){
  const done=new Set(courses.filter(c=>effectivePass(c,all)).map(c=>c.code));
  return [...new Map(courses.filter(c=>(current===FULL_AUDIT||sameTerm(term(c),current))&&c.remark.includes('在修')&&!done.has(c.code)).map(c=>[c.code,c])).values()];
}
export function auditStudent(student,plan,current,extra={}){
  if(plan?.schema_version===2)return auditConfiguredStudent(student,plan,current,extra,{passed,hasReadRecord});
  const finalAudit=current===FULL_AUDIT;
  const sections=student.sections,all=sections.flatMap(s=>s.courses);
  const issues=[],mandatory=[],module_rows=[],notes=[],requiredCodes=new Set();
  const planCohort=Number(plan.cohort_year||String(plan.source).match(/^\d{4}/)?.[0]||2023);
  const cohort=/^\d{4}$/.test(String(student.cohort))?Number(student.cohort):planCohort;
  const scheduleFor=(definitions,records)=>{
    const dates=[...definitions.map(c=>[cohort+c.grade-1,c.semester]),...records.map(term).filter(Boolean)];
    return dates.length?dates.sort(compareTerm)[0]:null;
  };
  const stagePassForCode=code=>{
    const records=all.filter(c=>c.code===code);
    if(records.some(c=>effectivePass(c,all)))return true;
    if(finalAudit)return false;
    const due=scheduleFor(plan.courses.filter(p=>p.code===code),records);
    if(due&&compareTerm(due,current)>0)return true;
    return (!due||sameTerm(due,current))&&records.some(c=>sameTerm(term(c),current)&&c.remark.includes('在修'));
  };
  for(const p of plan.courses){
    if(p.nature!=='必修'||requiredCodes.has(p.code))continue;
    requiredCodes.add(p.code);if(p.code===plan.policy_code||PE_CODES.has(p.code))continue;
    const candidates=sections.filter(s=>s.group==='必修').flatMap(s=>s.courses).filter(c=>c.code===p.code);
    const schedule=scheduleFor([p],candidates);
    const ok=candidates.some(c=>effectivePass(c,all));
    const now=finalAudit?[]:candidates.filter(c=>sameTerm(term(c),current)&&c.remark.includes('在修'));
    let state;
    if(ok)state='已通过/替代通过';else if(!finalAudit&&compareTerm(schedule,current)>0)state='暂不审查';else if(!finalAudit&&sameTerm(schedule,current)&&now.length)state='本学期在修';else{
      state=candidates.length?'未通过':'缺少课程记录';
      const conflict=candidates.some(c=>c.score&&c.remark==='未修'&&(c.score==='P'||(num(c.score)!==null&&num(c.score)>=60)));
      issues.push(`${p.name}(${p.code}) ${p.credits}学分：${conflict?'有及格成绩但系统备注未修，需核对成绩认定':state}`);
    }
    const selected=candidates.find(c=>effectivePass(c,all))||now[0]||candidates.at(-1);
    mandatory.push({code:p.code,name:p.name,credits:p.credits,state,schedule:`${schedule[0]}-${schedule[0]+1}-${schedule[1]}`,page:selected?.page??null,evidence:selected?`${selected.remark} ${selected.score}`:'培养计划有此必修，修业报告未列出'});
  }
  // 体育1—4合并计次，同一代码不同学期通过可分别计数；同一修读记录不重复计数。
  const peRecords=new Map();
  for(const c of all)if(PE_CODES.has(c.code)&&pePassed(c)){const key=JSON.stringify([c.code,c.year,c.semester]);if(!peRecords.has(key))peRecords.set(key,c);}
  const peAttempts=[...peRecords.values()];
  const pePasses=peAttempts.length,peGap=Math.max(0,4-pePasses);
  if(peGap)issues.push(`体育模块仅通过${pePasses}次，差${peGap}次`);
  const peEvidence=`有效通过${pePasses}次，要求4次；体育1—4合并计次，同一门可重复修读通过；已重修或补考记录数值成绩≥60计次`+(pePasses?'；'+peAttempts.map(c=>`${c.name}(${c.code}) ${c.year}-${c.semester} ${c.score} ${c.remark}`).join('；'):'');
  mandatory.push({code:[...PE_CODES].sort().join('/'),name:'体育模块（4次）',credits:4,state:peGap?'未通过':'已通过',schedule:finalAudit?'本科全部期间':'截至本学期',page:peAttempts[0]?.page??null,evidence:peEvidence});
  const policy=policyAttempts(all,plan),policyCount=policy.count;
  if(policyCount<plan.policy_passes)issues.push(`形势与政策仅通过${policyCount}次，差${plan.policy_passes-policyCount}次/${(plan.policy_passes-policyCount)*.5}学分`);
  const policyEvidence=`不同学期通过${policyCount}次；新旧课程代码合并，替代汇总不重复计次`+(policy.originals.length?'；'+policy.originals.map(c=>`${c.code} ${c.year}-${c.semester} ${c.score} ${c.remark}`).join('；'):'')+(policy.replacements.length?'；替代认定：'+policy.replacements.map(r=>`${r.course.code} ${r.count}次 ${r.course.replacement}`).join('；'):'');
  mandatory.push({code:[...new Set([plan.policy_code,...policy.records.map(c=>c.code)])].sort().join('/'),name:'形势与政策（4次）',credits:2,state:policyCount>=plan.policy_passes?'已通过':'未通过',schedule:finalAudit?'本科全部期间':'截至本学期',page:policy.originals[0]?.page??policy.replacements[0]?.course.page??null,evidence:policyEvidence});
  const requiredGroups=['英语选修','数学一','数学二','物理一','物理二','物理三',...(student.major==='微电子科学与工程'?['专业选修课模块一','专业选修课模块二','A组','B组']:['专业选修课','工程实践与科创'])];
  const elective_issues=[];
  for(const group of requiredGroups){
    const found=sections.filter(s=>s.group===group);
    if(found.length!==1)throw new Error(`${student.sid} 模块缺失或重复：${group}`);
    const sec=found[0],inprogress=currentCourses(sec.courses,current,all).reduce((v,c)=>v+c.credits,0);
    const waived=student.summary.find(r=>r.group===group)?.waived??0;
    const deficit=Math.max(0,sec.required-sec.earned-waived);
    const planGroup=plan.courses.filter(c=>c.group===group);
    const groupDates=planGroup.map(c=>[cohort+c.grade-1,c.semester]).sort(compareTerm);
    const groupDue=groupDates.at(-1);
    const futureGroup=!finalAudit&&groupDue&&compareTerm(groupDue,current)>0;
    const currentGroup=!finalAudit&&groupDue&&sameTerm(groupDue,current);
    const uncovered=futureGroup?0:currentGroup?Math.max(0,deficit-inprogress):deficit;
    const status=deficit===0?'√':futureGroup?'暂不审查':uncovered===0?'在修覆盖':'×';
    if(uncovered)elective_issues.push(`${group}差${uncovered}学分`);
    module_rows.push({group,required:sec.required,earned:sec.earned,waived,inprogress,deficit,uncovered,status,page:sec.page});
  }
  const supplied=String(extra['培养类型']||'').trim();
  const inferred=student.major==='信息工程'&&all.some(c=>['ICE3513','ICE3519'].includes(c.code)&&passed(c))?'卓工':'普通';
  const track=supplied||inferred;
  if(!['普通','卓工','育才'].includes(track))throw new Error(`${student.sid} 培养类型应为普通、卓工或育才。`);
  if(student.major!=='微电子科学与工程'){
    for(const code of track==='卓工'?['EE0503','ICE3513','ICE3519']:['EE0503','ICE2502','ICE3505'])if(!stagePassForCode(code))elective_issues.push(`工程实践分层课程${code}未通过`);
  }
  for(const code of plan.special_tracks[track]||[])if(!stagePassForCode(code))elective_issues.push(`${track}要求课程${code}${finalAudit?'未通过':'未通过且本学期未在修'}`);
  if(!supplied&&inferred==='卓工')notes.push('按已通过卓工专属课程推定卓工培养，请核对');
  const general_values={};
  for(const g of GENERAL){const r=student.summary.find(r=>r.group===g);if(!r)throw new Error(`${student.sid} 通识模块不完整：${g}`);general_values[g]=r.earned+r.waived;}
  const general_total=Object.values(general_values).reduce((a,b)=>a+b,0);
  const general_total_gap=Math.max(0,plan.general_credits-general_total);
  const gaps=Object.fromEntries(GENERAL.slice(0,4).map(g=>[g,Math.max(0,2-general_values[g])]));
  const general_gap=Math.max(general_total_gap,Object.values(gaps).reduce((a,b)=>a+b,0));
  let general_text=Object.entries(gaps).filter(([,v])=>v).map(([g,v])=>`${g}差${v}`).join('；');
  if(general_total_gap)general_text=`总量差${general_total_gap}学分${general_text?'；'+general_text:''}`;
  const personalSecs=sections.filter(s=>s.group==='个性化教育'),personalRows=student.summary.filter(r=>r.group==='个性化教育');
  if(personalSecs.length!==1||personalRows.length!==1||personalSecs[0].earned!==personalRows[0].earned)throw new Error(`${student.sid} 个性化概览与明细缺失或不一致。`);
  const personal=personalRows[0].earned+personalRows[0].waived,personal_gap=Math.max(0,plan.personal_credits-personal);
  const crossRows=student.summary.filter(r=>r.group.includes('交叉'));
  if(!crossRows.length)throw new Error(`${student.sid} 缺少交叉模块。`);
  const cross=crossRows.reduce((a,r)=>a+r.earned+r.waived,0),cross_gap=Math.max(0,plan.cross_credits-cross);
  const swim=student.flags['游泳技能达标测试']||'未提供',english=student.flags['英语水平考']||'未提供';
  if(student.cohort&&Number(student.cohort)!==planCohort)notes.push(`${student.cohort}级培养计划未提供；当前使用${planCohort}级规则并按该生年级换算学年，仅供参考，需核对对应培养计划`);
  const required_ok=!issues.length;
  const fail=!required_ok||general_gap>0||personal_gap>0||cross_gap>0||elective_issues.length>0||[swim,english].includes('×');
  const allPassed=!fail&&[swim,english].every(v=>v==='√');
  const result={...student,audit_mode:finalAudit?'final':'term',track,mandatory,module_rows,required_ok,required_issues:issues,elective_issues,now_mandatory:mandatory.filter(r=>r.state==='本学期在修'),general_values,general_total,general_gap,general_total_gap,general_text,personal,personal_gap,cross,cross_gap,swim,english,notes};
  const outstanding=[...issues,...elective_issues,general_gap?`通识：${general_text}`:null,personal_gap?`个性化差${personal_gap}学分`:null,cross_gap?`交叉差${cross_gap}学分`:null,...[['游泳',swim],['英语水平考',english]].filter(([,v])=>v!=='√').map(([name,value])=>`${name}：${value}`)].filter(Boolean);
  const history=finalAudit?readHistory(result,plan):null;
  result.stage=finalAudit?(allPassed?'毕业':history.missing_records.length?'肄业':'结业'):(allPassed?'√':'×');
  result.read_history=history;
  result.outcome_reason=finalAudit?(allPassed?'全部课程、模块学分和专项要求均合格':history.missing_records.length?history.missing_records.join('；'):'课程和模块学分的修读记录齐全，但仍有未通过、在修或专项未达标/缺记录的项目。'+outstanding.join('；')):(allPassed?'满足所选学期审查要求':outstanding.join('；'));
  delete result.labor;delete result.labor_hours;
  const recordAudit=createRecordAudit(student);
  for(const c of mandatory)recordAudit.mark(all.filter(r=>c.code.split('/').includes(r.code)),`课程：${c.name}`,c.state!=='暂不审查');
  for(const sec of sections){const module=module_rows.find(m=>m.group===sec.group);if(module)recordAudit.mark(sec.courses,`模块：${sec.group}`,module.status!=='暂不审查');else if(GENERAL.includes(sec.group)||sec.group==='个性化教育'||sec.group.includes('交叉'))recordAudit.mark(sec.courses,`模块：${sec.group}`);}
  result.record_audit=recordAudit.finish();
  return result;
}
export function parseCSV(text){
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('补充信息CSV存在未闭合的引号。');
  row.push(value);if(row.some(v=>v.trim()))rows.push(row);
  const headers=(rows.shift()||[]).map(v=>v.replace(/^\uFEFF/,'').trim());
  if(!headers.includes('学号'))throw new Error('补充信息CSV必须包含“学号”列。');
  const result={};for(const row of rows){const item=Object.fromEntries(headers.map((h,i)=>[h,(row[i]||'').trim()]));if(!item['学号']||result[item['学号']])throw new Error('补充信息CSV中的学号缺失或重复。');result[item['学号']]=item;}
  return result;
}
