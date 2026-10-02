import { chromium } from 'playwright';

const targets = [
  ['AliExpress', 'https://aliexpress.ru/wholesale?SearchText=PETG%201.75%201kg'],
  ['Ozon', 'https://www.ozon.ru/search/?text=PETG%201.75%201%D0%BA%D0%B3'],
  ['Wildberries', 'https://www.wildberries.ru/catalog/0/search.aspx?search=PETG%201.75%201%D0%BA%D0%B3'],
  ['Яндекс Маркет', 'https://market.yandex.ru/search?text=PETG%201.75%201%D0%BA%D0%B3'],
];

const notifyUrl = process.env.NOTIFY_URL;
const webhookKey = process.env.WEBHOOK_KEY;
if (!notifyUrl || !webhookKey) throw new Error('Не заданы NOTIFY_URL или WEBHOOK_KEY');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
  geolocation: { latitude: 55.7558, longitude: 37.6176 },
  permissions: ['geolocation'],
  viewport: { width: 1440, height: 1000 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
});

const lines = ['Проверка доступа GitHub Actions к маркетплейсам:'];

for (const [name, url] of targets) {
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    const title = (await page.title()).trim().slice(0, 100);
    const body = (await page.locator('body').innerText({ timeout: 10000 }))
      .replace(/\s+/g, ' ')
      .trim();
    const challenge = /captcha|verify you are human|провер.{0,10}(робот|браузер)|доступ ограничен|access denied|forbidden|unusual traffic/i.test(`${title} ${body.slice(0, 1500)}`);
    const useful = /PETG|PLA|филамент|пластик для 3d|катуш/i.test(body);
    const verdict = challenge ? 'БЛОКИРОВКА' : useful ? 'ДОСТУП ЕСТЬ' : 'СТРАНИЦА ОТКРЫЛАСЬ, ТОВАРЫ НЕ НАЙДЕНЫ';
    lines.push(`${name}: ${verdict}; HTTP ${response?.status() ?? 'нет'}; ${title || 'без заголовка'}`);
  } catch (error) {
    lines.push(`${name}: ОШИБКА — ${String(error.message).split('\n')[0].slice(0, 160)}`);
  } finally {
    await page.close();
  }
}

await browser.close();

const text = lines.join('\n');
console.log(text);

const notifyResponse = await fetch(notifyUrl, {
  method: 'POST',
  headers: {
    'X-Webhook-Key': webhookKey,
    'Content-Type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({ text }),
  signal: AbortSignal.timeout(30000),
});

const notifyBody = await notifyResponse.text();
if (!notifyResponse.ok) throw new Error(`Yandex Function HTTP ${notifyResponse.status}: ${notifyBody}`);
const parsed = JSON.parse(notifyBody);
if (parsed.ok !== true) throw new Error(`Yandex Function вернула ok!=true: ${notifyBody}`);

