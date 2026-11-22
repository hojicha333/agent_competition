import { auditStudent } from './engine.mjs';
import { compareAuditTerms, FULL_AUDIT } from './terms.mjs';

export const recommendationScope = '核对截至所选学期末应通过的必修与培养类型指定课程。在修和截止学期之后的成绩不计。本次范围不含独立计次、模块学分、外语、排名等其他推免条件。';
export const graduationScope = '核对已配置的必修、限选、模块学分、修读次数及专项。在修、无成绩的毕业论文等需要复核。';

export function reviewStudent(student, plan, cutoff) {
  if (cutoff === FULL_AUDIT) return auditStudent(student, plan, cutoff);

  const onTime = record => {
    const academicYear = Number(record.year?.slice(0, 4));
    return academicYear && [1, 2, 3].includes(record.semester)
      && compareAuditTerms([academicYear, record.semester], cutoff) <= 0;
  };
  const due = course => compareAuditTerms([plan.cohort_year + course.grade - 1, course.semester], cutoff) <= 0;
  const courses = plan.courses.filter(due);
  const dueCodes = new Set(courses.map(course => course.code));
  const timedStudent = {
    ...student,
    sections: student.sections.map(section => ({
      ...section, courses: section.courses.filter(record => onTime(record) && !record.remark.includes('在修')),
    })),
  };
  const scopedPlan = {
    ...plan,
    courses,
    modules: [],
    repetitions: [],
    flags: [],
    tracks: Object.fromEntries(Object.entries(plan.tracks).map(([name, codes]) => [
      name, codes.filter(code => dueCodes.has(code)),
    ])),
  };
  // 用原引擎核对截断后的记录。全部范围模式会要求实际通过，不把截止学期的在修认定为完成。
  const result = auditStudent(timedStudent, scopedPlan, FULL_AUDIT);
  result.read_history = null;
  result.audit_mode = 'recommendation';
  const unplaced = (plan.tracks[result.track] || []).filter(code => !plan.courses.some(course => course.code === code));
  if (unplaced.length) result.elective_issues.push('培养类型指定课缺建议学期：' + unplaced.join('、'));
  const issues = [...result.required_issues, ...result.elective_issues];
  result.stage = !result.mandatory.length ? '无应审课程' : issues.length ? '×' : '√';
  result.outcome_reason = issues.length ? issues.join('；') : result.mandatory.length
    ? '截止学期内的应审课程均有通过或认可记录' : '所选学期内没有可核对的应审课程';
  return result;
}
