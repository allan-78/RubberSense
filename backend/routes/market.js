const express = require('express');
const router = express.Router();
const axios = require('axios');
const MarketData = require('../models/MarketData');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Helper to get simulated history if DB is empty
const generateSimulatedHistory = () => {
    const daily = [];
    const monthly = [];
    let base = 85;
    for (let i = 0; i < 7; i++) {
        daily.push(base + (Math.random() * 4 - 2));
    }
    for (let i = 0; i < 12; i++) {
        monthly.push(base + (Math.random() * 10 - 5));
    }
    return { daily, monthly };
};

// GET /api/market/latest
router.get('/latest', async (req, res) => {
    try {
        const forceRefresh = req.query.force === 'true';
        
        // 1. Check for recent data (less than 12 hours old)
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const latestData = await MarketData.findOne().sort({ timestamp: -1 });

        if (!forceRefresh && latestData && latestData.timestamp > twelveHoursAgo) {
            // Return cached data from DB
            const history = await MarketData.find().sort({ timestamp: 1 }).limit(30); // Last 30 entries
            
            // If not enough history in DB, simulate it for the chart
            const simulated = generateSimulatedHistory();
            const dailyHistory = history.length >= 7 ? history.slice(-7).map(d => d.price) : simulated.daily;
            
            return res.json({
                success: true,
                data: {
                    ...latestData.toObject(),
                    dailyHistory,
                    monthlyHistory: simulated.monthly // Keeping monthly simulated for now as we build history
                }
            });
        }

        // 2. Fetch new data from Groq AI
        console.log('Fetching fresh market analysis from Groq AI...');
        
        const systemPrompt = `You are an expert agricultural economist specializing in the rubber industry. 
        Provide a real-time market analysis for Latex (RSS3) prices in the Philippines (PHP/kg).
        Current market context: Global natural rubber supply is tight due to weather, demand is steady.
        
        You MUST return valid JSON with the following structure:
        {
            "price": number (approximate current price in PHP, e.g., 90.50),
            "trend": "RISE" | "FALL" | "NEUTRAL",
            "priceChange": number (percentage change, e.g., 1.5),
            "analysis": "Short paragraph analyzing current market conditions.",
            "recommendations": ["Rec 1", "Rec 2", "Rec 3"],
            "features": [
                {"name": "Driver Name", "impact": "High"|"Medium"|"Low", "sentiment": "Positive"|"Negative"}
            ],
            "nextWeekProjection": number (predicted price),
            "confidence": number (0-100)
        }
        Make the data realistic based on current global trends for Rubber/Latex.`;

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Get latest rubber market update." }
                ],
                temperature: 0.5,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
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

        // 3. Save to Database
        const newMarketData = new MarketData({
            price: aiData.price,
            trend: aiData.trend,
            priceChange: aiData.priceChange,
            analysis: aiData.analysis,
            recommendations: aiData.recommendations,
            features: aiData.features,
            nextWeekProjection: aiData.nextWeekProjection,
            confidence: aiData.confidence,
            timestamp: new Date()
        });

        await newMarketData.save();

        // 4. Return Data
        const simulated = generateSimulatedHistory();
        
        // Fetch history again including the new one
        const history = await MarketData.find().sort({ timestamp: 1 }).limit(30);
        const dailyHistory = history.length >= 7 ? history.slice(-7).map(d => d.price) : simulated.daily;

        res.json({
            success: true,
            data: {
                ...newMarketData.toObject(),
                dailyHistory,
                monthlyHistory: simulated.monthly
            }
        });

    } catch (error) {
        console.error('Market API Error:', error.message);
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
        const history = await MarketData.find().sort({ timestamp: -1 }).limit(100);
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
