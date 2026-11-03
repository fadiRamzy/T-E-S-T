export const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو',
  'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

export const SHEET = {
  main: 'التقييم السنوي 2026',
  data: 'Data',
} as const;

/** Sheets that are no longer supported by the app: ignored on import and removed from every export. */
export const REMOVED_SHEETS = ['الاجازات والاذونات', 'الزيارات الميدانية'] as const;

/** Sheets the app reads and writes (workbook order). */
export const SHEET_ORDER: string[] = [SHEET.main, ...MONTH_NAMES, SHEET.data];

export const SCORE_HEADERS = [
  'دقة الفحص والمتابعة واتمام الزيارة من جميع الاركان',
  'دقة وجودة التقارير المرسلة وسرعة الرد بالتقييم',
  'متابعة الفروع والمحاضر اليومية',
  'الالتزام بإتمام الزيارات او الفحص العشوائي و سرعة الرد بالتقييم في الوقت المحدد',
  'الالتزام بالسياسات والإجراءات التشغيلية والقرارات الادارية',
  'الالتزام بمواعيد الحضور والانصراف',
  'التطوير الذاتي و تنمية المهارات',
  'التعاون والعمل بروح الفريق',
];

export const SCORE_SHORT = [
  'دقة الفحص', 'جودة التقارير', 'متابعة الفروع', 'الالتزام بالزيارات',
  'السياسات والإجراءات', 'الحضور والانصراف', 'التطوير الذاتي', 'روح الفريق',
];

export const CAP = {
  main: 100, // rows 3..102
  monthRows: 50, // rows 3..52
  monthFirstRow: 3,
  monthLastRow: 52,
  monthScanLast: 200,
} as const;

/** Grade thresholds exactly as in the J-column formula. */
export const GRADE_BASE = { poor: 240, ok: 280, good: 330, vgood: 430 } as const;

export const GRADE_COLORS: Record<string, { bg: string; fg: string }> = {
  'ممتاز': { bg: '#2E8B3E', fg: '#ffffff' },
  'جيد جداً': { bg: '#BFE3C3', fg: '#14391b' },
  'جيد': { bg: '#FFC000', fg: '#3a2b00' },
  'مقبول': { bg: '#FFFF00', fg: '#3a3a00' },
  'ضعيف': { bg: '#FF0000', fg: '#ffffff' },
};

/** Governorate suggestions for the forms (written in the workbook's «محافظه - X» format). Suggestions only — free text is still accepted. */
export const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط',
  'بورسعيد', 'الإسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا',
  'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح',
].map((g) => `محافظه - ${g}`);
