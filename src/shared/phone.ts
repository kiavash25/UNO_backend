const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeIranianPhone(raw: string): string {
  const compact = toEnglishDigits(raw).replace(/[\s\-().]/g, "");
  if (compact.startsWith("+98")) return `0${compact.slice(3)}`;
  if (compact.startsWith("0098")) return `0${compact.slice(4)}`;
  if (compact.startsWith("98")) return `0${compact.slice(2)}`;
  return compact;
}

export function isValidIranianMobile(phone: string): boolean {
  return /^09\d{9}$/.test(phone);
}

export function iranianPhoneLookupVariants(phone: string): string[] {
  const normalized = normalizeIranianPhone(phone);
  const variants = new Set([normalized]);
  if (isValidIranianMobile(normalized)) {
    variants.add(`+98${normalized.slice(1)}`);
    variants.add(`98${normalized.slice(1)}`);
    variants.add(`0098${normalized.slice(1)}`);
  }
  return [...variants];
}
