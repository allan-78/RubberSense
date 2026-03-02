const express = require('express');
const axios = require('axios');
const MarketData = require('../models/MarketData');

const router = express.Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.MARKET_GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_TIMEOUT_MS = Number(process.env.MARKET_GROQ_TIMEOUT_MS || 12000);

const MARKET_CACHE_MINUTES = (() => {
  const cacheMinutes = Number(process.env.MARKET_CACHE_MINUTES);
  if (Number.isFinite(cacheMinutes) && cacheMinutes > 0) {
    return cacheMinutes;
  }

  const cacheHours = Number(process.env.MARKET_CACHE_HOURS);
  if (Number.isFinite(cacheHours) && cacheHours > 0) {
    return cacheHours * 60;
  }

  return 20;
})();
const MARKET_HISTORY_DAYS = Number(process.env.MARKET_HISTORY_DAYS || 400);

const SOURCE_SYMBOLS = String(process.env.MARKET_SOURCE_SYMBOLS || '0DV.F')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const SOURCE_META = {
  // SHFE rubber quote is typically CNY per ton.
  '0DV.F': {
    source: 'stooq',
    name: 'Rubber - SHFE',
    quoteCurrency: 'CNY',
    quoteUnit: 'ton',
  },
  // JPX rubber fallback. Unit handling remains conservative.
  '0CK.F': {
    source: 'stooq',
    name: 'Rubber - JPX',
    quoteCurrency: 'JPY',
    quoteUnit: 'ton',
  },
};

const MAX_ANALYSIS_LENGTH = 260;
const MAX_RECOMMENDATIONS = 6;
const MAX_RECOMMENDATION_LENGTH = 140;

const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;

const fxCache = new Map();
const historyCache = new Map();

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toNumber = (value, fallback = 0) => {
  const num = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  );
  return Number.isFinite(num) ? num : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const truncateText = (value = '', max = 180) => {
  const cleaned = normalizeText(value);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3).trim()}...`;
};

const sanitizeRecommendations = (recommendations = []) => {
  if (!Array.isArray(recommendations)) return [];
  return recommendations
    .slice(0, MAX_RECOMMENDATIONS)
    .map((rec) => truncateText(rec || '', MAX_RECOMMENDATION_LENGTH))
    .filter(Boolean);
};

const sanitizeFeatures = (features = []) => {
  if (!Array.isArray(features)) return [];
  return features
    .slice(0, 8)
    .map((item) => ({
      name: truncateText(item?.name || 'Market Driver', 120),
      impact: ['High', 'Medium', 'Low'].includes(item?.impact) ? item.impact : 'Medium',
      sentiment: ['Positive', 'Negative', 'Neutral'].includes(item?.sentiment)
        ? item.sentiment
        : 'Neutral',
    }));
};

const parseStooqCsvQuote = (content = '') => {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const row = lines[1].split(',');
  if (row.length < 8) return null;

  const symbol = String(row[0] || '').trim().toUpperCase();
  const dateStr = String(row[1] || '').trim();
  const timeStr = String(row[2] || '00:00:00').trim();
  const open = toNumber(row[3], NaN);
  const high = toNumber(row[4], NaN);
  const low = toNumber(row[5], NaN);
  const close = toNumber(row[6], NaN);
  const volume = toNumber(row[7], 0);

  if (!symbol || !dateStr || Number.isNaN(close)) return null;
  if (String(dateStr).toUpperCase() === 'N/D') return null;

  let sourceTimestamp = new Date(`${dateStr}T${timeStr || '00:00:00'}Z`);
  if (Number.isNaN(sourceTimestamp.getTime())) {
    sourceTimestamp = new Date(`${dateStr}T00:00:00Z`);
  }
  if (Number.isNaN(sourceTimestamp.getTime())) return null;

  return {
    symbol,
    dateStr,
    timeStr,
    open,
    high,
    low,
    close,
    volume,
    sourceTimestamp,
  };
};

const parseStooqHistoryRows = (html = '') => {
  const text = String(html || '');
  const rowRegex = /<tr><td align=center id=t03>\d+<\/td><td nowrap>([^<]+)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/gi;
  const rows = [];

  let match;
  while ((match = rowRegex.exec(text)) !== null) {
    const dateText = normalizeText(match[1]);
    const open = toNumber(match[2], NaN);
    const high = toNumber(match[3], NaN);
    const low = toNumber(match[4], NaN);
    const close = toNumber(match[5], NaN);

    if (!dateText || Number.isNaN(close)) continue;

    const parsed = Date.parse(`${dateText} UTC`);
    const parsedLocal = Date.parse(dateText);
    const ts = Number.isFinite(parsed) ? parsed : (Number.isFinite(parsedLocal) ? parsedLocal : NaN);
    if (Number.isNaN(ts)) continue;

    rows.push({
      timestamp: new Date(ts),
      open: Number.isNaN(open) ? null : open,
      high: Number.isNaN(high) ? null : high,
      low: Number.isNaN(low) ? null : low,
      close,
    });
  }

  const byDay = new Map();
  rows.forEach((row) => {
    const day = row.timestamp.toISOString().slice(0, 10);
    byDay.set(day, row);
  });

  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
};

const getHistoryCacheKey = (symbol, from, to) => `${symbol}|${from}|${to}`;

const formatDateYYYYMMDD = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const fetchStooqCurrent = async (symbol) => {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  const response = await axios.get(url, {
    timeout: 12000,
    responseType: 'text',
    headers: { 'User-Agent': 'RubberSense/1.0' },
  });

  const parsed = parseStooqCsvQuote(response.data);
  if (!parsed || !Number.isFinite(parsed.close) || parsed.close <= 0) {
    throw new Error(`No valid quote from Stooq for ${symbol}`);
  }
  return parsed;
};

const fetchStooqHistory = async (symbol, from, to) => {
  const cacheKey = getHistoryCacheKey(symbol, from, to);
  const cached = historyCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < HISTORY_CACHE_TTL_MS) {
    return cached.rows;
  }

  const url = `https://stooq.com/q/d/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d&f=${from}&t=${to}`;
  const response = await axios.get(url, {
    timeout: 15000,
    responseType: 'text',
    headers: { 'User-Agent': 'RubberSense/1.0' },
  });

  const rows = parseStooqHistoryRows(response.data);
  historyCache.set(cacheKey, { at: Date.now(), rows });
  return rows;
};

