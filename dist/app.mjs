import { StudentParser } from './engine.mjs';
import { PlanParser } from './plan-import.mjs';
import { planKey, planLabel, validatePlan } from './rule-schema.mjs';
import { readPdf } from './pdf-reader.mjs';
import { describeUnmatched, graduationScope, recommendationScope, reviewStudent } from './review.mjs';
import { auditTermLabel, auditTermOptions, defaultAuditTerm, FULL_AUDIT, parseAuditTerm } from './terms.mjs';

const $ = id => document.getElementById(id);
const mb = 1024 ** 2;
const storageKey = 'siyuan-reviewed-plans-v1';
const plans = new Map();
const state = { busy: false, draft: null, records: [], result: null, deletePlanKey: null };
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
    'choosePlan', 'chooseRecords', 'clearRecords',
    'recordsInput', 'planInput', 'planYear', 'planMajor', 'planConfirmed', 'discardPlan',
  ];
  for (const id of controls) $(id).disabled = state.busy;
  for (const control of document.querySelectorAll('#planPreview button, #planList button, #deletePlanForm button, [name="mode"]')) {
    control.disabled = state.busy;
  }
  $('term').disabled = state.busy || isGraduation();
  $('runBtn').disabled = state.busy || !plans.size || !state.records.length;
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

function refreshPlans() {
  $('planEmpty').hidden = plans.size > 0;
  $('planList').hidden = !plans.size;
  $('planList').innerHTML = [...plans.entries()].map(([key, plan]) =>
    `<li><div><strong>${escape(planLabel(plan))}</strong><span class="hint">${escape(plan.source)}</span></div>
    <button class="text-button" type="button" data-plan-key="${escape(key)}" aria-label="删除${escape(planLabel(plan))}培养方案">删除</button></li>`
  ).join('');
  updateControls();
}

function readSavedPlans() {
  return JSON.parse(localStorage.getItem(storageKey) || '[]');
}

function savePlanChange(key, replacement, expected) {
  const update = () => {
    const latest = readSavedPlans();
    const index = latest.findIndex(plan => plan && planKey(plan.cohort_year, plan.major) === key);
    if (expected && index >= 0 && JSON.stringify(latest[index]) !== JSON.stringify(expected)) return false;
    if (replacement) {
      if (index < 0) latest.push(replacement);
      else latest[index] = replacement;
    } else if (index >= 0) {
      latest.splice(index, 1);
    }
    localStorage.setItem(storageKey, JSON.stringify(latest));
    return true;
  };
  return navigator.locks ? navigator.locks.request(storageKey, update) : update();
}

