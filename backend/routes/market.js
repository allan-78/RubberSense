const express = require('express');
const router = express.Router();
const axios = require('axios');
const MarketData = require('../models/MarketData');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MARKET_CACHE_HOURS = Number(process.env.MARKET_CACHE_HOURS || 24);
const GROQ_MODEL = process.env.MARKET_GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_TIMEOUT_MS = Number(process.env.MARKET_GROQ_TIMEOUT_MS || 12000);
const MAX_ANALYSIS_LENGTH = 260;
const MAX_RECOMMENDATIONS = 6;
const MAX_RECOMMENDATION_LENGTH = 140;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmtWeekday = (date) => new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
const fmtMonth = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short' });
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

const sanitizeMarketSnapshot = (data) => {
    const obj = data && typeof data.toObject === 'function' ? data.toObject() : (data || {});
    return {
        ...obj,
        analysis: truncateText(obj.analysis || '', MAX_ANALYSIS_LENGTH),
        recommendations: sanitizeRecommendations(obj.recommendations || []),
    };
};

const buildDailySeries = (history, fallbackPrice = 0) => {
    const grouped = new Map();
    (history || []).forEach((entry) => {
        const d = new Date(entry.timestamp || Date.now());
        const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const key = dayDate.toISOString().slice(0, 10);
        const prev = grouped.get(key) || { sum: 0, count: 0, date: dayDate };
        prev.sum += toNumber(entry.price, fallbackPrice);
        prev.count += 1;
        grouped.set(key, prev);
    });

    let points = [...grouped.values()]
        .sort((a, b) => a.date - b.date)
        .map((p) => ({ timestamp: p.date, price: round2(p.sum / Math.max(1, p.count)) }));

    if (points.length > 7) points = points.slice(-7);

    if (points.length === 0) {
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return { labels, values: Array(7).fill(round2(fallbackPrice)) };
    }

    const values = [];
    const labels = [];
    const firstDate = new Date(points[0].timestamp || Date.now());
    const firstPrice = round2(points[0].price || fallbackPrice);
    const missing = 7 - points.length;

    for (let i = missing; i > 0; i--) {
        const d = new Date(firstDate);
        d.setDate(d.getDate() - i);
        labels.push(fmtWeekday(d));
        values.push(firstPrice);
    }

    points.forEach((p) => {
        labels.push(fmtWeekday(p.timestamp || Date.now()));
        values.push(round2(p.price || fallbackPrice));
    });

    return { labels, values };
};

const buildMonthlySeries = (history, fallbackPrice = 0) => {
    const grouped = new Map();
    (history || []).forEach((entry) => {
        const d = new Date(entry.timestamp || Date.now());
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        const prev = grouped.get(key) || { sum: 0, count: 0, date: new Date(d.getFullYear(), d.getMonth(), 1) };
        prev.sum += toNumber(entry.price, fallbackPrice);
        prev.count += 1;
        grouped.set(key, prev);
    });

    let monthly = [...grouped.values()]
        .sort((a, b) => a.date - b.date)
        .map((m) => ({ label: fmtMonth(m.date), value: round2(m.sum / Math.max(1, m.count)), date: m.date }));

    if (monthly.length > 12) monthly = monthly.slice(-12);

    if (monthly.length === 0) {
        const now = new Date();
        monthly = Array.from({ length: 12 }).map((_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            return { label: fmtMonth(d), value: round2(fallbackPrice), date: d };
        });
    } else if (monthly.length < 12) {
        const first = monthly[0];
        const missing = 12 - monthly.length;
        const pad = [];
        for (let i = missing; i > 0; i--) {
            const d = new Date(first.date.getFullYear(), first.date.getMonth() - i, 1);
            pad.push({ label: fmtMonth(d), value: first.value, date: d });
        }
        monthly = [...pad, ...monthly];
    }

    return {
        labels: monthly.map((m) => m.label),
        values: monthly.map((m) => m.value),
    };
};

const buildChartPayload = (history, fallbackPrice = 0) => {
    const daily = buildDailySeries(history, fallbackPrice);
    const monthly = buildMonthlySeries(history, fallbackPrice);
    return {
        dailyHistory: daily.values,
        dailyLabels: daily.labels,
        monthlyHistory: monthly.values,
        monthlyLabels: monthly.labels,
    };
};

const sanitizeFeatures = (features = []) => {
    if (!Array.isArray(features)) return [];
    return features.slice(0, 8).map((f) => ({
        name: String(f?.name || 'Market Driver').slice(0, 120),
        impact: ['High', 'Medium', 'Low'].includes(f?.impact) ? f.impact : 'Medium',
        sentiment: ['Positive', 'Negative', 'Neutral'].includes(f?.sentiment) ? f.sentiment : 'Neutral',
    }));
};