const fetchFxRate = async (base, quote) => {
  const b = String(base || '').toUpperCase();
  const q = String(quote || '').toUpperCase();
  if (!b || !q) throw new Error('Invalid FX pair');
  if (b === q) return 1;

  const key = `${b}-${q}`;
  const cached = fxCache.get(key);
  if (cached && (Date.now() - cached.at) < FX_CACHE_TTL_MS) {
    return cached.rate;
  }

  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(b)}`;
  const response = await axios.get(url, {
    timeout: 12000,
    headers: { 'User-Agent': 'RubberSense/1.0' },
  });

  const rate = toNumber(response?.data?.rates?.[q], NaN);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Failed FX lookup ${b}->${q}`);
  }

  fxCache.set(key, { at: Date.now(), rate });
  return rate;
};

const convertQuoteToPhpPerKg = (quotePrice, meta, fxRate) => {
  const raw = toNumber(quotePrice, NaN);
  if (!Number.isFinite(raw) || raw <= 0) return NaN;

  const quoteUnit = String(meta?.quoteUnit || 'ton').toLowerCase();
  const quoteCurrency = String(meta?.quoteCurrency || 'CNY').toUpperCase();
  const finalFx = Number.isFinite(fxRate) && fxRate > 0 ? fxRate : 1;

  // Normalize quote to "quoteCurrency per kg".
  let perKg = raw;
  if (quoteUnit === 'ton' || quoteUnit === 'tonne' || quoteUnit === 't') {
    perKg = raw / 1000;
  } else if (quoteUnit === '100kg') {
    perKg = raw / 100;
  }

  // Convert quoteCurrency to PHP.
  if (quoteCurrency !== 'PHP') {
    perKg = perKg * finalFx;
  }

  return round2(perKg);
};

const buildTrend = (currentPrice, previousPrice) => {
  const current = toNumber(currentPrice, 0);
  const prev = toNumber(previousPrice, 0);
  const change = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  const priceChange = round2(change);
  const trend = priceChange > 0 ? 'RISE' : priceChange < 0 ? 'FALL' : 'NEUTRAL';
  return { priceChange, trend };
};

const buildDeterministicProjection = (currentPrice, priceChange) => {
  const current = toNumber(currentPrice, 0);
  if (!Number.isFinite(current) || current <= 0) return 0;
  const boundedChange = clamp(toNumber(priceChange, 0) / 100, -0.12, 0.12);
  return round2(current * (1 + (boundedChange * 0.6)));
};

