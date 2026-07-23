/**
 * CoinGecko free API helpers. All external calls go through fetch — no
 * Node-only packages. Credentials from env (COINGECKO_API_KEY optional for
 * free tier).
 */

const BASE = "https://api.coingecko.com/api/v3";

function apiKey(): string | undefined {
  return typeof process !== "undefined"
    ? process.env.COINGECKO_API_KEY
    : undefined;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = apiKey();
  if (key) h["x-cg-demo-api-key"] = key;
  return h;
}

// Common ticker → CoinGecko id mapping
const TICKER_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LINK: "chainlink",
  UNI: "uniswap",
  LTC: "litecoin",
  ATOM: "cosmos",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  TRX: "tron",
  SHIB: "shiba-inu",
};

export function tickerToCoinId(ticker: string): string | undefined {
  return TICKER_MAP[ticker.toUpperCase()];
}

export interface CoinPrice {
  ticker: string;
  coinId: string;
  priceUsd: number;
  change1hPercent: number;
  change24hPercent: number;
  marketCapUsd: number;
}

export async function fetchPrice(coinId: string): Promise<CoinPrice | null> {
  try {
    const url = `${BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; usd_market_cap?: number }>;
    const coin = data[coinId];
    if (!coin?.usd) return null;

    // Get 1h change from market_chart
    let change1h = 0;
    try {
      const chartUrl = `${BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=1`;
      const chartRes = await fetch(chartUrl, { headers: headers() });
      if (chartRes.ok) {
        const chartData = (await chartRes.json()) as { prices: [number, number][] };
        const prices = chartData.prices;
        if (prices.length >= 2) {
          const currentPrice = prices[prices.length - 1][1];
          const oneHourAgo = Date.now() - 3600000;
          // Find closest price to 1 hour ago
          let closest = prices[0];
          for (const p of prices) {
            if (Math.abs(p[0] - oneHourAgo) < Math.abs(closest[0] - oneHourAgo)) {
              closest = p;
            }
          }
          change1h = ((currentPrice - closest[1]) / closest[1]) * 100;
        }
      }
    } catch {
      // 1h change unavailable — use 0
    }

    // Find ticker from coinId
    let ticker = coinId;
    for (const [t, id] of Object.entries(TICKER_MAP)) {
      if (id === coinId) {
        ticker = t;
        break;
      }
    }

    return {
      ticker,
      coinId,
      priceUsd: coin.usd,
      change1hPercent: change1h,
      change24hPercent: coin.usd_24h_change ?? 0,
      marketCapUsd: coin.usd_market_cap ?? 0,
    };
  } catch {
    return null;
  }
}

export interface SearchCoin {
  id: string;
  name: string;
  symbol: string;
}

export async function searchCoins(query: string): Promise<SearchCoin[]> {
  try {
    const url = `${BASE}/search?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return [];
    const data = (await res.json()) as { coins: Array<{ id: string; name: string; symbol: string }> };
    return data.coins.slice(0, 10).map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
    }));
  } catch {
    return [];
  }
}

export async function fetchBatchPrices(
  coinIds: string[],
): Promise<Record<string, CoinPrice>> {
  if (coinIds.length === 0) return {};
  const results: Record<string, CoinPrice> = {};

  // Batch in groups of 25 (CoinGecko free tier limit)
  for (let i = 0; i < coinIds.length; i += 25) {
    const batch = coinIds.slice(i, i + 25);
    const ids = batch.join(",");
    try {
      const url = `${BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; usd_market_cap?: number }>;

      for (const coinId of batch) {
        const coin = data[coinId];
        if (!coin?.usd) continue;

        // Get 1h change per coin
        let change1h = 0;
        try {
          const chartUrl = `${BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=1`;
          const chartRes = await fetch(chartUrl, { headers: headers() });
          if (chartRes.ok) {
            const chartData = (await chartRes.json()) as { prices: [number, number][] };
            const prices = chartData.prices;
            if (prices.length >= 2) {
              const currentPrice = prices[prices.length - 1][1];
              const oneHourAgo = Date.now() - 3600000;
              let closest = prices[0];
              for (const p of prices) {
                if (Math.abs(p[0] - oneHourAgo) < Math.abs(closest[0] - oneHourAgo)) {
                  closest = p;
                }
              }
              change1h = ((currentPrice - closest[1]) / closest[1]) * 100;
            }
          }
        } catch {
          // skip
        }

        let ticker = coinId;
        for (const [t, id] of Object.entries(TICKER_MAP)) {
          if (id === coinId) {
            ticker = t;
            break;
          }
        }

        results[coinId] = {
          ticker,
          coinId,
          priceUsd: coin.usd,
          change1hPercent: change1h,
          change24hPercent: coin.usd_24h_change ?? 0,
          marketCapUsd: coin.usd_market_cap ?? 0,
        };
      }
    } catch {
      // skip batch
    }
  }
  return results;
}
