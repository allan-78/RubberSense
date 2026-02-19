
const { generateAiInsights } = require('../utils/imageAnalysis');

console.log('🧪 Starting AI Insights Logic Test...');

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
};

// Test 1: Diseased Tree
console.log('\n--- Test 1: Diseased Tree ---');
const diseasedData = {
  diseaseDetection: [{ name: 'Leaf Blight', confidence: 0.95 }]
};
const diseasedResult = generateAiInsights(diseasedData, 'tree');
assert(diseasedResult.promptRecommendations.some(p => p.includes('How do I treat Leaf Blight')), 'Should recommend treatment prompt');
assert(diseasedResult.suggestions.some(s => s.includes('Isolate this tree')), 'Should suggest isolation');
assert(diseasedResult.version === 1, 'Version should be 1');

// Test 2: Healthy Tree
console.log('\n--- Test 2: Healthy Tree ---');
const healthyData = {
  diseaseDetection: [{ name: 'No disease detected', confidence: 0.99 }],
  tappabilityAssessment: { isTappable: true }
};
const healthyResult = generateAiInsights(healthyData, 'tree');
assert(healthyResult.promptRecommendations.some(p => p.includes('General rubber tree care')), 'Should suggest general care');
assert(healthyResult.promptRecommendations.some(p => p.includes('Best time to tap')), 'Should suggest tapping time if tappable');
assert(healthyResult.suggestions.some(s => s.includes('Maintain regular monitoring')), 'Should suggest monitoring');

// Test 3: Latex Scan
console.log('\n--- Test 3: Latex Scan ---');
const latexData = {
  latexQualityPrediction: { quality: 'good' },
  contaminationDetection: { hasContamination: true }
};
const latexResult = generateAiInsights(latexData, 'latex');
assert(latexResult.promptRecommendations.some(p => p.includes('Improve latex quality')), 'Should suggest quality improvement');
assert(latexResult.promptRecommendations.some(p => p.includes('remove contamination')), 'Should suggest contamination removal');
assert(latexResult.suggestions.some(s => s.includes('Filter latex')), 'Should suggest filtering');

// Test 4: Fallback
console.log('\n--- Test 4: Fallback / Empty Data ---');
const emptyData = {};
const fallbackResult = generateAiInsights(emptyData, 'tree');
assert(fallbackResult.promptRecommendations.includes('Rubber farming tips'), 'Should provide fallback prompt');

console.log(`\n🏁 Test Summary: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);
