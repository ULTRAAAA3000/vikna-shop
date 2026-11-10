import { type Config, estimate, sanitizeConfig } from './catalog';

/**
 * Валідація заявки. Використовується і формою (миттєві підказки),
 * і воркером (остаточна перевірка перед записом у D1).
 */

export const CONTACT_METHODS = ['call', 'telegram', 'viber', 'email'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const ORDER_PRODUCTS = ['window', 'balcony', 'entrance', 'sliding', 'other'] as const;
export type OrderProduct = (typeof ORDER_PRODUCTS)[number];

export interface OrderPayload {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  contact: ContactMethod;
  product: OrderProduct;
  message?: string;
  config?: Config | null;
  consent: boolean;
  /** Honeypot: реальні користувачі його не бачать і не заповнюють. */
  website?: string;
}

export interface CleanOrder {
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  contact: ContactMethod;
  product: OrderProduct;
  message: string | null;
  config: Config | null;
  estimate: number | null;
}

export type FieldErrors = Partial<Record<'name' | 'phone' | 'email' | 'city' | 'contact' | 'product' | 'message' | 'consent', string>>;

export type ValidationResult = { ok: true; data: CleanOrder } | { ok: false; errors: FieldErrors };

/** Нормалізує український номер до +380XXXXXXXXX; повертає null, якщо номер некоректний. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('380')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('80')) return `+3${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+38${digits}`;
  // Міжнародні номери: має бути явний «+» і 10–15 цифр
  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function validateOrder(input: unknown): ValidationResult {
  const errors: FieldErrors = {};
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  const name = str(raw.name, 80);
  if (name.length < 2) errors.name = "Вкажіть, як до вас звертатися";

  const phone = normalizePhone(str(raw.phone, 32));
  if (!phone) errors.phone = 'Введіть номер у форматі +38 0XX XXX XX XX';

  const emailRaw = str(raw.email, 120);
  if (emailRaw && !EMAIL_RE.test(emailRaw)) errors.email = 'Схоже, в адресі помилка';

  const contact = (CONTACT_METHODS as readonly string[]).includes(raw.contact as string)
    ? (raw.contact as ContactMethod)
    : 'call';
  if (contact === 'email' && !emailRaw) errors.email = 'Щоб відповісти поштою, вкажіть e-mail';

  const product = (ORDER_PRODUCTS as readonly string[]).includes(raw.product as string)
    ? (raw.product as OrderProduct)
    : 'other';

  const message = str(raw.message, 1500);
  const city = str(raw.city, 80);

  if (raw.consent !== true) errors.consent = 'Потрібна згода на обробку даних';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const config = raw.config ? sanitizeConfig(raw.config) : null;

  return {
    ok: true,
    data: {
      name,
      phone: phone as string,
      email: emailRaw || null,
      city: city || null,
      contact,
      product: config ? config.product : product,
      message: message || null,
      config,
      // Ціну завжди перераховуємо на сервері — значенню з браузера не довіряємо.
      estimate: config ? estimate(config).total : null,
    },
  };
}