const normalizeNextWeekProjection = ({ candidate, currentPrice, priceChange }) => {
  const current = toNumber(currentPrice, 0);
  const change = toNumber(priceChange, 0);
  const deterministic = buildDeterministicProjection(current, change);

  if (!Number.isFinite(current) || current <= 0) {
    return round2(toNumber(candidate, deterministic));
  }

  let normalized = toNumber(candidate, NaN);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return deterministic;
  }

  // Correct common unit mismatches from LLM output:
  // - per ton (x1000 compared to PHP/kg)
  // - per 100kg (x100 compared to PHP/kg)
  if (normalized >= current * 500 && normalized <= current * 5000) {
    normalized = normalized / 1000;
  } else if (normalized >= current * 50 && normalized <= current * 500) {
    normalized = normalized / 100;
  }

  const weeklyBoundPct = clamp(Math.max(Math.abs(change) * 1.5, 4), 4, 20);
  const minAllowed = current * (1 - (weeklyBoundPct / 100));
  const maxAllowed = current * (1 + (weeklyBoundPct / 100));

  if (normalized < minAllowed || normalized > maxAllowed) {
    return deterministic;
  }

  return round2(normalized);
};

const safeJsonParse = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    const first = value.indexOf('{');
    const last = value.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    try {
      return JSON.parse(value.slice(first, last + 1));
    } catch {
      return null;
    }
  }
};

const buildDeterministicFallbackInsight = ({ trend, priceChange, currentPrice, sourceName }) => {
  const movement = priceChange > 0
    ? 'edged higher'
    : priceChange < 0
      ? 'moved lower'
      : 'held steady';
  const absChange = Math.abs(priceChange).toFixed(2);

  const analysis = truncateText(
    `Latest ${sourceName} session ${movement} (${absChange}%). Current reference is PHP ${currentPrice.toFixed(2)} per kg after FX normalization.`,
    MAX_ANALYSIS_LENGTH
  );

  const recommendations = sanitizeRecommendations([
    trend === 'FALL'
      ? 'Delay non-urgent spot selling and monitor next trading session for confirmation.'
      : 'Secure partial sales while price remains favorable and keep inventory quality consistent.',
    'Track daily session closes before changing tapping or selling strategy.',
    'Use this as market reference and align farmgate negotiation per kg.'
  ]);

  const features = sanitizeFeatures([
    { name: 'Latest exchange session close', impact: 'High', sentiment: trend === 'FALL' ? 'Negative' : trend === 'RISE' ? 'Positive' : 'Neutral' },
    { name: 'FX normalization to PHP/kg', impact: 'Medium', sentiment: 'Neutral' },
  ]);

  return {
    analysis,
    recommendations,
    features,
    confidence: 72,
  };
};

const buildInsightWithGroq = async ({
  sourceName,
  symbol,
  sourcePrice,
  sourceCurrency,
  sourceUnit,
  phpPerKg,
  previousPhpPerKg,
  priceChange,
  trend,
}) => {
  if (!GROQ_API_KEY) {
    return buildDeterministicFallbackInsight({
      trend,
      priceChange,
      currentPrice: phpPerKg,
      sourceName,
    });
  }

  const systemPrompt = [
    'You are a rubber market analyst.',
    'You are given factual latest market data from a provider.',
    'Do not invent or override the current price.',
    'nextWeekProjection must be in PHP per kg (same unit as phpPerKg).',
    'Keep nextWeekProjection realistic for 1 week: usually within +/-20% of phpPerKg.',
    'Return strict JSON only:',
    '{',
    '  "analysis": "max 70 words",',
    '  "recommendations": ["max 6 concise items"],',
    '  "features": [{"name":"string","impact":"High|Medium|Low","sentiment":"Positive|Negative|Neutral"}],',
    '  "nextWeekProjection": number,',
    '  "confidence": number',
    '}',
  ].join(' ');

  const userPayload = {
    sourceName,
    symbol,
    sourcePrice,
    sourceCurrency,
    sourceUnit,
    phpPerKg,
    previousPhpPerKg,
    dayChangePercent: priceChange,
    trend,
  };

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        temperature: 0.2,
        max_tokens: 350,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: GROQ_TIMEOUT_MS,
      }
    );

    const content = response?.data?.choices?.[0]?.message?.content;
    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid Groq JSON');
    }

    const analysis = truncateText(parsed.analysis || '', MAX_ANALYSIS_LENGTH);
    const recommendations = sanitizeRecommendations(parsed.recommendations || []);
    const features = sanitizeFeatures(parsed.features || []);

    const nextWeekProjection = normalizeNextWeekProjection({
      candidate: parsed.nextWeekProjection,
      currentPrice: phpPerKg,
      priceChange,
    });

    const confidence = clamp(toNumber(parsed.confidence, 76), 0, 100);

    return {
      analysis: analysis || buildDeterministicFallbackInsight({ trend, priceChange, currentPrice: phpPerKg, sourceName }).analysis,
      recommendations: recommendations.length > 0
        ? recommendations
        : buildDeterministicFallbackInsight({ trend, priceChange, currentPrice: phpPerKg, sourceName }).recommendations,
      features: features.length > 0
        ? features
        : buildDeterministicFallbackInsight({ trend, priceChange, currentPrice: phpPerKg, sourceName }).features,
      nextWeekProjection,
      confidence,
    };
  } catch (error) {
    const fallback = buildDeterministicFallbackInsight({
      trend,
      priceChange,
      currentPrice: phpPerKg,
      sourceName,
    });
    return {
      ...fallback,
      nextWeekProjection: buildDeterministicProjection(phpPerKg, priceChange),
    };
  }
};

