// 培养规则是数据，不执行上传文件中的代码。
export const RULE_SCHEMA=2;
export const normalize=s=>String(s??'').normalize('NFKC').replace(/\s+/g,'').replaceAll('Ⅰ','I').replaceAll('Ⅱ','II');
export const planKey=(year,major)=>JSON.stringify([Number(year),normalize(major)]);
export const planLabel=({cohort_year,major})=>`${cohort_year}级 ${major}`;
export const newId=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}`;
const list=s=>Array.isArray(s)?s:String(s||'').split(/[,，;；\n]/).map(v=>v.trim()).filter(Boolean);
export {list as stringList};
const clone=x=>JSON.parse(JSON.stringify(x));
export function legacyToConfig(plan,major){
  if(plan.schema_version===RULE_SCHEMA)return clone(plan);
  const groups=[['英语选修',6],['数学一',6],['数学二',4],['物理一',4],['物理二',4],['物理三',2],...(major==='微电子科学与工程'?[['专业选修课模块一',7],['专业选修课模块二',4],['A组',2],['B组',2]]:[['专业选修课',6],['工程实践与科创',6]])];
  const modules=groups.map(([name,required],i)=>({id:`credit-${i}`,name,kind:'credits',role:'other',groups:[name],required,children:[],phase:'scheduled',course_scope:'credited',show_in_summary:false,overflow_to:'personal'}));
  modules.push({id:'general',name:'通识',kind:'distribution',role:'general',groups:['人文学科','社会科学','自然科学','艺术修养','工程科学与技术'],required:plan.general_credits,children:['人文学科','社会科学','自然科学','艺术修养','工程科学与技术'].map(name=>({name,groups:[name],required:name==='工程科学与技术'?0:2})),phase:'always',show_in_summary:true,overflow_to:'personal'});
  modules.push({id:'cross',name:'交叉',kind:'credits',role:'cross',groups:major==='微电子科学与工程'?['院系交叉模块','交叉模块课程组','交叉模块课程']:['交叉模块课程组','交叉模块课程'],required:plan.cross_credits,children:[],phase:'always',show_in_summary:true,overflow_to:'personal'});
  modules.push({id:'personal',name:'个性化',kind:'surplus',role:'personal',groups:['个性化教育'],required:plan.personal_credits,children:[],phase:'always',show_in_summary:true,overflow_to:''});
  return {schema_version:RULE_SCHEMA,major,cohort_year:plan.cohort_year||2023,source:plan.source,sources:[{name:plan.source,type:'curriculum'}],courses:clone(plan.courses),modules,
    repetitions:[{id:'physical',name:'体育模块',codes:['KE1201','KE1202','KE2201','KE2202'],names:[],required_count:4,credits_per_attempt:1,dedup:'course_term'},{id:'policy',name:'形势与政策',codes:[plan.policy_code,'TH020'],names:['形势与政策'],required_count:plan.policy_passes,credits_per_attempt:.5,dedup:'term'}],
    tracks:{普通:major==='微电子科学与工程'?[]:['EE0503','ICE2502','ICE3505'],卓工:[...(major==='微电子科学与工程'?[]:['EE0503','ICE3513','ICE3519']),...(plan.special_tracks?.卓工||[])],育才:[...(major==='微电子科学与工程'?[]:['EE0503','ICE2502','ICE3505']),...(plan.special_tracks?.育才||[])]},
    track_inference:major==='信息工程'?[{track:'卓工',codes:['ICE3513','ICE3519']}]:[],
    flags:[{id:'swim',name:'游泳技能',keys:['游泳技能达标测试'],kind:'mark',required:true},{id:'english',name:'英语水平考',keys:['英语水平考'],kind:'mark',required:true}],p_override_codes:['ICE3324','EST3322','MST3312'],notes:[],section_rules:[],reviewed:true};
}
export function makeLibrary(plans){
  return {schema_version:1,revision:0,default_grade_id:'builtin-2023',default_audit_mode:'current',grades:[{id:'builtin-2023',name:'2023级',cohort_year:2023,majors:Object.entries(plans).map(([major,plan],i)=>({id:`builtin-major-${i}`,name:`2023级${major}`,major,version:1,status:'active',plan:legacyToConfig(plan,major)}))}]};
}
export const defaultAuditMode=library=>library?.default_audit_mode??'current';
export function publicLibrary(library){
  const result=clone(library);
  result.grades=result.grades.map(g=>({...g,majors:g.majors.filter(m=>m.status==='active')})).filter(g=>g.majors.length);
  if(!result.grades.some(g=>g.id===result.default_grade_id))result.default_grade_id=result.grades[0]?.id||null;
  return result;
}
function ensure(condition,message){if(!condition)throw new Error(message);}
function string(value,label,max=300){ensure(typeof value==='string'&&value.trim().length>0&&value.length<=max,`${label}不能为空且不能超过${max}字`);}
function number(value,label,max=1000){ensure(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max,`${label}必须是0—${max}之间的数字`);}
function unique(items,key,label){const values=items.map(key);ensure(new Set(values).size===values.length,`${label}不能重复`);}
export function validatePlan(plan,{active=false}={}){
  ensure(plan&&typeof plan==='object','专业规则格式不正确');
  // 旧版三专业作为迁移种子保留；编辑和新上传一律保存为v2。
  if(plan.schema_version!==RULE_SCHEMA){ensure(Array.isArray(plan.courses)&&plan.courses.length>0&&plan.courses.length<=2000,'旧版规则课程表无效');return plan;}
  string(plan.major,'专业名称');ensure(Number.isInteger(plan.cohort_year)&&plan.cohort_year>=1900&&plan.cohort_year<=2200,'入学年级须为四位年份');
  ensure(Array.isArray(plan.courses)&&plan.courses.length<=2000,'课程表最多2000行');
  for(const c of plan.courses){string(c.code,'课程代码',100);string(c.name,'课程名称');number(c.credits,`${c.code}学分`,100);ensure(Number.isInteger(c.grade)&&c.grade>=1&&c.grade<=10,`${c.code}建议年级须为1—10`);ensure([1,2,3].includes(c.semester),`${c.code}建议学期须为1、2或3`);string(c.nature,`${c.code}课程性质`,30);}
  ensure(Array.isArray(plan.modules)&&plan.modules.length<=100,'最多100个学分模块');unique(plan.modules,m=>m.id,'模块编号');unique(plan.modules,m=>normalize(m.name),'模块名称');
  for(const m of plan.modules){string(m.id,'模块编号');string(m.name,'模块名称');number(m.required,`${m.name}要求学分`);ensure(['credits','distribution','surplus'].includes(m.kind),'模块类型无效');ensure(Array.isArray(m.groups)&&m.groups.length<=100,'模块对应名称无效');ensure(['always','scheduled'].includes(m.phase),'模块阶段口径无效');ensure(['credited','listed'].includes(m.course_scope||'credited'),'课程范围无效');ensure(Array.isArray(m.children)&&m.children.length<=100,'子模块列表无效');number(m.minimum_courses||0,'最低门数',100);for(const c of m.children||[]){string(c.name,'子模块名称');number(c.required,'子模块学分');ensure(Array.isArray(c.groups),'子模块对应名称无效');number(c.minimum_courses||0,'子模块最低门数',100);}if(m.overflow_to)ensure(plan.modules.some(t=>t.id===m.overflow_to&&t.kind==='surplus'&&t.id!==m.id),'溢出目标必须是另一个已保存的个性化/溢出模块');}
  ensure(Array.isArray(plan.repetitions)&&plan.repetitions.length<=50,'次数规则最多50条');
  for(const r of plan.repetitions){string(r.id,'次数规则编号');string(r.name,'次数规则名称');ensure(Array.isArray(r.codes)&&Array.isArray(r.names)&&(r.codes.length+r.names.length)>0,'次数规则需填写课程代码或名称');ensure(Number.isInteger(r.required_count)&&r.required_count>=1&&r.required_count<=100,'要求次数须为1—100');number(r.credits_per_attempt,'每次学分',100);ensure(['term','course_term'].includes(r.dedup),'计次方式无效');}
  ensure(plan.tracks&&typeof plan.tracks==='object'&&!Array.isArray(plan.tracks),'培养类型规则无效');ensure(Object.keys(plan.tracks).length>0,'至少保留一种培养类型');for(const [name,codes]of Object.entries(plan.tracks)){string(name,'培养类型');ensure(!['__proto__','prototype','constructor'].includes(name),'培养类型名称无效');ensure(Array.isArray(codes)&&codes.every(c=>typeof c==='string'),'指定课程代码无效');}
  ensure(Array.isArray(plan.flags)&&plan.flags.length<=30,'专项要求最多30项');
  for(const f of plan.flags){string(f.id,'专项编号');string(f.name,'专项名称');ensure(Array.isArray(f.keys)&&f.keys.length>0,'专项须填写修业PDF/补充CSV中的字段名称');ensure(['mark','minimum'].includes(f.kind),'专项类型无效');if(f.kind==='minimum')number(f.minimum,'专项最低数值');}
  ensure(Array.isArray(plan.notes)&&plan.notes.length<=2000,'文字规则核对项无效或超过2000条');
  for(const n of plan.notes){string(n.text,'文字规则原文',10000);ensure(['auto','configured','not_applicable','pending'].includes(n.decision),'文字规则处理状态无效');}
  if(active){ensure(plan.courses.length>0||plan.modules.length>0||plan.repetitions.length>0||plan.flags.some(f=>f.required!==false),'不能启用空规则');}
  return plan;
}
export function validateLibrary(library){
  ensure(Number.isInteger(library?.revision)&&library.revision>=0,'规则库版本无效');ensure(library?.schema_version===1&&Array.isArray(library.grades)&&library.grades.length<=50,'规则库格式无效或年级超过50个');unique(library.grades,g=>g.id,'年级编号');
  ensure(library.default_audit_mode===undefined||['current','all'].includes(library.default_audit_mode),'默认审查方式只能是按当前时间或最终审查');
  for(const g of library.grades){string(g.id,'年级编号');string(g.name,'年级名称');ensure(Number.isInteger(g.cohort_year)&&g.cohort_year>=1900&&g.cohort_year<=2200,'入学年份无效');ensure(Array.isArray(g.majors)&&g.majors.length<=50,'每个年级最多50个专业');unique(g.majors,m=>m.id,'专业编号');unique(g.majors.filter(m=>m.status==='active'),m=>normalize(m.major),'同年级已启用专业');for(const m of g.majors){string(m.id,'专业编号');ensure(Number.isInteger(m.version)&&m.version>=0,'专业版本无效');string(m.name,'专业选项名称');string(m.major,'对应PDF专业名称');ensure(['draft','active'].includes(m.status),'专业状态无效');ensure(m.plan?.cohort_year===undefined||m.plan.cohort_year===g.cohort_year,'专业规则的入学年份须与所属年级一致');ensure(m.plan.major===undefined||m.plan.major===m.major,'专业规则名称须与对应PDF专业一致');validatePlan(m.plan,{active:m.status==='active'});}}
  const hasActive=library.grades.some(g=>g.majors.some(m=>m.status==='active'));
  if(hasActive)ensure(library.grades.some(g=>g.id===library.default_grade_id&&g.majors.some(m=>m.status==='active')),'默认年级必须至少有一个已启用的专业规则');
  else ensure(library.default_grade_id===null,'没有已启用专业时默认年级须为空');return library;
}
export function repairDefaultGrade(library){
  const available=library.grades.filter(g=>g.majors.some(m=>m.status==='active'));
  if(!available.some(g=>g.id===library.default_grade_id))library.default_grade_id=available[0]?.id||null;
}
export function deleteGradeRule(library,gradeId){
  const index=library.grades.findIndex(g=>g.id===gradeId);if(index<0)return null;
  const previous_default=library.default_grade_id,[item]=library.grades.splice(index,1);
  repairDefaultGrade(library);return {kind:'grade',index,item,previous_default,default_after:library.default_grade_id};
}
export function deleteMajorRule(library,gradeId,majorId){
  const grade=library.grades.find(g=>g.id===gradeId),index=grade?.majors.findIndex(m=>m.id===majorId)??-1;if(index<0)return null;
  const previous_default=library.default_grade_id,[item]=grade.majors.splice(index,1);
  repairDefaultGrade(library);return {kind:'major',grade_id:gradeId,index,item,previous_default,default_after:library.default_grade_id};
}
export function restoreDeletedRule(library,deletion){
  const target=deletion.kind==='grade'?library.grades:library.grades.find(g=>g.id===deletion.grade_id)?.majors;
  ensure(target,'原年级不存在，无法撤销此专业删除');ensure(!target.some(item=>item.id===deletion.item.id),'该规则已存在，无需重复恢复');
  target.splice(Math.min(deletion.index,target.length),0,deletion.item);
  if(library.default_grade_id===deletion.default_after)library.default_grade_id=deletion.previous_default;
  repairDefaultGrade(library);
}
export function selectedPlans(library,gradeId){
  const grade=library.grades.find(g=>g.id===gradeId);if(!grade)throw new Error('请选择已保存的年级规则');
  const majors=grade.majors.filter(m=>m.status==='active');if(!majors.length)throw new Error(`${grade.name}尚未保存并启用专业规则`);
  return {grade,plans:Object.fromEntries(majors.map(m=>[m.major,legacyToConfig(m.plan,m.major)])),selection:{grade_id:grade.id,grade_name:grade.name,cohort_year:grade.cohort_year,revision:library.revision||0,majors:majors.map(m=>({id:m.id,name:m.name,major:m.major,version:m.version||1}))}};
}
