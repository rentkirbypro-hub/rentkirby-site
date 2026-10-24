/**
 * GET /api/busy — кои дни са заети, според заявките във формата „booking“ (Netlify Forms).
 *
 * Връща само дати, без лични данни: { ok: true, booked: ['2026-11-06', ...] }
 * Всяка заявка заема дните на пакета си: Уикенд 3, Седмичен 7, Бизнес 0 (без фиксиран срок), останалите 1.
 * Изтрита заявка в Netlify → Forms → booking освобождава дните. Заявки, маркирани като спам, не се броят.
 *
 * Нужна е една променлива в Netlify: KP_NETLIFY_TOKEN — Personal access token от Netlify.
 */
const SITE_ID = '0887794e-e7ae-43fa-9921-2964672b0a96';
const FORM_NAME = 'booking';
const API = 'https://api.netlify.com/api/v1';
const TZ = 'Europe/Sofia';
const MEMO_MS = 15000;   // кратък кеш, за да не питаме Netlify API при всяко зареждане

export const config = { path: '/api/busy' };

let memo = null;

export default async (req, context) => {
  try {
    if (memo && memo.until > Date.now()) return json(memo.body);
    const token = process.env.KP_NETLIFY_TOKEN;
    if (!token) throw new Error('KP_NETLIFY_TOKEN is not set');
    const siteId = (context && context.site && context.site.id) || SITE_ID;

    const forms = await api(token, `/sites/${siteId}/forms`);
    const form = (forms || []).find((f) => f.name === FORM_NAME);
    const submissions = form ? await allSubmissions(token, form.id) : [];

    const from = addDays(today(), -1);
    const days = new Set();
    for (const s of submissions) {
      const d = (s && s.data) || {};
      const start = String(d.data || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
      const n = daysFor(String(d.paket || ''));
      for (let i = 0; i < n; i++) {
        const k = addDays(start, i);
        if (k >= from) days.add(k);
      }
    }
    const body = { ok: true, booked: [...days].sort() };
    memo = { body, until: Date.now() + MEMO_MS };
    return json(body);
  } catch (err) {
    console.error('busy failed:', err && err.message);
    return json({ ok: false }, 500);
  }
};

export function daysFor(paket) {
  if (/^Уикенд/.test(paket)) return 3;
  if (/^Седмичен/.test(paket)) return 7;
  if (/^Бизнес/.test(paket)) return 0;
  return 1;
}

async function allSubmissions(token, formId) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await api(token, `/forms/${formId}/submissions?per_page=100&page=${page}`);
    out.push(...(batch || []));
    if (!batch || batch.length < 100) break;
  }
  return out;
}

async function api(token, path) {
  const res = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error(`Netlify API ${res.status} ${path.split('?')[0]}`);
  return res.json();
}

const sofia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function today() {
  return sofia.format(new Date());
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function _resetMemo() { memo = null; }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
