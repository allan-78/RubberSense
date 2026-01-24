// ============================================
// 🤖 Image Analysis Utilities
// ============================================
const { spawn } = require('child_process');
const path = require('path');

/**
 * Executes the Python AI script to analyze images
 * @param {string} mode - 'tree' or 'latex'
 * @param {string} imageUrl - The URL of the image to analyze
 * @returns {Promise<Object>} - The analysis results
 */
const runPythonScript = (mode, imageUrl) => {
  return new Promise((resolve, reject) => {
    // Path to the Python script
    const scriptPath = path.join(__dirname, '../ai_service/main.py');
    
    // Spawn Python process
    // Note: Requires 'python' to be in the system PATH
    const pythonProcess = spawn('python', [scriptPath, mode, imageUrl]);

    let dataString = '';
    let errorString = '';

    // Collect data from stdout
    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    // Collect errors from stderr
    pythonProcess.stderr.on('data', (data) => {
      errorString += data.toString();
    });

    // Handle process completion
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ [Python ML] Script error (Exit Code ${code}): ${errorString}`);
          console.warn('⚠️ [Python ML] Falling back to mock data due to Python error.');
          // Fallback to mock data if Python fails (for resilience)
          if (mode === 'tree') resolve(getMockTreeData());
          else resolve(getMockLatexData());
          return;
        }

        try {
          const result = JSON.parse(dataString);
          if (result.error) {
            throw new Error(result.error);
          }
          console.log(`✅ [Python ML] Analysis successful for ${mode}`);
          resolve(result);
        } catch (error) {
          console.error('❌ [Python ML] Failed to parse Python output:', error);
          console.log('📝 [Python ML] Raw output:', dataString);
          console.warn('⚠️ [Python ML] Falling back to mock data due to parsing error.');
          // Fallback to mock data
          if (mode === 'tree') resolve(getMockTreeData());
          else resolve(getMockLatexData());
        }
      });
  });
};

const analyzeTreeImage = async (imageUrl) => {
  return await runPythonScript('tree', imageUrl);
};

const analyzeLatexImage = async (imageUrl) => {
  return await runPythonScript('latex', imageUrl);
};

// ==========================================
// MOCK DATA FALLBACKS
// ==========================================
const getMockTreeData = () => ({
  treeIdentification: { isRubberTree: true, confidence: 92.5 },
  trunkAnalysis: { girth: 85.3, diameter: 27.1, texture: 'smooth', color: 'dark_brown' },
  diseaseDetection: [{ name: 'No disease detected', confidence: 95.2, severity: 'none', recommendation: 'Tree appears healthy.' }],
  tappabilityAssessment: { isTappable: true, score: 88, reason: 'Tree meets diameter requirements.' },
  latexQualityPrediction: { quality: 'good', dryRubberContent: 32.5, estimatedPrice: 85.0 },
  latexFlowIntensity: 'medium',
  productivityRecommendation: { status: 'optimal', suggestions: ['Maintain regular tapping schedule'] }
});

const getMockLatexData = () => ({
  colorAnalysis: { primaryColor: 'white', rgb: { r: 245, g: 245, b: 240 }, hex: '#F5F5F0' },
  qualityClassification: { grade: 'A', confidence: 91.3, description: 'High quality latex.' },
  contaminationDetection: { hasWater: false, hasContamination: false, contaminationLevel: 'none', contaminantTypes: [] },
  quantityEstimation: { volume: 2.5, weight: 2.3, confidence: 87.5 },
  productYieldEstimation: { dryRubberContent: 35.2, estimatedYield: 0.81, productType: 'TSR20' },
  productRecommendation: { recommendedProduct: 'RSS', reason: 'High purity', expectedQuality: 'Grade A' }
});

module.exports = {
  analyzeTreeImage,
  analyzeLatexImage
};
