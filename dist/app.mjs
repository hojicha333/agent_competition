import { StudentParser } from './engine.mjs';
import { PlanParser } from './plan-import.mjs';
import { legacyToConfig, normalize, validatePlan } from './rule-schema.mjs';
import { readPdf } from './pdf-reader.mjs';
import { graduationScope, recommendationScope, reviewStudent } from './review.mjs';
import { auditTermLabel, auditTermOptions, defaultAuditTerm, FULL_AUDIT, parseAuditTerm } from './terms.mjs';

const $ = id => document.getElementById(id);
const mb = 1024 ** 2;
const storageKey = 'siyuan-reviewed-plans-v1';
const demoTerm = '2025-2026-1';
const plans = new Map();
const state = { busy: false, draft: null, records: [], demoRecords: false, result: null };
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function status(id, text, isError = false) {
  const message = $(id);
  message.hidden = !text;
  message.classList.toggle('error', isError);
  message.textContent = text;
}

function isGraduation() {
  return $('auditForm').elements.mode.value === 'graduation';
}

function updateControls() {
  const controls = [
    'demoBtn', 'choosePlan', 'planSelect', 'chooseRecords', 'clearRecords',
    'recordsInput', 'planInput', 'planYear', 'planMajor', 'planConfirmed', 'discardPlan',
  ];
  for (const id of controls) $(id).disabled = state.busy;
  for (const control of document.querySelectorAll('#planPreview button, [name="mode"]')) control.disabled = state.busy;
  $('term').disabled = state.busy || isGraduation();
  $('runBtn').disabled = state.busy || !$('planSelect').value || !state.records.length;
}

function clearResult() {
  state.result = null;
  $('results').hidden = true;
  $('results').replaceChildren();
  $('exportBtn').hidden = true;
  $('resultContext').textContent = '审查完成后可查看逐项依据。';
  status('auditStatus', '');
  status('exportStatus', '');
}

function updateMode() {
  const graduation = isGraduation();
  $('termField').hidden = graduation;
  $('modeHint').textContent = graduation ? graduationScope : recommendationScope;
  $('runBtn').firstChild.textContent = graduation ? '运行毕业预审 ' : '运行推免学业审查 ';
  clearResult();
  updateControls();
}

function refreshPlans(selected = $('planSelect').value) {
  $('planSelect').replaceChildren(new Option('请选择方案', ''));
  for (const [key, entry] of plans) {
    const type = { demo: '演示', local: '已导入', builtin: '内置' }[entry.type];
    const plan = entry.plan;
    $('planSelect').add(new Option(`${plan.cohort_year}级 · ${plan.major}（${type}）`, key));
  }
  $('planSelect').value = plans.has(selected) ? selected : '';
  renderActivePlan();
}

function renderActivePlan() {
  const { plan } = plans.get($('planSelect').value) || {};
  $('activePlanSource').hidden = !plan;
  $('activePlanSource').textContent = plan ? `来源 · ${plan.source}` : '';
  updateControls();
}

function planKey(plan, type) {
  return JSON.stringify([type, plan.cohort_year, normalize(plan.major)]);
}

async function loadPlans() {
  try {
    const choices = JSON.parse(localStorage.getItem(storageKey) || '[]');
    for (const plan of choices) {
      validatePlan(plan, { active: true });
      if (plan.schema_version !== 2 || !plan.reviewed) continue;
      plans.set(planKey(plan, 'local'), { plan, type: 'local' });
    }
  } catch {
    status('planStatus', '部分本机培养方案无法读取，可重新导入 PDF。', true);
  }
  refreshPlans();
  try {
    const response = await fetch('./rules.json');
    if (!response.ok) throw new Error('无法读取内置方案');
    const bundled = await response.json();
    const selection = $('planSelect').value;
    for (const [major, original] of Object.entries(bundled)) {
      const plan = legacyToConfig(original, major);
      plans.set(planKey(plan, 'builtin'), { plan, type: 'builtin' });
    }
    refreshPlans(selection);
  } catch {
    if (!state.busy && !state.draft) status('planStatus', '内置方案暂不可用，可以自行导入 PDF。', true);
  }
}

