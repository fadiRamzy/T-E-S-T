import { MONTH_NAMES } from '../domain/constants';

/** Loose Arabic-aware normalisation for sheet names and header texts. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u200E\u200F\u202A-\u202E\u00A0]/g, ' ')
    .replace(/[()[\]{}:؛،,.\-_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const MONTH_ALIASES: string[][] = [
  ['يناير', 'january', 'jan'],
  ['فبراير', 'february', 'feb'],
  ['مارس', 'march', 'mar'],
  ['ابريل', 'ابريل', 'april', 'apr'],
  ['مايو', 'ماي', 'may'],
  ['يونيو', 'يونيه', 'يونيو', 'june', 'jun'],
  ['يوليو', 'يوليه', 'يوليو', 'july', 'jul'],
  ['اغسطس', 'august', 'aug'],
  ['سبتمبر', 'september', 'sep', 'sept'],
  ['اكتوبر', 'october', 'oct'],
  ['نوفمبر', 'november', 'nov'],
  ['ديسمبر', 'december', 'dec'],
];

const ALIAS_MAP = new Map<string, number>();
MONTH_ALIASES.forEach((list, i) => {
  for (const a of list) ALIAS_MAP.set(norm(a), i + 1);
  ALIAS_MAP.set(norm(MONTH_NAMES[i]), i + 1);
});

/** 1..12 if the text is a month name (any common spelling), else 0. */
export function monthFromText(s: unknown): number {
  return ALIAS_MAP.get(norm(s)) ?? 0;
}