// GET /api/market/latest
router.get('/latest', async (req, res) => {
    try {
        const forceRefresh = req.query.force === 'true';
        
        // 1. Check for recent cached data
        const cacheCutoff = new Date(Date.now() - MARKET_CACHE_HOURS * 60 * 60 * 1000);
        const latestData = await MarketData.findOne().sort({ timestamp: -1 });
        const recentHistoryDesc = await MarketData.find().sort({ timestamp: -1 }).limit(500).lean();
        const recentHistory = [...recentHistoryDesc].reverse();

        if (!forceRefresh && latestData && latestData.timestamp > cacheCutoff) {
            const chartPayload = buildChartPayload(recentHistory, latestData.price);
            return res.json({
                success: true,
                data: {
                    ...sanitizeMarketSnapshot(latestData),
                    ...chartPayload
                }
            });
        }

        // 2. Fetch new data from Groq AI
        if (!GROQ_API_KEY) {
            if (latestData) {
                const chartPayload = buildChartPayload(recentHistory, latestData.price);
                return res.json({
                    success: true,
                    data: {
                        ...sanitizeMarketSnapshot(latestData),
                        ...chartPayload,
                        stale: true
                    }
                });
            }
            return res.status(500).json({ success: false, error: 'Market AI key is missing' });
        }

        console.log('Fetching fresh market analysis from Groq AI...');
        
        const systemPrompt = `You are an expert agricultural economist specializing in the rubber industry. 
        Provide an updated market analysis for Latex (RSS3) prices in the Philippines (PHP/kg).
        Use realistic values and return strict JSON:
        {
            "price": number,
            "trend": "RISE" | "FALL" | "NEUTRAL",
            "priceChange": number,
            "analysis": "Concise summary (max 70 words)",
            "recommendations": ["Rec 1", "Rec 2", "Rec 3"],
            "features": [{"name": "Driver", "impact": "High"|"Medium"|"Low", "sentiment": "Positive"|"Negative"|"Neutral"}],
            "nextWeekProjection": number,
            "confidence": number
        }`;

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: GROQ_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Get latest rubber market update." }
                ],
                temperature: 0.4,
                max_tokens: 450,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: GROQ_TIMEOUT_MS
            }
        );

        const content = response.data.choices[0]?.message?.content;
        let aiData;
        try {
            aiData = JSON.parse(content);
        } catch (e) {
            console.error("Failed to parse AI JSON:", content);
            throw new Error("Invalid AI response format");
        }

        const previousPrice = toNumber(latestData?.price, 0);
        let nextPrice = toNumber(aiData?.price, previousPrice);
        if (nextPrice <= 0 && previousPrice > 0) nextPrice = previousPrice;

        const computedChange = previousPrice > 0 ? round2(((nextPrice - previousPrice) / previousPrice) * 100) : 0;
        const aiChange = toNumber(aiData?.priceChange, computedChange);
        const priceChange = round2(aiChange);

        let trend = String(aiData?.trend || '').toUpperCase();
        if (!['RISE', 'FALL', 'NEUTRAL'].includes(trend)) {
            trend = priceChange > 0 ? 'RISE' : priceChange < 0 ? 'FALL' : 'NEUTRAL';
        }

        const nextWeekProjection = round2(
            toNumber(aiData?.nextWeekProjection, nextPrice * (1 + priceChange / 100))
        );

        const newMarketData = new MarketData({
            price: round2(nextPrice),
            trend,
            priceChange,
            analysis: truncateText(aiData?.analysis || '', MAX_ANALYSIS_LENGTH),
            recommendations: sanitizeRecommendations(aiData?.recommendations || []),
            features: sanitizeFeatures(aiData?.features),
            nextWeekProjection,
            confidence: clamp(toNumber(aiData?.confidence, 70), 0, 100),
            timestamp: new Date()
        });

        await newMarketData.save();

        // 3. Build chart payload from actual stored history
        const updatedHistoryDesc = await MarketData.find().sort({ timestamp: -1 }).limit(500).lean();
        const updatedHistory = [...updatedHistoryDesc].reverse();
        const chartPayload = buildChartPayload(updatedHistory, newMarketData.price);

        res.json({
            success: true,
            data: {
                ...sanitizeMarketSnapshot(newMarketData),
                ...chartPayload
            }
        });

    } catch (error) {
        console.error('Market API Error:', error.message);
        try {
            const latestData = await MarketData.findOne().sort({ timestamp: -1 });
            if (latestData) {
                const recentHistoryDesc = await MarketData.find().sort({ timestamp: -1 }).limit(500).lean();
                const recentHistory = [...recentHistoryDesc].reverse();
                const chartPayload = buildChartPayload(recentHistory, latestData.price);
                return res.json({
                    success: true,
                    data: {
                        ...sanitizeMarketSnapshot(latestData),
                        ...chartPayload,
                        stale: true
                    }
                });
            }
        } catch (fallbackErr) {
            console.error('Market fallback failed:', fallbackErr.message);
        }

        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch market data',
            details: error.message 
        });
    }
});

// GET /api/market/history
router.get('/history', async (req, res) => {
    try {
        const historyDesc = await MarketData.find().sort({ timestamp: -1 }).limit(365).lean();
        const history = [...historyDesc].reverse();
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
