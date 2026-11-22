import {withRecordAudit} from './record-audit.mjs?v=20261104-rows1';
// 浏览器内生成可筛选的Excel；文件与学生数据均不经过网站服务器。
export {saveFile} from './download.mjs?v=20261104-rows1';
import {FULL_AUDIT,FULL_AUDIT_LABEL} from './terms.mjs?v=20261104-rows1';
import {courseCheckHeaders,courseCheckValues,phaseCourseChecks} from './course-checks.mjs?v=20261104-rows1';
import {configuredWorkbookRows,skippedScopeNote} from './configured-report.mjs?v=20261104-rows1';
const xml=s=>String(s??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const col=n=>{let r='';for(;n;n=Math.floor((n-1)/26))r=String.fromCharCode(65+(n-1)%26)+r;return r;};
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const sortStudents=students=>[...students].sort((a,b)=>String(a.sid).localeCompare(String(b.sid),'en',{numeric:true}));
export function workbookRows(data){
  const sheets=baseWorkbookRows(data);
  return data.mode==='recommendation'?sheets:withRecordAudit(sheets,data);
}
function baseWorkbookRows(data){
  if(data.students.some(s=>s.schema_version===2))return configuredWorkbookRows(data,sortStudents);
  const finalAudit=data.term===FULL_AUDIT;
  const summary=[['姓名','学号','专业','审查判断',...courseCheckHeaders(data.term),'通识','个性化','交叉','游泳技能','英语水平考',...(!finalAudit?['此前课程问题','本学期课程问题']:[]),'必修问题','通识已获学分','通识最低需补学分','个性化已获学分','个性化差学分','交叉已获学分','交叉差学分',finalAudit?'其他限选':'其他限选（阶段）','其他限选问题','判断依据','补充说明','来源页码']];
  const history=[['姓名','学号','专业','核对项目','要求数量/学分','已通过/认可','有修读记录','缺修读记录','单位','记录依据']];
  const course=[['姓名','学号','专业','模块','课程代码','课程名称','学分','应修/记录学期','审查状态','成绩/备注依据','来源']];
  const credits=[['姓名','学号','专业','模块','要求学分','已获/认可学分','豁免学分',finalAudit?'在修学分（不计通过）':'本学期在修学分',finalAudit?'尚缺学分':'阶段需补学分','计算说明','来源']];
  for(const s of sortStudents(data.students)){
    summary.push([s.name,s.sid,s.major,s.stage,...courseCheckValues(s,data.term),s.general_gap?'×':'√',s.personal_gap?'×':'√',s.cross_gap?'×':'√',s.swim,s.english,...(!finalAudit?[phaseCourseChecks(s,data.term).previous_issues.join('\n')||'无',phaseCourseChecks(s,data.term).current_issues.join('\n')||'无']:[]),s.required_issues.join('\n')||'无',s.general_total,s.general_gap,s.personal,s.personal_gap,s.cross,s.cross_gap,s.elective_issues.length?'×':'√',s.elective_issues.join('\n')||'无',s.outcome_reason,[s.general_text,...s.notes].filter(Boolean).join('\n'),`${s.file} 第${s.start_page}-${s.end_page}页`]);
    if(finalAudit&&s.read_history){
      for(const r of s.read_history.course_rows)history.push([s.name,s.sid,s.major,`${r.name}（${r.code}）`,r.required,r.passed,r.recorded,r.gap,r.unit,r.evidence]);
      for(const r of s.read_history.credit_rows)history.push([s.name,s.sid,s.major,r.group,r.required,r.credited,r.recorded,r.gap,'学分',r.evidence||'保留已认可/豁免/已分配溢出学分，仅增加去重后的未通过或在修记录；已通过同代码/同名课的旧失败不重复计入']);
    }
    for(const c of s.mandatory)course.push([s.name,s.sid,s.major,'必修',c.code,c.name,c.credits,c.schedule,c.state,c.evidence,c.page?`${s.file} 第${c.page}页`:'修业记录缺失']);
    for(const m of s.module_rows){
      credits.push([s.name,s.sid,s.major,m.group,m.required,m.earned,m.waived,m.inprogress,m.uncovered,finalAudit?(m.deficit?`尚缺${m.deficit}学分；在修不计通过，须修满`:'已满足'):m.status==='暂不审查'?'尚未到该模块应完成学期，暂不要求修满':m.deficit?`已获尚差${m.deficit}；${m.status==='在修覆盖'?'所选学期在修可覆盖，仍须通过':'阶段尚有缺口'}`:'已满足',`${s.file} 第${m.page}页`]);
      for(const c of s.sections.find(sec=>sec.group===m.group).courses.filter(c=>!['未修',''].includes(c.remark)||c.score))course.push([s.name,s.sid,s.major,m.group,c.code,c.name,c.credits,[c.year,c.semester].filter(Boolean).join('-'),c.remark||'有成绩',[c.score,c.remark,c.replacement].filter(Boolean).join(' '),`${s.file} 第${c.page}页`]);
    }
    for(const [g,v]of Object.entries(s.general_values))credits.push([s.name,s.sid,s.major,`通识/${g}`,g==='工程科学与技术'?0:2,v,0,0,Math.max(0,(g==='工程科学与技术'?0:2)-v),'人文、社科、自然、艺术各至少2学分；工程无单项最低要求',s.file]);
    credits.push([s.name,s.sid,s.major,'通识合计',10,s.general_total,0,0,s.general_gap,s.general_text||'满足总量与分布要求',s.file]);
    credits.push([s.name,s.sid,s.major,'个性化合计',6,s.personal,0,0,s.personal_gap,'采用系统已认可学分，已含溢出，不重复相加',s.file]);
    for(const t of s.transfers)credits.push([s.name,s.sid,s.major,`个性化来源/${t.group}`,null,t.credits,0,0,null,'已包含在个性化合计中，仅供分解核对',`${s.file} 第${t.page}页`]);
    credits.push([s.name,s.sid,s.major,'交叉合计',6,s.cross,0,0,s.cross_gap,'交叉模块合计达到要求即可，不逐门要求备选课',s.file]);
  }
  const rules=[['项目','审查口径','依据'],
    ['范围',finalAudit?`内置2023级三专业培养计划；${FULL_AUDIT_LABEL}：不分学期，所有要求须完成，在修不计通过。`:`内置2023级三专业培养计划；所选审查学期${data.term}。这是阶段审查，在修课程仍须期末通过。`,'用户指定'],
    ['必修',finalAudit?'所有必修及培养类型指定课程须通过，不区分应修学期，不暂缓未来课程，在修不计通过。':'相对于所选审查学期，以前应修必修须通过；当学期计划必修已通过或满足在修安排统一显示√；以后的必修暂缓。旧欠修仅在修仍为欠修。','三专业培养计划'],
    ['审查判断',finalAudit?'按本工具口径：全部课程、学分和专项均合格为毕业；课程和模块学分修读记录齐全但有挂科、在修或专项未达标/缺记录，为结业；缺必修/指定课程修读记录、体育/形势与政策修读次数或模块学分修读记录不足，为肄业。':'所选学期要求全部满足显示√，否则显示×。其他年级培养计划提示仅保留于补充说明，不作为总判断。','用户指定'],
    ['修读记录学分','挂科和在修计为有修读记录，但不算已获学分。按课程去重、跨模块不重复占用。保留已认可的替代、豁免和溢出；新增未通过记录超出原模块最低要求时，仅以多出的部分补个性化修读记录，不改变已获学分。','用户指定'],
    ['学期选择','按北京时间自动选择：9月至次年2月为学年第一学期，3月至8月为第二学期；小学期3手动选择。也可选择“本科全部要求（最终审查）”，检查全部要求。','用户指定'],
    ['体育模块','体育1、2、3、4合并，累计有效通过4次即可，同一门课可重复修读通过；不逐门要求。体育备注“已重修或补考”的记录，数值成绩≥60分也计一次；未通过、仅在修不计；同一代码同一学期重复记录只计一次。','用户补充规则'],
    ['通识','总量至少10学分；人文、社会、自然、艺术各至少2学分；工程无单项最低要求。','培养计划；自查参考文件第9页'],
    ['通识缺口','最低需补＝MAX（总量缺口，四个必达模块的缺口合计）。总量与分布缺口不重复相加。','用户指定'],
    ['个性化','至少6学分，使用教务系统已认可的个性化总数；已含溢出，不重复叠加。','培养计划；自查参考文件第9页'],
    ['交叉','三专业均为6学分；微电子合计院系交叉与交叉课程组即可。','三专业培养计划'],
    ['英语/数学/物理/专业选修',finalAudit?'所有模块须修满所要求学分，在修不覆盖缺口，不暂缓未来模块。限选按学分要求，不逐门要求全部备选课。':'按模块学分及所选学期检查；当学期应完成的模块可由在修覆盖，以前应完成的须修满，尚未到完成学期的暂缓。未选备选课不计欠修。','三专业培养计划'],
    ['成绩认定','数值成绩≥60分或A、B、C、D、E、P等非F通过等级即认可，无须同时有√；明确不通过、需重修、未修和仅在修不算已通过。历史备注“已重修或补考”仍按本条实际通过成绩认定。','用户补充规则'],
    ['形势与政策','合并TH020、MARX1205等新旧课程代码及同名课程，累计4个不同学期通过，每次0.5学分；原始修读与系统替代汇总取较大已认可次数，不重复叠加。','用户补充规则'],
    ['课程替代','系统标“校内被替代”即认可通过，不再要求另一条记录的代码或名称完全匹配。','用户补充规则'],
    ['实习成绩P','专业实习和生产实习（含微电子）成绩为P直接认定通过，优先于“未修”等备注，不再报该课程欠修或认定冲突。','用户补充规则'],
    ['成绩认定冲突','除专业实习、生产实习P特例外，成绩P或及格但备注未修时，提示核对认定，不自行改判。','原始修业记录'],
    ['游泳/英语水平考','直接读取审核区√/×；缺记录不推断通过。','原始修业记录'],
    ['培养类型','默认普通；信息工程已通过卓工专属课时推定卓工并提示核对。可在补充CSV中指定。','培养计划'],
    ['其他年级','当前仅内置2023级三专业培养计划；其他年级按学生年级换算学年并标为参考，仍须核对对应培养计划。','现有培养计划适用范围'],
    ['数据处理','在浏览器本地解析与导出，不将学生文件传至网站服务器；刷新或关闭网页后需重新上传。','网站运行方式'],
    ...Object.values(data.plans).map(p=>['培养计划',p.source,'用户提供']),...data.sources.map(s=>['学生来源',s,'用户本次上传'])];
  if(skippedScopeNote(data))rules.push(['专业筛选及跳过说明',skippedScopeNote(data),'本次上传与所选规则']);
  return [
    {name:'审查汇总',title:finalAudit?`毕业资格审查　${FULL_AUDIT_LABEL}`:`毕业资格阶段审查　${data.term}`,rows:summary,widths:[12,19,25,16,...(finalAudit?[19]:[27,29]),10,11,10,13,15,...(!finalAudit?[82,82]:[]),76,18,22,21,18,20,18,24,48,92,70,48]},
    {name:'课程审查明细',title:'逐门必修及限选记录',rows:course,widths:[12,19,25,26,18,58,12,22,30,76,48]},
    {name:'学分明细',title:'学分要求、已获学分与缺口',rows:credits,widths:[12,19,25,36,16,20,16,22,22,82,48]},
    {name:'审查说明',title:'审查口径与来源',rows:rules,widths:[28,126,66]},
    ...(finalAudit?[{name:'修读记录核对',title:'区分未修读与已修读但未合格',rows:history,widths:[12,19,25,62,20,18,18,18,10,110]}]:[])
  ];
}
function cell(value,address,header=false,title=false,outcome=false,identifier=false){
  if(value===null||value===undefined)return '';
  let style=header?1:title?6:typeof value==='number'?7:value==='×'||value==='未通过'?2:String(value).includes('未提供')||value==='待核对'?3:String(value).includes('在修')?4:0;
  if(identifier)style=11;
  if(outcome)style=['毕业','√','达到本次规则'].includes(value)?8:['结业','待复核'].includes(value)?9:10;
  return typeof value==='number'?`<c r="${address}" s="${style}"><v>${value}</v></c>`:`<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function sheetXML(sheet){
  const count=sheet.rows[0].length,last=sheet.rows.length+4;
  const rows=[`<row r="2" ht="28" customHeight="1">${cell(sheet.title,'A2',false,true)}</row>`];
  for(let i=0;i<sheet.rows.length;i++){
    const vals=sheet.rows[i],rn=i+5;
    const maxLines=Math.max(...vals.map((v,j)=>String(v??'').split('\n').reduce((a,line)=>a+Math.max(1,Math.ceil([...line].reduce((a,c)=>a+(c.charCodeAt(0)>255?2:1),0)/(sheet.widths[j]||20))),0)));
    const height=i===0?38:Math.min(409,Math.max(30,maxLines*15+10));
    rows.push(`<row r="${rn}" ht="${height}" customHeight="1">${vals.map((v,j)=>cell(v,`${col(j+1)}${rn}`,i===0,false,sheet.name==='审查汇总'&&j===3&&i>0,sheet.name!=='审查说明'&&j===1&&i>0)).join('')}</row>`);
  }
  const frozen=sheet.name==='审查汇总'?4:count>3?3:0;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}"><dimension ref="A1:${col(count)}${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="${frozen}" ySplit="5" topLeftCell="${col(frozen+1)}6" activePane="${frozen?'bottomRight':'bottomLeft'}" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${sheet.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A5:${col(count)}${last}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}
const baseStyles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="5"><font><sz val="11"/><color rgb="FF243449"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF9C2727"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF8A621C"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF173D50"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173D50"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE8E6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
const styles=baseStyles.replace('<fonts count="5">','<fonts count="7">').replace('</fonts>','<font><b/><sz val="12"/><color rgb="FF166534"/><name val="Arial"/></font><font><b/><sz val="12"/><color rgb="FF92400E"/><name val="Arial"/></font></fonts>').replace('<fills count="6">','<fills count="7">').replace('</fills>','<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill></fills>').replace('<cellXfs count="8">','<cellXfs count="12">').replace('</cellXfs>',[[5,6],[6,4],[2,3]].map(([font,fill])=>`<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`).join('')+'<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf></cellXfs>');
export async function buildWorkbook(data,Zip=globalThis.JSZip){
  if(!Zip)throw new Error('Excel组件未加载，请刷新网页后重试。');
  const zip=new Zip(),sheets=workbookRows(data);
  zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml',styles);
  sheets.forEach((s,i)=>zip.file(`xl/worksheets/sheet${i+1}.xml`,sheetXML(s)));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
export const studentFilename=s=>`${s.sid}_${s.name.replace(/[\\/:*?"<>|]/g,'_')}_修业审查.xlsx`;
export async function buildStudentZip(data,onProgress=()=>{}){
  const zip=new globalThis.JSZip(),students=sortStudents(data.students);
  for(let i=0;i<students.length;i++){
    const s=students[i];zip.file(studentFilename(s),await buildWorkbook({...data,students:[s]}));
    onProgress(i+1,students.length);await new Promise(r=>setTimeout(r,0));
  }
  return zip.generateAsync({type:'uint8array',compression:'STORE'});
}
