export type SandboxTemplate = {
  id: string;
  label: string;
  targetUrl: string;
  schema: Array<{ name: string; type: string }>;
  selectors: Record<string, string>;
};

export const SCRAPER_TEMPLATES: SandboxTemplate[] = [
  {
    id: 'demo-site',
    label: 'Demo site (self-healing sandbox)',
    targetUrl: '/demo-site',
    schema: [
      { name: 'product_name', type: 'string' },
      { name: 'price', type: 'number' },
      { name: 'currency', type: 'string' },
      { name: 'availability', type: 'string' },
      { name: 'product_url', type: 'url' },
    ],
    selectors: {
      product_name: '.product-title',
      price: '.product-price',
      currency: '.product-currency',
      availability: '.product-stock',
      product_url: '.product-link',
    },
  },
  {
    id: 'quotes',
    label: 'Quotes (quotes.toscrape.com)',
    targetUrl: 'https://quotes.toscrape.com/',
    schema: [
      { name: 'quote', type: 'string' },
      { name: 'author', type: 'string' },
      { name: 'tags', type: 'string' },
    ],
    selectors: {
      quote: '.quote .text',
      author: '.quote .author',
      tags: '.quote .tag',
    },
  },
  {
    id: 'books-travel',
    label: 'Travel books (books.toscrape.com)',
    targetUrl: 'https://books.toscrape.com/catalogue/category/books/Travel_2/index.html',
    schema: [
      { name: 'product_name', type: 'string' },
      { name: 'price', type: 'number' },
      { name: 'currency', type: 'string' },
      { name: 'availability', type: 'string' },
      { name: 'product_url', type: 'url' },
    ],
    selectors: {
      product_name: 'h3 a',
      price: '.price_color',
      currency: '.price_color',
      availability: '.availability',
      product_url: 'h3 a',
    },
  },
];

export function getTemplateForUrl(targetUrl: string): SandboxTemplate | undefined {
  const url = targetUrl.toLowerCase();
  if (url.includes('/demo-site') || url.includes('/api/demo')) {
    return SCRAPER_TEMPLATES.find((t) => t.id === 'demo-site');
  }
  if (url.includes('quotes.toscrape.com')) {
    return SCRAPER_TEMPLATES.find((t) => t.id === 'quotes');
  }
  if (url.includes('books.toscrape.com')) {
    return SCRAPER_TEMPLATES.find((t) => t.id === 'books-travel');
  }
  return undefined;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuotes(html: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const blocks = html.split('<div class="quote"');

  for (const block of blocks.slice(1)) {
    const textMatch = block.match(/<span class="text"[^>]*>([\s\S]*?)<\/span>/);
    const authorMatch = block.match(/<small class="author"[^>]*>([\s\S]*?)<\/small>/);
    const tagMatches = [...block.matchAll(/<a class="tag"[^>]*>([\s\S]*?)<\/a>/g)];

    if (!textMatch) continue;

    records.push({
      quote: decodeHtml(textMatch[1].replace(/^["“]|["”]$/g, '')),
      author: authorMatch ? decodeHtml(authorMatch[1]) : null,
      tags: tagMatches.map((m) => decodeHtml(m[1])).join(', ') || null,
    });
  }

  return records;
}

function parseBooks(html: string, baseUrl: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const blocks = html.split('<article class="product_pod">');

  for (const block of blocks.slice(1)) {
    const titleMatch = block.match(/<h3>\s*<a[^>]*title="([^"]*)"[^>]*href="([^"]*)"/);
    const priceMatch = block.match(/<p class="price_color">([^<]+)<\/p>/);
    const stockMatch = block.match(/<p class="instock availability">([\s\S]*?)<\/p>/);

    if (!titleMatch || !priceMatch) continue;

    const priceText = priceMatch[1].trim();
    const numeric = parseFloat(priceText.replace(/[^0-9.]/g, ''));

    records.push({
      product_name: decodeHtml(titleMatch[1]),
      price: Number.isFinite(numeric) ? numeric : null,
      currency: priceText.includes('£') ? 'GBP' : priceText.includes('$') ? 'USD' : 'GBP',
      availability: stockMatch ? decodeHtml(stockMatch[1]) : null,
      product_url: new URL(titleMatch[2], baseUrl).href,
    });
  }

  return records;
}

export async function fetchSandboxRecords(targetUrl: string): Promise<Record<string, unknown>[] | null> {
  const template = getTemplateForUrl(targetUrl);
  if (!template || template.id === 'demo-site') return null;

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'MetanoiaSandboxScraper/1.0' },
      next: { revalidate: 0 },
    });

    if (!res.ok) return null;
    const html = await res.text();

    if (template.id === 'quotes') {
      return parseQuotes(html);
    }

    if (template.id === 'books-travel') {
      return parseBooks(html, targetUrl);
    }
  } catch (e) {
    console.error('Sandbox fetch failed:', e);
  }

  return null;
}

export function mapRecordsToSchema(
  records: Record<string, unknown>[],
  schema: Record<string, string>
): Record<string, unknown>[] {
  return records.map((record) => {
    const mapped: Record<string, unknown> = {};
    for (const field of Object.keys(schema)) {
      mapped[field] = record[field] ?? null;
    }
    return mapped;
  });
}
