import { CAP, LEAVE_TYPES } from './constants';
import { leaveDateToISO, todayISO } from './dates';
import { codeKey } from './roster';
import type { AppModel, LeaveRow, MonthRecord, Raw } from './types';

export interface FieldIssue {
  field: string;
  level: 'error' | 'warn';
  message: string;
}

export function isIntInRange(v: Raw, lo: number, hi = Infinity): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

/** UI-level validation for a month record (errors block saving, warnings do not). */
export function validateMonthRecord(model: AppModel, rec: MonthRecord, original?: MonthRecord): FieldIssue[] {
  const out: FieldIssue[] = [];
  const key = codeKey(rec.code);
  if (key === null) out.push({ field: 'code', level: 'error', message: 'الكود مطلوب' });
  else {
    if (!/^\d+$/.test(key)) out.push({ field: 'code', level: 'error', message: 'الكود يجب أن يكون أرقاماً فقط' });
    const dup = model.months.find(
      (r) => r.month === rec.month && codeKey(r.code) === key && !(original && r.row === original.row),
    );
    if (dup) out.push({ field: 'code', level: 'error', message: `الكود ${key} موجود بالفعل في هذا الشهر (صف ${dup.row})` });
    // identity consistency across months
    const other = model.months.find((r) => r.month !== rec.month && codeKey(r.code) === key);
    if (other && other.name && rec.name && other.name.trim() !== rec.name.trim()) {
      out.push({ field: 'name', level: 'warn', message: `الاسم يختلف عن الاسم المسجل لنفس الكود في شهر آخر («${other.name}»)` });
    }
  }
  if (!rec.name.trim()) out.push({ field: 'name', level: 'error', message: 'اسم الموظف مطلوب' });
  if (rec.visits !== null && rec.visits !== '' && !isIntInRange(rec.visits, 0))
    out.push({ field: 'visits', level: 'warn', message: 'عدد الزيارات يجب أن يكون رقماً صحيحاً ≥ 0 (القيمة النصية تُحسب 0)' });
  rec.scores.forEach((s, i) => {
    if (s !== null && s !== '' && !isIntInRange(s, 1, 5))
      out.push({ field: `s${i + 1}`, level: 'warn', message: `المعيار ${i + 1}: التقييم يجب أن يكون رقماً صحيحاً من 1 إلى 5` });
  });
  if (typeof rec.join === 'number' && rec.join > 0) {
    // not in the future — warn only
    const iso = todayISO();
    const [y, m, d] = iso.split('-').map(Number);
    const today = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
    if (rec.join > today) out.push({ field: 'join', level: 'warn', message: 'تاريخ الالتحاق في المستقبل' });
  }
  if (rec.sector && !model.lists.sectors.includes(rec.sector))
    out.push({ field: 'sector', level: 'warn', message: 'القطاع غير موجود في القوائم (سيُحفظ كما هو)' });
  if (rec.gov && !model.lists.governorates.includes(rec.gov))
    out.push({ field: 'gov', level: 'warn', message: 'المحافظة غير موجودة في القوائم (سيُحفظ كما هي)' });
  return out;
}

export function validateLeave(model: AppModel, r: LeaveRow): FieldIssue[] {
  const out: FieldIssue[] = [];
  if (!r.name.trim()) out.push({ field: 'name', level: 'error', message: 'اسم الموظف مطلوب' });
  if (r.type && !(LEAVE_TYPES as readonly string[]).includes(r.type))
    out.push({ field: 'type', level: 'warn', message: 'نوع غير معروف (خارج القائمة الستة)' });
  const s = leaveDateToISO(r.start, r.startKind, model.date1904);
  const e = leaveDateToISO(r.end, r.endKind, model.date1904);
  if (r.startKind === 'text' && !s) out.push({ field: 'start', level: 'warn', message: 'تاريخ البداية نص غير مفهوم' });
  if (r.endKind === 'text' && !e) out.push({ field: 'end', level: 'warn', message: 'تاريخ النهاية نص غير مفهوم' });
  if (s && e && e < s) out.push({ field: 'end', level: 'warn', message: 'تاريخ النهاية قبل تاريخ البداية' });
  return out;
}

export const capacityMessage = {
  monthFull: `لا توجد صفوف فارغة في هذا الشهر (الحد الأقصى ${CAP.monthRows} صفاً حسب قالب الإكسل).`,
  mainFull: `تجاوز عدد الموظفين سعة الشيت الرئيسي (${CAP.main} موظف).`,
  leaveFull: `تجاوز سجل الإجازات سعة القالب (${CAP.leaveLast - CAP.leaveFirst + 1} صفاً).`,
  visitsFull: `تجاوز لوحة الزيارات الحد الأقصى المسموح (${CAP.visitMax} صفاً).`,
};
