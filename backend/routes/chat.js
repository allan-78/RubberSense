const express = require('express');
const router = express.Router();

// Puter.js initialization for Node.js
const { init } = require('@heyputer/puter.js/src/init.cjs');
// Initialize Puter with auth token from environment variables
const puter = init(process.env.PUTER_AUTH_TOKEN);

// Helper to check if message is relevant (Deprecated/Unused)
// const isRelevant = (text) => { ... };

// POST /api/chat/message
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Local Filtering (Disabled for general chat support)
    // if (!isRelevant(message)) { ... }
    
    // 2. Call Puter.js AI
    try {
        // Completely open system prompt to allow any conversation
        const systemPrompt = "You are a friendly and helpful AI assistant for the RubberSense app. You are capable of answering any question, engaging in casual conversation, and helping with general tasks. You also have expert knowledge about rubber tree farming, diseases, and market prices, which you should use when relevant. Be polite, concise, and helpful.";
        
        // Puter AI Chat
        // Depending on the exact version of puter.js, the API might be puter.ai.chat(message) or puter.ai.chat(messages_array)
        // We will try the simple text interface first or the object interface.
        // Documentation suggests: puter.ai.chat("Hello") returns a response object or string.
        
        const response = await puter.ai.chat(`${systemPrompt}\n\nUser: ${message}`);
        
        let botResponseText = "";
        if (typeof response === 'string') {
            botResponseText = response;
        } else if (response && response.message && response.message.content) {
            botResponseText = response.message.content;
        } else if (response && response.text) {
             botResponseText = response.text;
        } else {
            // Fallback if response structure is unknown
            botResponseText = JSON.stringify(response);
        }

        // Clean up response if it includes "Assistant:" prefix
        botResponseText = botResponseText.replace(/^Assistant:\s*/i, '');

        res.json({
            response: botResponseText,
            sender: 'bot',
            timestamp: new Date()
        });

    } catch (aiError) {
        console.error("Puter AI Error:", aiError);
        
        // Fallback to keyword-based logic if AI fails
        let botResponseText = "I'm having trouble connecting to my AI brain right now. ";
        
        const lowerInput = message.toLowerCase();
        if (lowerInput.includes('hello') || lowerInput.includes('hi')) {
            botResponseText += "Hi! How can I help you today?";
        } else {
             botResponseText += "Please try again later.";
        }

        res.json({
            response: botResponseText,
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