const toDayKey = (date) => {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const mergeHistoryPoints = ({ dbPoints = [], sourcePoints = [], latestPoint = null }) => {
  const byDay = new Map();

  const pushPoint = (point) => {
    const ts = new Date(point?.timestamp || Date.now());
    const price = toNumber(point?.price, NaN);
    if (Number.isNaN(ts.getTime()) || !Number.isFinite(price) || price <= 0) return;
    byDay.set(toDayKey(ts), {
      timestamp: ts,
      price: round2(price),
    });
  };

  dbPoints.forEach(pushPoint);
  sourcePoints.forEach(pushPoint);
  if (latestPoint) pushPoint(latestPoint);

  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
};

const padSeriesLeft = (points, total, defaultPrice) => {
  const base = [...points];
  if (base.length === 0) {
    return Array.from({ length: total }).map((_, idx) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (total - 1 - idx));
      return { timestamp: date, price: round2(defaultPrice) };
    });
  }

  while (base.length < total) {
    const first = base[0];
    const date = new Date(first.timestamp);
    date.setUTCDate(date.getUTCDate() - 1);
    base.unshift({ timestamp: date, price: first.price });
  }

  return base.slice(-total);
};

const fmtDayLabel = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtMonthLabel = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short' });

const buildDaySeries = (points, fallbackPrice) => {
  const sliced = padSeriesLeft(points.slice(-24), 24, fallbackPrice);
  return {
    labels: sliced.map((p) => fmtDayLabel(p.timestamp)),
    values: sliced.map((p) => round2(p.price)),
  };
};

const buildMonthSeries = (points, fallbackPrice) => {
  const sliced = padSeriesLeft(points.slice(-30), 30, fallbackPrice);
  return {
    labels: sliced.map((p) => fmtDayLabel(p.timestamp)),
    values: sliced.map((p) => round2(p.price)),
  };
};

const buildYearSeries = (points, fallbackPrice) => {
  const grouped = new Map();
  points.forEach((point) => {
    const d = new Date(point.timestamp);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    const current = grouped.get(key) || {
      date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
      sum: 0,
      count: 0,
    };
    current.sum += toNumber(point.price, 0);
    current.count += 1;
    grouped.set(key, current);
  });

  let monthly = [...grouped.values()]
    .sort((a, b) => a.date - b.date)
    .map((item) => ({
      timestamp: item.date,
      price: round2(item.sum / Math.max(1, item.count)),
    }));

  if (monthly.length === 0) {
    const now = new Date();
    monthly = Array.from({ length: 12 }).map((_, idx) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - idx), 1));
      return { timestamp: date, price: round2(fallbackPrice) };
    });
  } else if (monthly.length < 12) {
    const first = monthly[0];
    const missing = 12 - monthly.length;
    const prefix = Array.from({ length: missing }).map((_, idx) => {
      const date = new Date(first.timestamp);
      date.setUTCMonth(date.getUTCMonth() - (missing - idx));
      return { timestamp: date, price: first.price };
    });
    monthly = [...prefix, ...monthly];
  } else {
    monthly = monthly.slice(-12);
  }

  return {
    labels: monthly.map((p) => fmtMonthLabel(p.timestamp)),
    values: monthly.map((p) => round2(p.price)),
  };
};

