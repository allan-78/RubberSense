// ============================================
// 💰 Market Price Estimation
// ============================================

const estimateLatexPrice = (quality, dryRubberContent, volume, marketAnalysis = null) => {
  // Base prices per kg (in PHP) - 2026 estimates
  const basePrices = {
    'A': 95.00,
    'B': 85.00,
    'C': 75.00,
    'D': 65.00,
    'F': 50.00
  };

  let basePrice = basePrices[quality] || 70.00;

  // Integrate AI Market Analysis
  if (marketAnalysis && marketAnalysis.estimated_price_range_php) {
      // Try to parse range "50-60"
      const parts = String(marketAnalysis.estimated_price_range_php).split('-');
      let aiPrice = null;

      if (parts.length === 2) {
          const min = parseFloat(parts[0]);
          const max = parseFloat(parts[1]);
          if (!isNaN(min) && !isNaN(max)) {
              aiPrice = (min + max) / 2;
          }
      } else {
          const val = parseFloat(marketAnalysis.estimated_price_range_php);
          if (!isNaN(val)) {
              aiPrice = val;
          }
      }

      if (aiPrice !== null && aiPrice > 0) {
          // Weighted average: 70% AI (current), 30% Base (historical)
          // Or just trust AI completely if it's specific?
          // Let's average them to be safe against hallucinations
          basePrice = (aiPrice + basePrice) / 2;
      }
  }

  // Validate inputs
  const drc = (!dryRubberContent || isNaN(dryRubberContent)) ? 33.0 : dryRubberContent;
  const vol = (!volume || isNaN(volume)) ? 0 : volume;

  // Calculate Dry Rubber Weight (kg)
  // Assuming 1L of latex approx 1kg for simplicity, though slightly less usually
  const dryWeightKg = vol * (drc / 100.0);

  // Calculate total value based on dry rubber content
  const totalValue = dryWeightKg * basePrice;

  // Price per kg of wet latex equivalent
  const pricePerKgWet = vol > 0 ? totalValue / vol : 0;

  return {
    pricePerKg: parseFloat(pricePerKgWet.toFixed(2)),
    totalEstimatedValue: parseFloat(totalValue.toFixed(2)),
    currency: 'PHP',
    priceDate: new Date(),
    marketTrend: marketAnalysis?.trend || 'stable',
    aiReasoning: marketAnalysis?.reasoning // Add reasoning
  };
};

module.exports = {
  estimateLatexPrice
};