function loadPlans() {
  try {
    const choices = readSavedPlans();
    for (const plan of choices) {
      if (plan?.schema_version !== 2 || !plan.reviewed) continue;
      try {
        validatePlan(plan, { active: true });
        plans.set(planKey(plan.cohort_year, plan.major), plan);
      } catch {
        status('planStatus', '部分本机培养方案无法读取，可重新导入 PDF。', true);
      }
    }
  } catch {
    status('planStatus', '本机培养方案无法读取，可重新导入 PDF。', true);
  }
  refreshPlans();
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

function showDraft(plan) {
  state.draft = plan;
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
  status('planStatus', 'PDF 已读取。请核对培养方案适用的年级、专业及审查条款。');
}

function discardDraft() {
  state.draft = null;
  $('planPreview').hidden = true;
}

async function storePlan(event) {
  event.preventDefault();
  if (!state.draft || state.busy) return;
  const plan = { ...state.draft, major: $('planMajor').value.trim(), cohort_year: $('planYear').valueAsNumber, reviewed: true };
  try {
    validatePlan(plan, { active: true });
  } catch (error) {
    status('planStatus', error.message, true);
    return;
  }
  const key = planKey(plan.cohort_year, plan.major);
  const replacing = plans.has(key);
  state.busy = true;
  updateControls();
  let saved = true;
  try {
    await savePlanChange(key, plan);
  } catch {
    saved = false;
  }
  plans.set(key, plan);
  discardDraft();
  clearResult();
  state.busy = false;
  refreshPlans();
  status('planStatus', saved ? `${planLabel(plan)}培养方案已${replacing ? '更新' : '启用'}。`
    : '方案已启用。浏览器存储不可用，刷新后需重新导入。');
}

function showDeletePlan(event) {
  const button = event.target.closest('[data-plan-key]');
  if (!button || state.busy) return;
  const key = button.dataset.planKey;
  const plan = plans.get(key);
  if (!plan) return;
  state.deletePlanKey = key;
  $('deletePlanSummary').textContent = `${planLabel(plan)} · ${plan.source}`;
  $('deletePlanDialog').showModal();
}

async function deletePlan(event) {
  event.preventDefault();
  const key = state.deletePlanKey;
  const plan = plans.get(key);
  if (!plan || state.busy) return;
  state.busy = true;
  updateControls();
  let message = `已删除 ${planLabel(plan)}培养方案。`;
  let saved = true;
  let deleted = false;
  try {
    deleted = await savePlanChange(key, null, plan);
    if (!deleted) {
      saved = false;
      message = '这份方案已在其他页面更新，请刷新后再删除。';
    }
  } catch {
    deleted = true;
    saved = false;
    message = '方案已从当前页面移除。本机存储未更新，刷新后可能恢复。';
  }
  state.busy = false;
  $('deletePlanDialog').close();
  if (deleted) {
    plans.delete(key);
    clearResult();
    refreshPlans();
    ($('planList').querySelector('button') || $('choosePlan')).focus();
  } else {
    updateControls();
  }
  status('planStatus', message, !saved);
}

function setRecords(files) {
  state.records = files;
  $('clearRecords').hidden = !files.length;
  $('recordStatus').textContent = files.length ? files.map(file => file.name).join('、') : '支持教务导出的文字型 PDF，可选择多个文件。';
  clearResult();
  updateControls();
}

const isPass = student => student.stage === '毕业' || student.stage === '√';

function renderResult() {
  const { students, applied_plans, skipped_students, mode, term } = state.result;
  const passing = students.filter(isPass).length;
  const label = mode === 'graduation' ? '毕业预审' : auditTermLabel(term) + '末 · 推免';
  $('resultContext').textContent = `${label} · 已匹配 ${applied_plans.length} 份培养方案`;
  const summary = `${students.length} 人已核查 · ${passing} 人达到本次规则 · ${students.length - passing} 人待复核`;
  const rows = students.map((student, index) => {
    const issues = [...student.required_issues, ...student.elective_issues,
      ...(student.flag_results || []).filter(flag => !flag.ok).map(flag => `${flag.name}：${flag.value}`)];
    const subject = issues[0] || student.outcome_reason;
    return `<tr><td><strong>${escape(student.name)}</strong><br><span class="hint">${escape(student.sid)}</span></td>
      <td>${escape(planLabel(student.rule_meta))}</td>
      <td><span class="pill ${isPass(student) ? '' : 'warn'}">${isPass(student) ? '达到本次规则' : '待复核'}</span></td>
      <td>${escape(subject)}${issues.length > 1 ? ` <span class="hint">等 ${issues.length} 项</span>` : ''}</td>
      <td><button class="text-button" type="button" data-index="${index}" aria-label="查看${escape(student.name)}的明细">查看明细</button></td></tr>`;
  }).join('');
  const unmatched = describeUnmatched(skipped_students);
  $('results').innerHTML = `<p><strong>${summary}</strong></p>${unmatched ? `<p class="notice">${escape(unmatched)}</p>` : ''}
    ${students.length ? `<div class="table-scroll"><table><thead><tr><th scope="col">学生</th><th scope="col">采用方案</th><th scope="col">学业核查</th><th scope="col">主要依据或缺口</th><th scope="col">明细</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
  $('results').hidden = false;
  $('exportBtn').hidden = false;
  $('resultsHeading').focus();
}

function showDetail(index) {
  const { students, mode } = state.result;
  const student = students[index];
  const plan = plans.get(planKey(student.cohort, student.major));
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
  $('detailMeta').textContent = `${planLabel(plan)} · ${plan.source}｜${student.file} · 第 ${student.start_page}–${student.end_page} 页`;
  $('detailBody').innerHTML = `<p class="notice${isPass(student) ? '' : ' error'}">${escape(student.outcome_reason)}</p>`
    + (courses.length ? `<h3>课程与计次</h3>${table(['项目', '状态', '依据', '页码'], courses)}` : '')
    + (modules.length ? `<h3>模块学分</h3>${table(['模块', '要求', '已获', '缺口', '欠修门数', '状态', '修业页码'], modules)}` : '')
    + (flags.length ? `<h3>专项</h3>${table(['专项', '记录', '状态'], flags)}` : '')
    + (pending && mode === 'graduation' ? `<p class="evidence-note">培养方案还有 ${pending} 条文字提示需人工核对。</p>` : '');
  $('detailDialog').showModal();
}

async function runAudit(event) {
  event.preventDefault();
  if (!plans.size || !state.records.length || state.busy) return;
  const mode = isGraduation() ? 'graduation' : 'recommendation';
  const term = mode === 'graduation' ? FULL_AUDIT : $('term').value;
  const cutoff = parseAuditTerm(term);
  const sources = state.records.map(file => file.name);
  clearResult();
  state.busy = true;
  updateControls();
  try {
    const parser = new StudentParser({ matchMajor: (major, cohort) => plans.get(planKey(cohort, major))?.major });
    for (const file of state.records) {
      parser.startFile(file.name);
      await readPdf(file, (items, page, width, total) => {
        status('auditStatus', `正在读取 ${file.name} · 第 ${page} / ${total} 页`);
        parser.page(items, page, width);
      });
    }
    const usedPlans = new Map();
    const students = parser.finish().map(student => {
      const key = planKey(student.cohort, student.major);
      const plan = plans.get(key);
      usedPlans.set(key, plan);
      return reviewStudent(student, plan, cutoff);
    });
    const skipped = [...new Map(parser.skipped.map(student => [student.sid, student])).values()];
    state.result = {
      mode, term, students, skipped_students: skipped, sources, applied_plans: [...usedPlans.values()],
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
$('planList').addEventListener('click', showDeletePlan);
$('deletePlanForm').addEventListener('submit', deletePlan);
$('cancelPlanDelete').addEventListener('click', () => $('deletePlanDialog').close());
$('deletePlanDialog').addEventListener('cancel', event => {
  if (state.busy) event.preventDefault();
});
$('deletePlanDialog').addEventListener('close', () => { state.deletePlanKey = null; });
$('discardPlan').addEventListener('click', () => {
  discardDraft();
  status('planStatus', '');
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
loadPlans();
