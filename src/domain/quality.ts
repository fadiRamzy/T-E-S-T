import { monthTotal } from './calc';
import { CAP, MONTH_NAMES } from './constants';
import { fmtSerial, leaveDateToISO, serialToISO, swapDayMonth, isoToSerial } from './dates';
import { buildRoster, codeKey } from './roster';
import { isIntInRange } from './validate';
import type { AppModel, QualityItem } from './types';

export const normName = (s: string) => s.replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

/** Data-quality panel (spec §5). Never fixes anything — only reports. */
export function computeQuality(model: AppModel, asOf?: string): QualityItem[] {
  const q: QualityItem[] = [];
  const roster = buildRoster(model, asOf);
  const mn = (m: number) => MONTH_NAMES[m - 1];

  // 1 — structural facts that are intentional
  q.push({ id: 'q-total', severity: 'info', title: 'إجمالي الشهر يشمل عدد الزيارات', detail: 'العمود Q في الشيتات الشهرية = SUM(H:P) أي الزيارات + 8 تقييمات، وهذا هو ما يغذي «إجمالي النقاط» السنوي. تم الإبقاء عليه كما هو.' });

  // 2 — join date correction applied
  for (const c of model.appliedCorrections) {
    q.push({ id: `corr-${c.id}`, severity: 'warn', title: `تصحيح تاريخ الالتحاق للكود ${c.code} (بموافقتك)`, detail: `${c.reason} — القيمة الأصلية ${fmtSerial(c.from)} ← القيمة المصححة ${fmtSerial(c.to)}. يُكتب التصحيح في خلايا F بالشيتات الشهرية عند التصدير.`, where: 'الشيتات الشهرية · عمود تاريخ الالتحاق' });
  }

  // 3 — suspicious join dates (day/month swapped) → warn, never fix
  for (const e of roster.rows) {
    if (typeof e.join !== 'number') {
      q.push({ id: `nojoin-${e.code}`, severity: 'warn', title: `الكود ${e.code}: تاريخ الالتحاق غير مسجل`, detail: 'بدون تاريخ التحاق يُعامل Excel الخلية كصفر فتصبح الدرجة محسوبة على سنة كاملة.' });
      continue;
    }
    const iso = serialToISO(e.join, model.date1904);
    const sw = swapDayMonth(iso);
    const first = model.months.filter((r) => codeKey(r.code) === String(e.code) && (r.scores.some((s) => typeof s === 'number') )).sort((a, b) => a.month - b.month)[0];
    if (sw && sw !== iso && first && Number(iso.slice(0, 4)) === 2026) {
      const origM = Number(iso.slice(5, 7)), swM = Number(sw.slice(5, 7));
      if (Math.abs(swM - first.month) < Math.abs(origM - first.month) && Math.abs(origM - first.month) > 1) {
        q.push({ id: `swap-${e.code}`, severity: 'warn', title: `الكود ${e.code} (${e.name}): تاريخ التحاق مشكوك فيه`, detail: `التاريخ المسجل ${fmtSerial(e.join)} بينما أول شهر فيه تقييمات هو ${mn(first.month)}؛ ربما اليوم/الشهر معكوسان (${sw.split('-').reverse().join('/')}). يمكنك تعديله من «تعديل بيانات الموظف».` });
      }
    }
  }

  // 4 — duplicates / identity drift
  const byMonthCode = new Map<string, number[]>();
  for (const r of model.months) {
    const k = codeKey(r.code);
    if (k === null) {
      q.push({ id: `nocode-${r.month}-${r.row}`, severity: 'warn', title: `${mn(r.month)} صف ${r.row}: بيانات بدون كود`, detail: 'الصف لا يدخل في الحسابات السنوية لأن الكود هو المفتاح الوحيد.' });
      continue;
    }
    const kk = `${r.month}|${k}`;
    byMonthCode.set(kk, [...(byMonthCode.get(kk) ?? []), r.row]);
  }
  for (const [kk, rows] of byMonthCode) {
    if (rows.length > 1) {
      const [m, k] = kk.split('|');
      q.push({ id: `dup-${kk}`, severity: 'error', title: `كود مكرر في ${mn(Number(m))}: ${k}`, detail: `الصفوف ${rows.join('، ')} — يستخدم Excel الصف الأول فقط.` });
    }
  }
  const idn = new Map<string, Set<string>>();
  for (const r of model.months) {
    const k = codeKey(r.code);
    if (!k) continue;
    const sig = [r.sector, r.gov, r.name, r.job, r.join].join('¦');
    idn.set(k, (idn.get(k) ?? new Set()).add(sig));
  }
  for (const [k, s] of idn) if (s.size > 1) q.push({ id: `drift-${k}`, severity: 'warn', title: `الكود ${k}: بيانات وظيفية مختلفة بين الشهور`, detail: 'يعتمد الشيت الرئيسي على أول ظهور للكود (يناير ← ديسمبر).' });

  // 5 — text in numeric cells / out-of-range
  for (const r of model.months) {
    if (typeof r.visits === 'string' && r.visits.trim() !== '')
      q.push({ id: `txtH-${r.month}-${r.row}`, severity: 'warn', title: `${mn(r.month)} صف ${r.row} (${r.name}): نص في خانة الزيارات`, detail: `«${r.visits}» — يحتفظ التطبيق بالنص ويُحسب 0 (مثل SUM في Excel).` });
    r.scores.forEach((s, i) => {
      if (s === null || s === '') return;
      if (typeof s === 'string') q.push({ id: `txtS-${r.month}-${r.row}-${i}`, severity: 'warn', title: `${mn(r.month)} صف ${r.row}: نص في معيار ${i + 1}`, detail: `«${s}» يُحسب 0.` });
      else if (!isIntInRange(s, 1, 5)) q.push({ id: `rng-${r.month}-${r.row}-${i}`, severity: 'warn', title: `${mn(r.month)} صف ${r.row} (${r.name}): تقييم خارج 1–5`, detail: `القيمة ${s} في معيار ${i + 1}.` });
    });
    if (r.row > CAP.monthLastRow) q.push({ id: `cap-${r.month}-${r.row}`, severity: 'error', title: `${mn(r.month)}: صف ${r.row} خارج السعة`, detail: 'قالب الإكسل يغطي الصفوف 3–52 فقط.' });
  }
  for (const v of model.visits)
    v.months.forEach((c, i) => {
      if (typeof c === 'string' && c.trim() !== '')
        q.push({ id: `vtxt-${v.row}-${i}`, severity: 'warn', title: `الزيارات الميدانية: نص «${c}» في ${v.name} / ${mn(i + 1)}`, detail: 'يُهمل في إجمالي الصف (يُحسب 0).' });
    });

  // 6 — leave log
  let textDates = 0, reversed = 0, textDays = 0;
  for (const l of model.leave) {
    if (l.startKind === 'text' || l.endKind === 'text') textDates++;
    const s = leaveDateToISO(l.start, l.startKind, model.date1904), e = leaveDateToISO(l.end, l.endKind, model.date1904);
    if (s && e && e < s) reversed++;
    if (typeof l.days === 'string' && l.days.trim() !== '') textDays++;
  }
  if (textDates) q.push({ id: 'leave-text-dates', severity: 'warn', title: `سجل الإجازات: ${textDates} صفاً بتواريخ نصية`, detail: 'بعض التواريخ مخزنة كنص (d/m/yyyy) وبعضها كتاريخ فعلي. التطبيق يحتفظ بالنوع الأصلي. يمكن توحيدها من صفحة الإجازات بزر اختياري.' });
  if (reversed) q.push({ id: 'leave-reversed', severity: 'warn', title: `سجل الإجازات: ${reversed} صفاً تاريخ نهايته قبل بدايته`, detail: 'غالباً بسبب عكس اليوم/الشهر في الخلايا ذات التاريخ الفعلي. لم يتم تصحيحها تلقائياً.' });
  if (textDays) q.push({ id: 'leave-text-days', severity: 'info', title: `سجل الإجازات: عمود «عدد الأيام» يحوي نصوصاً (${textDays})`, detail: 'العمود مختلط (أرقام ونصوص مثل «خميس العهد»)؛ يُعامل كمدخل حر.' });

  // 7 — names across sheets (names are NOT keys)
  const rosterNames = new Map(roster.rows.map((e) => [normName(e.name), e.name]));
  const nameIssues = (label: string, names: string[]) => {
    const miss = [...new Set(names.filter((n) => n && !rosterNames.has(normName(n))))];
    const exactDiff = [...new Set(names.filter((n) => n && rosterNames.has(normName(n)) && rosterNames.get(normName(n)) !== n))];
    if (miss.length) q.push({ id: `names-${label}`, severity: 'info', title: `${label}: أسماء غير موجودة في الشيت الرئيسي (${miss.length})`, detail: miss.join('، ') + ' — الأسماء ليست مفتاحاً؛ لم يتم أي ربط تلقائي.' });
    if (exactDiff.length) q.push({ id: `names-sp-${label}`, severity: 'info', title: `${label}: أسماء بإملاء مختلف عن الشيت الرئيسي (${exactDiff.length})`, detail: exactDiff.join('، ') });
  };
  nameIssues('الزيارات الميدانية', model.visits.map((v) => v.name));
  nameIssues('الاجازات والاذونات', model.leave.map((l) => l.name));

  // 8 — static items about the template
  q.push({ id: 'cf-literal', severity: 'info', title: 'قاعدة التلوين «جيد جدا» في الشيت الرئيسي لا تعمل في Excel', detail: 'الدالة تُرجع «جيد جداً» (بتنوين الفتح U+064B) بينما قاعدة التنسيق الشرطي تقارن بـ«جيد جدا» بدون التنوين. تم الإبقاء على القاعدة كما هي في الملف المُصدَّر (قرارك)، وفي التطبيق يُلوَّن بالأخضر الفاتح.' });
  q.push({ id: 'legend', severity: 'info', title: 'مفتاح الدرجات في الشيت الرئيسي ناقص', detail: 'لا يحتوي صف «ضعيف» ويعرض الحدود غير المُعدَّلة بمدة الخدمة. التطبيق يعرض مفتاحاً كاملاً مع نسب التدرج (25/50/75/100٪).' });
  q.push({ id: 'refs', severity: 'info', title: 'Print_Area و Print_Titles لشيت «الزيارات الميدانية» = #REF!', detail: 'مكسورة في الملف الأصلي، تُحفظ كما هي عند التصدير ولا يتم "إصلاحها".' });
  const emptyMonths = MONTH_NAMES.map((_, i) => i + 1).filter((m) => model.months.filter((r) => r.month === m).every((r) => monthTotal(r) === 0));
  if (emptyMonths.length) q.push({ id: 'empty-months', severity: 'info', title: `شهور بدون درجات: ${emptyMonths.map(mn).join('، ')}`, detail: 'شهور نوفمبر/ديسمبر شبه فارغة في الملف.' });
  if (roster.overflow) q.push({ id: 'roster-cap', severity: 'error', title: `عدد الموظفين تجاوز ${CAP.main}`, detail: `${roster.overflow} موظفاً لن يظهروا في الشيت الرئيسي.` });
  if (!model.lists.sectors.length || !model.lists.governorates.length) q.push({ id: 'lists-empty', severity: 'warn', title: 'قوائم القطاع/المحافظة فارغة', detail: 'راجع صفحة «القوائم».' });
  void isoToSerial;
  return q;
}