function table(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map(value => `<th scope="col">${escape(value)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

async function parsePlan(file) {
  if (file.size > 20 * mb) throw new Error('培养方案 PDF 请控制在 20 MB 以内。');
  const parser = new PlanParser(file.name);
  await readPdf(file, (items, page, width) => parser.page(items, page, width));
  return parser.finish();
}

function showDraft(plan, demo = false) {
  state.draft = { plan, demo };
  $('planPreview').hidden = false;
  $('planPreview').querySelector('details').open = false;
  $('planYear').value = plan.cohort_year ?? '';
  $('planMajor').value = plan.major;
  $('planConfirmed').checked = false;
  const pages = plan.sources[0]?.pages;
  $('planSource').textContent = `${plan.source} · ${pages} 页`;
  const pending = plan.notes.filter(note => note.decision === 'pending').length;
  $('planSummary').textContent = `识别 ${plan.courses.length} 行课程、${plan.modules.length} 个学分模块、${plan.repetitions.length} 项计次规则。${pending ? `另有 ${pending} 条原文需人工核对。` : ''}`;
  const courses = plan.courses.map(c => [c.code, c.name, c.credits, c.nature, `第 ${c.grade} 年 / 学期 ${c.semester}`, c.page]);
  const modules = plan.modules.flatMap(m => [[m.name, m.required, m.minimum_courses || '—', m.page],
    ...m.children.map(c => [`${m.name} / ${c.name}`, c.required, c.minimum_courses || '—', c.page])]);
  const notes = plan.notes.map(n => [n.page, n.text, n.decision === 'pending' ? '待人工核对' : n.binding || '已提取']);
  const repetitions = plan.repetitions.map(r => [r.name, r.required_count, r.codes.join('、')]);
  $('planEvidence').innerHTML = '<h3>课程</h3>' + table(['代码', '课程', '学分', '性质', '建议修读', '页码'], courses)
    + (modules.length ? '<h3>学分模块</h3>' + table(['模块', '最低学分', '最低门数', '页码'], modules) : '')
    + (repetitions.length ? '<h3>修读次数</h3>' + table(['规则', '次数', '课程代码'], repetitions) : '')
    + (notes.length ? '<h3>原文与识别说明</h3>' + table(['页码', '原文', '说明'], notes) : '');
  status('planStatus', demo ? '演示材料已载入，请核对并启用培养方案。' : 'PDF 已读取。请核对培养方案适用的年级、专业及审查条款。');
}

function discardDraft() {
  state.draft = null;
  $('planPreview').hidden = true;
}

function storePlan(event) {
  event.preventDefault();
  if (!state.draft || state.busy) return;
  const type = state.draft.demo ? 'demo' : 'local';
  const plan = { ...state.draft.plan, major: $('planMajor').value.trim(), cohort_year: $('planYear').valueAsNumber, reviewed: true };
  try {
    validatePlan(plan, { active: true });
    const key = planKey(plan, type);
    plans.set(key, { plan, type });
    discardDraft();
    clearResult();
    refreshPlans(key);
    if (type === 'local') {
      const localPlans = [...plans.values()].filter(entry => entry.type === 'local').map(entry => entry.plan);
      try {
        localStorage.setItem(storageKey, JSON.stringify(localPlans));
      } catch {
        status('planStatus', '方案已启用。浏览器存储不可用，刷新后需重新导入。');
        return;
      }
    }
    status('planStatus', `${plan.cohort_year}级 ${plan.major}培养方案已启用。`);
  } catch (error) {
    status('planStatus', error.message, true);
  }
}

function setRecords(files, demo = false) {
  state.records = files;
  state.demoRecords = demo;
  $('clearRecords').hidden = !files.length;
  $('recordStatus').textContent = files.length ? files.map(file => file.name).join('、') : '支持教务导出的文字型 PDF，可选择多个文件。';
  clearResult();
  updateControls();
}

async function readDemoFile(path, name) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('演示文件暂不可用，请刷新重试。');
  return new File([await response.blob()], name, { type: 'application/pdf' });
}

async function loadDemo() {
  state.busy = true;
  updateControls();
  status('planStatus', '正在载入演示材料…');
  try {
    const [file, records] = await Promise.all([
      readDemoFile('./demo/plan.pdf', '演示培养方案.pdf'),
      readDemoFile('./demo/records.pdf', '演示修业记录.pdf'),
    ]);
    const plan = await parsePlan(file);
    $('auditForm').elements.mode.value = 'recommendation';
    if (![...$('term').options].some(option => option.value === demoTerm)) $('term').add(new Option(auditTermLabel(demoTerm), demoTerm));
    $('term').value = demoTerm;
    setRecords([records], true);
    $('planSelect').value = '';
    renderActivePlan();
    updateMode();
    showDraft(plan, true);
  } catch (error) {
    status('planStatus', error.message, true);
  } finally {
    state.busy = false;
    updateControls();
  }
}

const isPass = student => student.stage === '毕业' || student.stage === '√';

function renderResult() {
  const { students, plan, skipped, mode, term, isDemo } = state.result;
  const passing = students.filter(isPass).length;
  const label = mode === 'graduation' ? '毕业预审' : auditTermLabel(term) + '末 · 推免';
  $('resultContext').textContent = `${isDemo ? '模拟案例 · ' : ''}${label} · ${plan.cohort_year}级 ${plan.major}`;
  const summary = `${students.length} 人已核查 · ${passing} 人达到本次规则 · ${students.length - passing} 人待复核`;
  const rows = students.map((student, index) => {
    const issues = [...student.required_issues, ...student.elective_issues,
      ...(student.flag_results || []).filter(flag => !flag.ok).map(flag => `${flag.name}：${flag.value}`)];
    const subject = issues[0] || student.outcome_reason;
    return `<tr><td><strong>${escape(student.name)}</strong><br><span class="hint">${escape(student.sid)}</span></td>
      <td><span class="pill ${isPass(student) ? '' : 'warn'}">${isPass(student) ? '达到本次规则' : '待复核'}</span></td>
      <td>${escape(subject)}${issues.length > 1 ? ` <span class="hint">等 ${issues.length} 项</span>` : ''}</td>
      <td><button class="text-button" type="button" data-index="${index}" aria-label="查看${escape(student.name)}的明细">查看明细</button></td></tr>`;
  }).join('');
  $('results').innerHTML = `<p><strong>${summary}</strong></p>${skipped.length ? `<p class="notice">${skipped.length} 名学生的专业或年级与当前方案不匹配，需另选方案审查。</p>` : ''}
    ${students.length ? `<div class="table-scroll"><table><thead><tr><th scope="col">学生</th><th scope="col">学业核查</th><th scope="col">主要依据或缺口</th><th scope="col">明细</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
  $('results').hidden = false;
  $('exportBtn').hidden = !students.length;
  $('resultsHeading').focus();
}

function showDetail(index) {
  const { students, plan, mode } = state.result;
  const student = students[index];
  const courseSources = new Map(plan.courses.map(course => [course.code, course.page]));
  const courses = student.mandatory.map(course => {
    const rulePage = courseSources.get(course.code);
    return [course.name, course.state, course.evidence, [rulePage && `方案第 ${rulePage} 页`, course.page && `修业第 ${course.page} 页`].filter(Boolean).join(' · ')];
  });
  const modules = (student.module_results || []).flatMap(module => [module, ...module.children.map(child => ({
    ...child, name: `${module.name} / ${child.name}`,
  }))]).map(module => [module.name, module.required, module.credited, module.uncovered, module.stageCountGap || '—', module.status, module.page || '—']);
  const flags = (student.flag_results || []).map(flag => [flag.name, flag.value, flag.ok ? '达到要求' : '待复核']);
  const pending = plan.notes.filter(note => note.decision === 'pending').length;
  $('detailTitle').textContent = student.name + ' · 审查明细';
  $('detailMeta').textContent = `${student.file} · 第 ${student.start_page}–${student.end_page} 页`;
  $('detailBody').innerHTML = `<p class="notice${isPass(student) ? '' : ' error'}">${escape(student.outcome_reason)}</p>`
    + (courses.length ? `<h3>课程与计次</h3>${table(['项目', '状态', '依据', '页码'], courses)}` : '')
    + (modules.length ? `<h3>模块学分</h3>${table(['模块', '要求', '已获', '缺口', '欠修门数', '状态', '修业页码'], modules)}` : '')
    + (flags.length ? `<h3>专项</h3>${table(['专项', '记录', '状态'], flags)}` : '')
    + (pending && mode === 'graduation' ? `<p class="evidence-note">培养方案还有 ${pending} 条文字提示需人工核对。</p>` : '');
  $('detailDialog').showModal();
}

async function runAudit(event) {
  event.preventDefault();
  const entry = plans.get($('planSelect').value);
  if (!entry || !state.records.length || state.busy) return;
  const { plan, type } = entry;
  const mode = isGraduation() ? 'graduation' : 'recommendation';
  const term = mode === 'graduation' ? FULL_AUDIT : $('term').value;
  const cutoff = parseAuditTerm(term);
  const sources = state.records.map(file => file.name);
  clearResult();
  state.busy = true;
  updateControls();
  try {
    const parser = new StudentParser({ majors: [plan.major] });
    for (const file of state.records) {
      parser.startFile(file.name);
      await readPdf(file, (items, page, width, total) => {
        status('auditStatus', `正在读取 ${file.name} · 第 ${page} / ${total} 页`);
        parser.page(items, page, width);
      });
    }
    const matches = parser.finish();
    const validYear = student => Number(student.cohort) === plan.cohort_year;
    const skipped = [...parser.skipped, ...matches.filter(student => !validYear(student))];
    const students = matches.filter(validYear).map(student => reviewStudent(student, plan, cutoff));
    state.result = {
      mode, term, plan, students, skipped, skipped_students: skipped, sources, isDemo: type === 'demo' && state.demoRecords,
      plans: { [plan.major]: plan },
      rule_selection: { grade_name: `${plan.cohort_year}级`, revision: 0, majors: [{ major: plan.major, name: plan.source, version: 1 }] },
    };
    renderResult();
    status('auditStatus', '');
  } catch (error) {
    status('auditStatus', error.message, true);
  } finally {
    state.busy = false;
    updateControls();
  }
}

let zipLoading;
function loadZip() {
  if (!zipLoading) {
    zipLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/jszip.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('无法加载 Excel 导出组件。'));
      document.head.append(script);
    }).catch(error => {
      zipLoading = null;
      throw error;
    });
  }
  return zipLoading;
}

async function exportWorkbook() {
  const data = state.result;
  if (!data) return;
  $('exportBtn').disabled = true;
  try {
    const [module] = await Promise.all([import('./export.mjs'), loadZip()]);
    const bytes = await module.buildWorkbook(data);
    const title = data.mode === 'graduation' ? '毕业预审' : `推免学业审查_${data.term}`;
    await module.saveFile(bytes, `思源智审_${title}.xlsx`);
  } catch (error) {
    status('exportStatus', error.message, true);
  } finally {
    $('exportBtn').disabled = false;
  }
}

$('demoBtn').addEventListener('click', loadDemo);
$('choosePlan').addEventListener('click', () => $('planInput').click());
$('planInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || state.busy) return;
  discardDraft();
  state.busy = true;
  updateControls();
  status('planStatus', '正在识别培养方案 PDF…');
  try { showDraft(await parsePlan(file)); }
  catch (error) { status('planStatus', error.message, true); }
  finally {
    state.busy = false;
    updateControls();
  }
});
$('planPreview').addEventListener('submit', storePlan);
$('discardPlan').addEventListener('click', () => {
  discardDraft();
  status('planStatus', '');
});
$('planSelect').addEventListener('change', () => {
  clearResult();
  renderActivePlan();
});
$('chooseRecords').addEventListener('click', () => $('recordsInput').click());
$('recordsInput').addEventListener('change', event => {
  const files = Array.from(event.target.files);
  event.target.value = '';
  if (!files.length) return;
  if (files.some(file => !/\.pdf$/i.test(file.name)) || files.reduce((n, file) => n + file.size, 0) > 80 * mb) {
    status('auditStatus', '请选择 PDF 文件，合计请控制在 80 MB 以内。', true);
    return;
  }
  setRecords(files);
});
$('clearRecords').addEventListener('click', () => setRecords([]));
for (const radio of document.querySelectorAll('[name="mode"]')) radio.addEventListener('change', updateMode);
$('term').addEventListener('change', clearResult);
$('auditForm').addEventListener('submit', runAudit);
$('results').addEventListener('click', event => {
  const button = event.target.closest('[data-index]');
  if (button) showDetail(Number(button.dataset.index));
});
$('detailDialog').querySelector('button').addEventListener('click', () => $('detailDialog').close());
$('exportBtn').addEventListener('click', exportWorkbook);

for (const option of auditTermOptions()) if (option.value !== FULL_AUDIT) $('term').add(new Option(option.label, option.value));
$('term').value = defaultAuditTerm();
updateMode();
void loadPlans();
