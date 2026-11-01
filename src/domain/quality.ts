import { monthTotal } from './calc';
import { CAP, MONTH_NAMES } from './constants';
import { fmtSerial, serialToISO, swapDayMonth } from './dates';
import { buildRoster, codeKey } from './roster';
import { isIntInRange } from './validate';
import type { AppModel, QualityItem } from './types';


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

  // 8 — static items about the template
  q.push({ id: 'cf-literal', severity: 'info', title: 'قاعدة التلوين «جيد جدا» في الشيت الرئيسي لا تعمل في Excel', detail: 'الدالة تُرجع «جيد جداً» (بتنوين الفتح U+064B) بينما قاعدة التنسيق الشرطي تقارن بـ«جيد جدا» بدون التنوين. تم الإبقاء على القاعدة كما هي في الملف المُصدَّر (قرارك)، وفي التطبيق يُلوَّن بالأخضر الفاتح.' });
  q.push({ id: 'legend', severity: 'info', title: 'مفتاح الدرجات في الشيت الرئيسي ناقص', detail: 'لا يحتوي صف «ضعيف» ويعرض الحدود غير المُعدَّلة بمدة الخدمة. التطبيق يعرض مفتاحاً كاملاً مع نسب التدرج (25/50/75/100٪).' });
  const emptyMonths = MONTH_NAMES.map((_, i) => i + 1).filter((m) => model.months.filter((r) => r.month === m).every((r) => monthTotal(r) === 0));
  if (emptyMonths.length) q.push({ id: 'empty-months', severity: 'info', title: `شهور بدون درجات: ${emptyMonths.map(mn).join('، ')}`, detail: 'شهور نوفمبر/ديسمبر شبه فارغة في الملف.' });
  if (roster.overflow) q.push({ id: 'roster-cap', severity: 'error', title: `عدد الموظفين تجاوز ${CAP.main}`, detail: `${roster.overflow} موظفاً لن يظهروا في الشيت الرئيسي.` });
  if (!model.lists.sectors.length || !model.lists.governorates.length) q.push({ id: 'lists-empty', severity: 'warn', title: 'قوائم القطاع/المحافظة فارغة', detail: 'راجع صفحة «القوائم».' });
  return q;
}
