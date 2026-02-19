const express = require('express');
const router = express.Router();
const axios = require('axios');

// Groq API Key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// POST /api/chat/message
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const systemPrompt = "You are an expert AI assistant for RubberSense, a dedicated application for rubber tree farming. Your SOLE purpose is to assist users with topics related to rubber trees (Hevea brasiliensis), latex production, plant diseases, plantation management, and agricultural market trends for rubber. You MUST strictly adhere to the following rules: 1. If a user asks about rubber trees, diseases, soil, weather impacts on tapping, or market prices, provide a helpful, expert response. 2. If a user asks about ANY topic unrelated to rubber farming (e.g., general news, coding, math, entertainment, personal advice), you must POLITELY REFUSE to answer and remind them that you can only assist with rubber tree-related queries. Example refusal: 'I specialize in rubber tree farming and cannot assist with [topic]. How can I help you with your plantation today?' 3. Be concise and professional.";

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 1024
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const botResponseText = response.data.choices[0]?.message?.content || "I'm not sure how to respond to that.";

        res.json({
            response: botResponseText,
            sender: 'bot',
            timestamp: new Date()
        });

    } catch (aiError) {
        console.error("Groq AI Error:", aiError.response?.data || aiError.message);
        
        res.json({
            response: "I'm having trouble connecting to my AI brain right now. Please try again later.",
            sender: 'bot',
            timestamp: new Date(),
            error: "AI_unavailable"
        });
    }

  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