const buildChartPayload = (points, fallbackPrice) => {
  const daySeries = buildDaySeries(points, fallbackPrice);
  const monthSeries = buildMonthSeries(points, fallbackPrice);
  const yearSeries = buildYearSeries(points, fallbackPrice);

  return {
    dayHistory: daySeries.values,
    dayLabels: daySeries.labels,
    monthHistory: monthSeries.values,
    monthLabels: monthSeries.labels,
    yearHistory: yearSeries.values,
    yearLabels: yearSeries.labels,

    // Backward compatibility fields.
    dailyHistory: daySeries.values,
    dailyLabels: daySeries.labels,
    monthlyHistory: yearSeries.values,
    monthlyLabels: yearSeries.labels,
  };
};

const sanitizeMarketSnapshot = (doc = {}) => {
  const obj = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  return {
    ...obj,
    nextWeekProjection: normalizeNextWeekProjection({
      candidate: obj.nextWeekProjection,
      currentPrice: obj.price,
      priceChange: obj.priceChange,
    }),
    analysis: truncateText(obj.analysis || '', MAX_ANALYSIS_LENGTH),
    recommendations: sanitizeRecommendations(obj.recommendations || []),
    features: sanitizeFeatures(obj.features || []),
  };
};

const getSourceMeta = (symbol) => SOURCE_META[symbol] || {
  source: 'stooq',
  name: `Rubber - ${symbol}`,
  quoteCurrency: 'CNY',
  quoteUnit: 'ton',
};

const getLatestStored = () => MarketData.findOne({ source: 'stooq' }).sort({ timestamp: -1 });

const getStoredHistory = async () => {
  const rowsDesc = await MarketData.find({ source: 'stooq' })
    .sort({ timestamp: -1 })
    .limit(1200)
    .lean();
  return [...rowsDesc].reverse();
};

