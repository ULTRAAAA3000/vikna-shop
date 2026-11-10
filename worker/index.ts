import { validateOrder } from '../shared/order';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Секрет для перегляду заявок: wrangler secret put ADMIN_TOKEN */
  ADMIN_TOKEN?: string;
}

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_WINDOW_MIN = 10;
const RATE_LIMIT_MAX = 3;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Порівняння рядків без раннього виходу (захист від timing-атак). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function createOrder(request: Request, env: Env): Promise<Response> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return json({ ok: false, error: 'Очікується JSON' }, 415);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Запит завеликий' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'Некоректний JSON' }, 400);
  }

  // Honeypot: боти заповнюють приховане поле. Вдаємо успіх, нічого не зберігаючи.
  if (typeof body === 'object' && body !== null && (body as { website?: unknown }).website) {
    return json({ ok: true, id: 0 });
  }

  const result = validateOrder(body);
  if (!result.ok) return json({ ok: false, errors: result.errors }, 422);
  const order = result.data;

  // Простий ліміт: не більше 3 заявок з одного номера за 10 хвилин.
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM orders
     WHERE phone = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?2)`,
  )
    .bind(order.phone, `-${RATE_LIMIT_WINDOW_MIN} minutes`)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    return json({ ok: false, error: 'Забагато заявок. Спробуйте за кілька хвилин.' }, 429);
  }

  const res = await env.DB.prepare(
    `INSERT INTO orders (name, phone, email, city, contact, product, message, config_json, estimate_uah)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(
      order.name,
      order.phone,
      order.email,
      order.city,
      order.contact,
      order.product,
      order.message,
      order.config ? JSON.stringify(order.config) : null,
      order.estimate,
    )
    .run();

  return json({ ok: true, id: res.meta.last_row_id, estimate: order.estimate }, 201);
}

async function listOrders(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.ADMIN_TOKEN || !safeEqual(token, env.ADMIN_TOKEN)) {
    return json({ ok: false, error: 'Недостатньо прав' }, 401);
  }
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, status, name, phone, email, city, contact, product, message, config_json, estimate_uah
     FROM orders ORDER BY created_at DESC LIMIT 200`,
  ).all();
  return json({ ok: true, orders: results });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return json({ ok: true });

    if (url.pathname === '/api/orders') {
      try {
        if (request.method === 'POST') return await createOrder(request, env);
        if (request.method === 'GET') return await listOrders(request, env);
        return json({ ok: false, error: 'Метод не підтримується' }, 405);
      } catch (err) {
        console.error('orders error', err);
        return json({ ok: false, error: 'Помилка сервера. Спробуйте пізніше.' }, 500);
      }
    }

    if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'Не знайдено' }, 404);

    // Усе інше віддає статика (на випадок, якщо воркер викликано напряму).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
