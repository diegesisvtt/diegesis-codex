// Web search providers for the assistant's web_search tool.
// DuckDuckGo is keyless (default); Brave and Tavily require an API key.
// Runs in the main process.

import type { AIProviderConfig, ProviderInfo } from '../../shared/types';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchProvider {
  info: ProviderInfo;
  search(config: Record<string, string>, query: string): Promise<WebSearchResult[]>;
}

const MAX_RESULTS = 5;
const MAX_SNIPPET = 300;
const TIMEOUT_MS = 10_000;

// ---------- DuckDuckGo (keyless, HTML endpoint) ----------

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).trim();
}

/** DuckDuckGo wraps result links in /l/?uddg=<urlencoded>; unwrap when present. */
function unwrapDdgUrl(href: string): string {
  try {
    const u = new URL(href.startsWith('//') ? `https:${href}` : href);
    return u.searchParams.get('uddg') ?? href;
  } catch {
    return href;
  }
}

async function ddgSearch(_config: Record<string, string>, query: string): Promise<WebSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${DDG_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const results: WebSearchResult[] = [];
    const blockRe =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) && results.length < MAX_RESULTS) {
      results.push({
        title: stripTags(m[2]),
        url: unwrapDdgUrl(decodeEntities(m[1])),
        snippet: stripTags(m[3] ?? '').slice(0, MAX_SNIPPET),
      });
    }
    return results;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Brave Search API ----------

async function braveSearch(config: Record<string, string>, query: string): Promise<WebSearchResult[]> {
  if (!config.apiKey) throw new Error('API key da Brave ausente — configure nas Configurações de IA.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`,
      {
        headers: { 'X-Subscription-Token': config.apiKey, Accept: 'application/json' },
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (data.web?.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.description ?? '').slice(0, MAX_SNIPPET),
    }));
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Tavily Search API ----------

async function tavilySearch(config: Record<string, string>, query: string): Promise<WebSearchResult[]> {
  if (!config.apiKey) throw new Error('API key da Tavily ausente — configure nas Configurações de IA.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: config.apiKey, query, max_results: MAX_RESULTS }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.content ?? '').slice(0, MAX_SNIPPET),
    }));
  } finally {
    clearTimeout(timer);
  }
}

// ---------- registry ----------

const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    info: {
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      description: 'Busca web gratuita, sem API key. Privacidade por padrão.',
      fields: [],
    },
    search: ddgSearch,
  },
  {
    info: {
      id: 'brave',
      name: 'Brave Search',
      description: 'API oficial da Brave Search. Requer API key (plano gratuito disponível).',
      fields: [{ key: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true, placeholder: 'BSA…' }],
    },
    search: braveSearch,
  },
  {
    info: {
      id: 'tavily',
      name: 'Tavily',
      description: 'API de busca otimizada para LLMs. Requer API key.',
      fields: [{ key: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true, placeholder: 'tvly-…' }],
    },
    search: tavilySearch,
  },
];

export function listSearchProviders(): ProviderInfo[] {
  return SEARCH_PROVIDERS.map((p) => p.info);
}

export function getSearchProvider(id: string): ProviderInfo | undefined {
  return SEARCH_PROVIDERS.find((p) => p.info.id === id)?.info;
}

/** Runs a web search with the configured provider; falls back to DuckDuckGo. */
export async function runWebSearch(query: string, cfg: AIProviderConfig | null): Promise<WebSearchResult[]> {
  const provider = SEARCH_PROVIDERS.find((p) => p.info.id === cfg?.providerId) ?? SEARCH_PROVIDERS[0];
  return provider.search(cfg?.config ?? {}, query);
}