const fetchLiveRubberData = async () => {
  let lastError = null;
  for (const symbol of SOURCE_SYMBOLS) {
    try {
      const meta = getSourceMeta(symbol);
      const quote = await fetchStooqCurrent(symbol);
      const fromDate = new Date(Date.now() - MARKET_HISTORY_DAYS * 24 * 60 * 60 * 1000);
      const from = formatDateYYYYMMDD(fromDate);
      const to = formatDateYYYYMMDD(new Date());
      const history = await fetchStooqHistory(symbol, from, to);

      const fxRate = await fetchFxRate(meta.quoteCurrency, 'PHP');
      const currentPrice = convertQuoteToPhpPerKg(quote.close, meta, fxRate);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error(`Converted price invalid for ${symbol}`);
      }

      const latestSourceRow = history.length > 0 ? history[history.length - 1] : null;
      const previousSourceRow = history.length > 1 ? history[history.length - 2] : null;
      const previousPhpPrice = previousSourceRow
        ? convertQuoteToPhpPerKg(previousSourceRow.close, meta, fxRate)
        : currentPrice;

      const sourcePoints = history.map((row) => ({
        timestamp: row.timestamp,
        price: convertQuoteToPhpPerKg(row.close, meta, fxRate),
      })).filter((row) => Number.isFinite(row.price) && row.price > 0);

      return {
        symbol,
        meta,
        quote,
        history,
        sourcePoints,
        fxRate,
        currentPrice,
        previousPhpPrice,
        latestSourceTimestamp: latestSourceRow?.timestamp || quote.sourceTimestamp,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No source symbol returned data');
};

// GET /api/market/latest
router.get('/latest', async (req, res) => {
  try {
    const forceRefresh = req.query.force === 'true';
    const cacheCutoff = new Date(Date.now() - MARKET_CACHE_MINUTES * 60 * 1000);

    const latestStored = await getLatestStored();
    const storedHistory = await getStoredHistory();

    if (!forceRefresh && latestStored && new Date(latestStored.timestamp) > cacheCutoff) {
      const fromDate = new Date(Date.now() - MARKET_HISTORY_DAYS * 24 * 60 * 60 * 1000);
      const from = formatDateYYYYMMDD(fromDate);
      const to = formatDateYYYYMMDD(new Date());
      let sourcePoints = [];
      try {
        const symbol = latestStored.sourceSymbol || SOURCE_SYMBOLS[0];
        const meta = getSourceMeta(symbol);
        const fxRate = await fetchFxRate(meta.quoteCurrency, 'PHP');
        const history = await fetchStooqHistory(symbol, from, to);
        sourcePoints = history.map((row) => ({
          timestamp: row.timestamp,
          price: convertQuoteToPhpPerKg(row.close, meta, fxRate),
        }));
      } catch {
        sourcePoints = [];
      }

      const mergedPoints = mergeHistoryPoints({
        dbPoints: storedHistory.map((item) => ({ timestamp: item.timestamp, price: item.price })),
        sourcePoints,
        latestPoint: { timestamp: latestStored.sourceTimestamp || latestStored.timestamp, price: latestStored.price },
      });

      const chartPayload = buildChartPayload(mergedPoints, latestStored.price);
      return res.json({
        success: true,
        data: {
          ...sanitizeMarketSnapshot(latestStored),
          ...chartPayload,
          stale: false,
        },
      });
    }

    const live = await fetchLiveRubberData();
    const { priceChange, trend } = buildTrend(live.currentPrice, live.previousPhpPrice);

    const insights = await buildInsightWithGroq({
      sourceName: live.meta.name,
      symbol: live.symbol,
      sourcePrice: live.quote.close,
      sourceCurrency: live.meta.quoteCurrency,
      sourceUnit: live.meta.quoteUnit,
      phpPerKg: live.currentPrice,
      previousPhpPerKg: live.previousPhpPrice,
      priceChange,
      trend,
    });

    const nextWeekProjection = normalizeNextWeekProjection({
      candidate: insights?.nextWeekProjection,
      currentPrice: live.currentPrice,
      priceChange,
    });
    const confidence = clamp(toNumber(insights?.confidence, 75), 0, 100);

    const upsertFilter = {
      source: 'stooq',
      sourceSymbol: live.symbol,
      sourceTimestamp: live.latestSourceTimestamp,
    };

    const upsertPayload = {
      timestamp: new Date(),
      source: 'stooq',
      sourceSymbol: live.symbol,
      sourceTimestamp: live.latestSourceTimestamp,
      sourcePrice: round2(live.quote.close),
      sourceCurrency: live.meta.quoteCurrency,
      sourceUnit: live.meta.quoteUnit,
      fxRate: live.fxRate,
      price: round2(live.currentPrice),
      currency: 'PHP',
      unit: 'kg',
      trend,
      priceChange,
      analysis: truncateText(insights?.analysis || '', MAX_ANALYSIS_LENGTH),
      recommendations: sanitizeRecommendations(insights?.recommendations || []),
      features: sanitizeFeatures(insights?.features || []),
      nextWeekProjection,
      confidence,
    };

    const saved = await MarketData.findOneAndUpdate(
      upsertFilter,
      { $set: upsertPayload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const latestForResponse = saved || latestStored;
    const mergedPoints = mergeHistoryPoints({
      dbPoints: storedHistory.map((item) => ({ timestamp: item.timestamp, price: item.price })),
      sourcePoints: live.sourcePoints,
      latestPoint: {
        timestamp: live.latestSourceTimestamp,
        price: live.currentPrice,
      },
    });

    const chartPayload = buildChartPayload(mergedPoints, live.currentPrice);

    res.json({
      success: true,
      data: {
        ...sanitizeMarketSnapshot(latestForResponse),
        ...chartPayload,
        stale: false,
      },
    });
  } catch (error) {
    console.error('Market API Error:', error.message);
    try {
      const latestStored = await getLatestStored();
      if (latestStored) {
        const storedHistory = await getStoredHistory();
        const mergedPoints = mergeHistoryPoints({
          dbPoints: storedHistory.map((item) => ({ timestamp: item.timestamp, price: item.price })),
          sourcePoints: [],
          latestPoint: {
            timestamp: latestStored.sourceTimestamp || latestStored.timestamp,
            price: latestStored.price,
          },
        });
        const chartPayload = buildChartPayload(mergedPoints, latestStored.price);
        return res.json({
          success: true,
          data: {
            ...sanitizeMarketSnapshot(latestStored),
            ...chartPayload,
            stale: true,
          },
        });
      }
    } catch (fallbackError) {
      console.error('Market fallback failed:', fallbackError.message);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch market data',
      details: error.message,
    });
  }
});

// GET /api/market/history
router.get('/history', async (req, res) => {
  try {
    const includeAll = req.query.all === 'true';
    const filter = includeAll ? {} : { source: 'stooq' };
    const historyDesc = await MarketData.find(filter).sort({ timestamp: -1 }).limit(365).lean();
    const history = [...historyDesc].reverse();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
