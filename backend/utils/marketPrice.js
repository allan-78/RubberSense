// ============================================
// 💰 Market Price Estimation
// ============================================

const estimateLatexPrice = (quality, dryRubberContent, volume) => {
  // Base prices per kg (in PHP) - 2026 estimates
  const basePrices = {
    'A': 95.00,
    'B': 85.00,
    'C': 75.00,
    'D': 65.00,
    'F': 50.00
  };

  const basePrice = basePrices[quality] || 70.00;

  // Adjust for DRC (Dry Rubber Content)
  const drcMultiplier = dryRubberContent / 33.0; // 33% is standard
  const adjustedPrice = basePrice * drcMultiplier;

  // Calculate total value
  const totalValue = adjustedPrice * volume;

  return {
    pricePerKg: parseFloat(adjustedPrice.toFixed(2)),
    totalEstimatedValue: parseFloat(totalValue.toFixed(2)),
    currency: 'PHP',
    priceDate: new Date(),
    marketTrend: 'stable'
  };
};

module.exports = {
  estimateLatexPrice
};
