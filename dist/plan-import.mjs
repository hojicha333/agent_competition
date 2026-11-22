import {normalize,newId} from './rule-schema.mjs?v=20261104-rows1';
export const PLAN_IMPORT_VERSION='20261030-parent1';
const numberPattern='\\d+(?:\\.\\d+)?';
const order=(a,b)=>a.cy-b.cy||a.x0-b.x0;
const lines=items=>{
  const groups=[];
  for(const item of [...items].sort(order)){let line=groups.find(l=>Math.abs(l.cy-item.cy)<1.5);if(!line){line={cy:item.cy,items:[]};groups.push(line);}line.items.push(item);}
  return groups.sort((a,b)=>a.cy-b.cy).map(l=>({...l,text:l.items.sort((a,b)=>a.x0-b.x0).map(i=>i.text).join(' ')}));
};
const cell=(items,x0,x1,lo,hi)=>items.filter(i=>i.x0>=x0-.5&&i.x0<x1&&i.cy>=lo&&i.cy<hi).sort(order).map(i=>i.text).join('');
const headingRegex=new RegExp(`^(\\d+\\.|\\(\\d+\\)|\\d+\\)|[A-Z]\\))(.+?)要求最低学分[:：](${numberPattern})`);
const gradeNumber=s=>({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[s]||Number(s));
const defaultColumns={code:[29,70],name:[70,170],credits:[170,193],grade:[252,283],semester:[283,303],nature:[303,343]};
// 同一表格格式也可能有不同边距、列宽；从表头定位，续页沿用最近的完整表头。
function tableColumns(items){
  const header=items.find(i=>normalize(i.text)==='年级');if(!header)return null;
  const columns=[];
  for(const item of items.filter(i=>Math.abs(i.cy-header.cy)<=29).sort((a,b)=>a.cy-b.cy)){
    const center=(item.x0+item.x1)/2;let column=columns.find(c=>Math.abs(c.center-center)<3);
    if(!column){column={center,items:[]};columns.push(column);}column.items.push(item);
  }
  columns.sort((a,b)=>a.center-b.center);for(const c of columns)c.text=normalize(c.items.sort(order).map(i=>i.text).join(''));
  const find=text=>columns.findIndex(c=>c.text===text),code=find('课程代码'),credit=find('学分'),grade=find('年级'),semester=find('推荐学期'),nature=find('课程性质');
  if([code,credit,grade,semester,nature].some(i=>i<0)||credit+1>=columns.length||grade<1||nature+1>=columns.length)return null;
  const mid=(a,b)=>(columns[a].center+columns[b].center)/2,creditStart=columns[credit].center-(columns[credit+1].center-columns[credit].center)/2;
  const fontHeight=columns[code].items[0].height;
  const codes=items.filter(i=>Math.abs((i.x0+i.x1)/2-columns[code].center)<12&&Math.abs(i.height-fontHeight)<.8&&/^[A-Z]{2,}\d+[A-Z0-9]*$/.test(normalize(i.text)));
  if(!codes.length)return null;
  const codeStart=Math.min(Math.min(...codes.map(i=>i.x0))-2,columns[code].center-fontHeight*3),nameStart=Math.max(...codes.map(i=>i.x1))+1;
  if(nameStart>=creditStart)return null;
  return {fontHeight,code:[codeStart,nameStart],name:[nameStart,creditStart],credits:[creditStart,mid(credit,credit+1)],grade:[mid(grade-1,grade),mid(grade,semester)],semester:[mid(grade,semester),mid(semester,nature)],nature:[mid(semester,nature),mid(nature,nature+1)]};
}
export class PlanParser{
  constructor(name){this.name=name;this.courses=[];this.headings=[];this.notes=[];this.stack=[];this.pages=0;this.major='';this.cohort_year=null;this.warnings=[];this.columns=defaultColumns;}
  page(items,page,width=595){
    if(Math.abs(width-595)>8)throw new Error(`第${page}页尺寸不同于既有培养计划版式，请核对后手动导入规则备份`);
    if(!items.length)throw new Error(`第${page}页没有文字，扫描件需要先识别文字`);
    this.pages++;const ls=lines(items),initialSection=this.stack.filter(Boolean).at(-1);
    this.columns=tableColumns(items)||this.columns;const cols=this.columns;
    const title=ls.map(l=>normalize(l.text)).find(t=>/\d{4}年级.+专业课程设置一览表/.test(t));
    if(title){const match=title.match(/(\d{4})年级(.+?)专业课程设置一览表/);this.cohort_year=Number(match[1]);this.major=match[2];}
    const nature=items.filter(i=>i.x0>=cols.grade[0]&&i.x0<cols.grade[1]&&/^[一二三四五六七八九十]$/.test(normalize(i.text))).sort(order);
    const events=ls.map(l=>({...l,heading:normalize(l.text).match(headingRegex)})).filter(l=>l.heading).map(l=>({cy:l.cy,kind:'heading',line:l}));
    events.push(...nature.map((anchor,index)=>({cy:anchor.cy,kind:'course',anchor,index})));
    const rowRanges=[];
    for(const event of events.sort((a,b)=>a.cy-b.cy)){
      if(event.kind==='heading'){
        const [,prefix,name,credits]=event.line.heading;
        const level=/^\d+\.$/.test(prefix)?1:/^\(/.test(prefix)?2:/^\d/.test(prefix)?3:4;
        this.stack.length=level-1;
        const parent=this.stack.filter(Boolean).at(-1)?.id||null;
        const node={id:`section-${this.headings.length+1}`,name,required:Number(credits),minimum_courses:Number(normalize(event.line.text).match(/课程最低门数[:：](\d+)/)?.[1]||0),level,parent,source:this.name,page,raw:event.line.text};
        this.stack[level-1]=node;this.headings.push(node);event.node=node;continue;
      }
      const {anchor,index}=event,cy=anchor.cy;
      const lo=Math.max(cy-19,index?(nature[index-1].cy+cy)/2:0),hi=Math.min(cy+19,index+1<nature.length?(nature[index+1].cy+cy)/2:Infinity);
      const code=normalize(cell(items,...cols.code,lo,hi));
      const creditText=normalize(cell(items,...cols.credits,cy-3,cy+4));
      const gradeText=normalize(cell(items,...cols.grade,cy-3,cy+4)),semesterText=normalize(cell(items,...cols.semester,cy-3,cy+4));
      const nameItems=items.filter(i=>i.x0>=cols.name[0]&&i.x0<cols.name[1]&&i.cy>=lo&&i.cy<hi).sort(order);
      const name=normalize(nameItems.filter(i=>Math.abs(i.cy-cy)<=16).map(i=>i.text).join(''));
      const courseNature=normalize(cell(items,...cols.nature,lo,hi));
      if(!/^[A-Z]{2,}\d+[A-Z0-9]*$/.test(code)||!/^\d+(?:\.\d+)?$/.test(creditText)||!name||!Number.isInteger(gradeNumber(gradeText))||![1,2,3].includes(Number(semesterText)))throw new Error(`${this.name}第${page}页有课程行无法完整识别（${code||'代码空白'}，${name||'名称空白'}）。没有跳过此行，请核对PDF版式。`);
      const current=this.stack.filter(Boolean).at(-1);if(!current)throw new Error(`第${page}页课程${code}无法关联模块`);
      if(!courseNature)throw new Error(`第${page}页课程${code}没有识别到课程性质`);
      this.courses.push({code,name,credits:Number(creditText),grade:gradeNumber(gradeText),semester:Number(semesterText),nature:courseNature,group:current.name,section_id:current.id,source:this.name,page});rowRanges.push([lo,hi]);
    }
    for(const item of items.filter(i=>i.x0>=cols.code[0]&&i.x0<cols.code[1]&&(!cols.fontHeight||Math.abs(i.height-cols.fontHeight)<.8)&&/^[A-Z]{2,}\d/.test(normalize(i.text)))){
      if(!rowRanges.some(([lo,hi])=>item.cy>=lo&&item.cy<hi))throw new Error(`${this.name}第${page}页课程代码${item.text}没有完整课程行（年级/学期可能缺失），未跳过`);
    }
    let noteTail=null;
    for(const line of ls){
      const text=normalize(line.text);
      const insideRow=rowRanges.some(([lo,hi])=>line.cy>=lo&&line.cy<hi);
      const headerLine=items.some(i=>normalize(i.text)==='年级'&&Math.abs(i.cy-line.cy)<=29);
      const continuation=noteTail&&line.cy>noteTail.cy&&line.cy-noteTail.cy<=Math.max(20,noteTail.height*2)&&!insideRow&&!headerLine&&!text.match(headingRegex)&&line.items.some(i=>i.x0<Math.max(100,cols.name[0]))&&line.items.every(i=>Math.abs(i.height-noteTail.height)<.8)&&(/[\u3400-\u9fff]/.test(text)||/[A-Z]{2,}\d/.test(text));
      if(continuation){this.notes.push({id:newId('note'),text:line.text,source:this.name,page,section_id:noteTail.section_id,decision:'pending',binding:''});noteTail={...noteTail,cy:line.cy};continue;}
      if(!/[\u3400-\u9fff]/.test(text)||text.match(headingRegex)||/年级.+课程设置/.test(text))continue;
      const paragraph=!insideRow&&!headerLine&&line.items.some(i=>i.x0<Math.max(100,cols.name[0]))&&/须|需|至少|最低|要求|全部|计入|见课程组|选修|必选|必修|替代|减免|模块|学分|合格|达标/.test(text);
      // 数字、代码被PDF分成多个文字片段时，说明段落仍须保留，不能按列位置误当表格删掉。
      if(!paragraph&&(line.items.some(i=>i.x0>=cols.credits[0]&&i.x0<cols.nature[1])||line.items.every(i=>i.x0>=cols.name[0]&&i.x0<cols.name[1])))continue;
      if(rowRanges.some(([lo,hi])=>line.cy>=lo&&line.cy<hi)&&line.items.some(i=>i.x0<cols.name[0]))continue;
      if(/^(?:课程|代码|课程序号|学分|年级|推荐学期|总学时|总|学|分|时|性质|理论|实践|价值贡献|知识贡献|能力贡献|素质贡献|备注)$/.test(text))continue;
      if(line.items.some(i=>i.x0<Math.max(100,cols.name[0]))&&/须|需|至少|最低|要求|全部|计入|见课程组|选修|必选|必修|替代|减免|模块|学分|合格|达标/.test(text)){
        const section=events.filter(e=>e.kind==='heading'&&e.cy<line.cy).at(-1)?.node||initialSection;
        this.notes.push({id:newId('note'),text:line.text,source:this.name,page,section_id:section?.id,decision:'pending',binding:''});
        noteTail={cy:line.cy,height:line.items[0].height,section_id:section?.id};
      }
    }
  }
  finish(){
    if(!this.courses.length)throw new Error('未识别到课程表；请使用与原三专业一致的文字型培养计划PDF');
    if(!this.major||!this.cohort_year)this.warnings.push('标题未完整识别年级/专业，请手动填写');
    return planFromParsed(this);
  }
}
function inferredRole(name){return /个性化/.test(name)?'personal':/交叉/.test(name)?'cross':/通识核心/.test(name)?'general':'other';}
const groupAliases=name=>name==='交叉模块课程'?['交叉模块课程','交叉模块课程组']:name==='交叉模块课程组'?['交叉模块课程组','交叉模块课程']:[name];
export function planFromParsed(parsed){
  const sections=parsed.headings,children=id=>sections.filter(s=>s.parent===id),descendants=id=>sections.filter(s=>{let p=s.parent;while(p){if(p===id)return true;p=sections.find(t=>t.id===p)?.parent;}return false;}),modules=[],consumed=new Set();
  // 依据章节关系识别父模块，而非英语/数学等固定名称。
  // 父项直接分成课程组时，保留父项总量和全部子项下限；0分子项不是独立必修要求。
  const isDistribution=n=>children(n.id).length>0&&children(n.id).every(c=>c.name!=='必修'&&!children(c.id).length);
  // 父模块总量与子模块分布保留在同一条规则，不将层级学分重复相加。
  for(const n of sections){
    if(consumed.has(n.id)||n.name==='必修')continue;
    const child=children(n.id),role=inferredRole(n.name);
    if(isDistribution(n)||role==='cross'&&child.length||role==='personal'&&child.length){
      const leaves=descendants(n.id).filter(c=>!children(c.id).length&&c.name!=='必修');
      const selected=leaves.length?leaves:child;for(const c of descendants(n.id))consumed.add(c.id);
      modules.push({id:n.id,name:role==='general'?'通识':role==='cross'?'交叉':role==='personal'?'个性化':n.name,kind:role==='personal'?'surplus':selected.some(c=>c.required>0||c.minimum_courses>0)?'distribution':'credits',role,groups:[...new Set(selected.flatMap(c=>groupAliases(c.name)))],required:n.required,minimum_courses:n.minimum_courses,children:role!=='personal'?selected.map(c=>({section_id:c.id,name:c.name,groups:groupAliases(c.name),required:c.required,minimum_courses:c.minimum_courses,source:c.source,page:c.page})):[],phase:role==='other'?'scheduled':'always',show_in_summary:role!=='other',overflow_to:'',source:n.source,page:n.page});
    }else if(!child.length){
      if(n.required===0&&!parsed.courses.some(c=>c.section_id===n.id))continue;
      modules.push({id:n.id,name:n.name,kind:role==='personal'?'surplus':'credits',role,groups:groupAliases(n.name),required:n.required,minimum_courses:n.minimum_courses,children:[],phase:role==='other'?'scheduled':'always',show_in_summary:role!=='other'||!parsed.courses.some(c=>c.section_id===n.id),overflow_to:'',source:n.source,page:n.page});
    }
  }
  const personal=modules.find(m=>m.kind==='surplus');if(personal)for(const m of modules)if(m.id!==personal.id)m.overflow_to=personal.id;
  for(const m of modules){
    const groups=m.children?.length?m.children.map(c=>c.groups):[m.groups];
    m.course_scope=m.kind!=='surplus'&&groups.every(names=>parsed.courses.some(c=>names.some(name=>normalize(name)===normalize(c.group))))?'listed':'credited';
  }
  const plan={schema_version:2,import_version:PLAN_IMPORT_VERSION,major:parsed.major,cohort_year:parsed.cohort_year,source:parsed.name,sources:[{name:parsed.name,type:'curriculum',pages:parsed.pages}],courses:parsed.courses,modules,repetitions:[],tracks:{普通:[],卓工:[],育才:[]},track_inference:[],flags:[],p_override_codes:parsed.courses.filter(c=>/^(专业实习|生产实习)/.test(c.name)).map(c=>c.code),notes:parsed.notes,section_rules:sections,reviewed:false,warnings:parsed.warnings};
  const physical=plan.courses.filter(c=>c.nature==='必修'&&/^体育[（(]/.test(c.name));
  if(physical.length)plan.repetitions.push({id:'physical',name:'体育模块',codes:[...new Set(physical.map(c=>c.code))],names:[],required_count:new Set(physical.map(c=>c.code)).size,credits_per_attempt:physical[0].credits,dedup:'course_term'});
  interpretNotes(plan);
  for(const n of sections){
    const child=children(n.id);if(child.length&&Math.abs(child.reduce((sum,c)=>sum+c.required,0)-n.required)>.001&&!modules.some(m=>m.id===n.id))plan.notes.push({id:newId('note'),text:`${n.name}最低${n.required}学分，直接子项最低学分合计${child.reduce((sum,c)=>sum+c.required,0)}。请核对总量规则是否已覆盖。`,source:n.source,page:n.page,decision:'pending',binding:''});
  }
  return plan;
}
function countNumber(s){return /^\d+$/.test(s)?Number(s):({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[s]||null);}
export function interpretNotes(plan){
  // 将文字中的“需选修N门不同课程”绑定到它所在的章节，不能误分配给同页的其他模块。
  for(const note of plan.notes){
    if(!note.section_id)continue;
    const text=normalize(note.text),match=text.match(/(?:需|须|应|至少)(?:要)?(?:选修|修读|修满|完成)(\d+|[一二三四五六七八九十])门(?:不同)?课程/);
    if(!match)continue;
    const target=plan.modules.find(m=>m.id===note.section_id)||plan.modules.flatMap(m=>m.children||[]).find(c=>c.section_id===note.section_id);
    if(!target)continue;
    const count=countNumber(match[1]);if(!count)continue;
    target.minimum_courses=Math.max(target.minimum_courses||0,count);
    note.binding=`${target.name}：至少${target.minimum_courses}门不同课程，最低${target.required}学分；原文其余条件仍须核对`;
  }
  // 合并同页折行的规则文本，保留每行出处和处理状态。
  const pages=[...new Set(plan.notes.map(n=>`${n.source}:${n.page}`))];
  for(const key of pages){
    const notes=plan.notes.filter(n=>`${n.source}:${n.page}`===key),text=normalize(notes.map(n=>n.text).join(''));
    // 指定课程列表也可能折行，按同页完整句子识别，避免丢失下一行的课程代码。
    for(const sentence of text.split(/[。；;]/)){
      const codes=sentence.match(/[A-Z]{2,}\d+[A-Z0-9]*/g)||[];
      if(/非卓工学生必选/.test(sentence)){plan.tracks.普通=[...new Set([...plan.tracks.普通,...codes])];plan.tracks.育才=[...new Set([...plan.tracks.育才,...codes])];}
      else if(/卓工学生必选/.test(sentence))plan.tracks.卓工=[...new Set([...plan.tracks.卓工,...codes])];
    }
    const countPattern=/(?:修满|修读|完成|修)(\d+|[一二三四五六七八九十])次(.+?)课程(?:[，,。].*?)?(?:每次(\d+(?:\.\d+)?)学分)?/g;
    for(const match of text.matchAll(countPattern)){
      const count=countNumber(match[1]),name=match[2].replace(/^[的之]/,''),courses=plan.courses.filter(c=>normalize(c.name)===name);
      if(!count||!courses.length)continue;
      const existing=plan.repetitions.find(r=>r.codes.some(code=>courses.some(c=>c.code===code)));
      const rule=existing||{id:newId('repeat'),name,codes:courses.map(c=>c.code),names:[name],dedup:'term'};
      rule.required_count=count;rule.credits_per_attempt=Number(match[3]||courses[0].credits);if(!existing)plan.repetitions.push(rule);
      for(const note of notes)if(normalize(note.text).includes(name)||/每次|共计.*学分|方可达到/.test(normalize(note.text))){note.decision='auto';note.binding=`次数规则：${name}，${count}次`;}
    }
    for(const note of notes){
      const t=normalize(note.text);
      if(/须修满全部/.test(t)&&t.replace(/须修满全部[。.]?/,'').length===0){note.decision='auto';note.binding='必修课程逐门检查';}
      if(/见课程组/.test(t)){note.decision='auto';note.binding='按对应模块学分检查';}
      if(/多修读学分计入个性化|四个模块要求学分之外的所有学分均可计入|其余学分在.*任意选修|没有学分要求|另外模块最低学分要求都分别达标/.test(t)){note.decision='auto';note.binding='模块总量、分布及溢出规则';}
      if(/须在人文.*至少选修|最低要求为\d+学分/.test(t)){note.decision='auto';note.binding='模块最低学分与分布';}
      const codePattern=/[A-Z]{2,}\d+[A-Z0-9]*/g;
      for(const sentence of t.split(/[。；;]/)){
        if(/非卓工学生必选/.test(sentence)){const codes=sentence.match(codePattern)||[];plan.tracks.普通=[...new Set([...plan.tracks.普通,...codes])];plan.tracks.育才=[...new Set([...plan.tracks.育才,...codes])];note.decision='auto';note.binding='普通/育才指定实践课程';}
        else if(/卓工学生必选/.test(sentence)){const codes=sentence.match(codePattern)||[];plan.tracks.卓工=[...new Set([...plan.tracks.卓工,...codes])];note.decision='auto';note.binding='卓工指定实践课程';}
        for(const track of ['卓工','育才']){const match=sentence.match(new RegExp(`${track}学生必修([A-Z0-9、,，和]+)`));if(match){plan.tracks[track]=[...new Set([...plan.tracks[track],...(match[1].match(codePattern)||[])])];note.decision='auto';note.binding=`${track}指定课程`;}}
      }
      if(/英语培养目标|英语水平考/.test(t)&&!plan.flags.some(f=>f.id==='english'))plan.flags.push({id:'english',name:'英语水平考',keys:['英语水平考'],kind:'mark',required:true});
      if(/游泳.*(?:达标|合格)|游泳技能达标/.test(t)&&!plan.flags.some(f=>f.id==='swim'))plan.flags.push({id:'swim',name:'游泳技能',keys:['游泳技能达标测试'],kind:'mark',required:true});
    }
  }
  for(const [track,codes]of Object.entries(plan.tracks)){if(track==='普通')continue;const other=new Set(Object.entries(plan.tracks).filter(([name])=>name!==track).flatMap(([,items])=>items));const exclusive=codes.filter(code=>!other.has(code));if(exclusive.length&&!plan.track_inference.some(t=>t.track===track))plan.track_inference.push({track,codes:exclusive});}
  for(const note of plan.notes)if(note.decision==='auto')note.decision='pending';
  return plan;
}
export function appendStandard(plan,pages,name){
  const result=JSON.parse(JSON.stringify(plan));result.sources.push({name,type:'standard',pages:pages.length});
  for(const [index,items]of pages.entries())for(const line of lines(items))if(/[\u3400-\u9fff]/.test(line.text)&&/须|需|至少|最低|要求|学分|次数|修满|通过|合格|达标|替代|豁免|必修|限选/.test(line.text))result.notes.push({id:newId('note'),text:line.text,source:name,page:index+1,decision:'pending',binding:''});
  result.reviewed=false;return interpretNotes(result);
}
