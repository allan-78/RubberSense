// ============================================
// 🤖 Image Analysis Utilities
// ============================================
const { spawn } = require('child_process');
const path = require('path');

/**
 * Executes the Python AI script to analyze images
 * @param {string} mode - 'tree' or 'latex'
 * @param {string} imageUrl - The URL of the image to analyze
 * @param {string} [subMode] - Optional sub-mode (e.g., 'trunk', 'leaf')
 * @returns {Promise<Object>} - The analysis results
 */
const PYTHON_TIMEOUT_MS = 120000; // Increased to 120s for model loading

const runPythonScript = (mode, imageUrl, subMode = '') => {
  return new Promise((resolve, reject) => {
    // Path to the Python script
    const scriptPath = path.join(__dirname, '../ai_service/main.py');
    
    // Spawn Python process
    const args = [scriptPath, mode, imageUrl];
    if (subMode) args.push(subMode);
    
    const pythonProcess = spawn('python', args);

    pythonProcess.on('error', (err) => {
        console.error('❌ [Python ML] Failed to start Python process:', err);
        clearTimeout(timeoutId);
        finish({ 
            error: 'Failed to start AI engine',
            details: err.message,
            diseaseDetection: [{ name: 'System Error', confidence: 0, severity: 'unknown', recommendation: 'AI Engine unavailable.' }]
        });
    });

    let dataString = '';
    let errorString = '';
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      try {
        pythonProcess.kill('SIGKILL');
      } catch (e) {
      }
      console.error(`❌ [Python ML] Timeout after ${PYTHON_TIMEOUT_MS}ms`);
      // Return error state instead of mock data
      finish({ 
          error: 'Analysis timed out',
          diseaseDetection: [{ name: 'Analysis Timeout', confidence: 0, severity: 'unknown', recommendation: 'Server busy, please try again.' }]
      });
    }, PYTHON_TIMEOUT_MS);

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
        clearTimeout(timeoutId);
        if (resolved) return;
        if (code !== 0) {
          console.error(`❌ [Python ML] Script error (Exit Code ${code}): ${errorString}`);
          // Return error state
          finish({ 
              error: 'Analysis script failed',
              details: errorString,
              diseaseDetection: [{ name: 'Analysis Failed', confidence: 0, severity: 'unknown', recommendation: 'Internal error occurred.' }]
          });
          return;
        }

        try {
          const trimmed = dataString.trim();
          const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          const lastJsonLine = [...lines].reverse().find((line) => line.startsWith('{') && line.endsWith('}'));
          let jsonText = lastJsonLine || trimmed;
          if (!lastJsonLine) {
            const lastOpen = trimmed.lastIndexOf('{');
            const lastClose = trimmed.lastIndexOf('}');
            if (lastOpen !== -1 && lastClose !== -1 && lastClose > lastOpen) {
              jsonText = trimmed.slice(lastOpen, lastClose + 1);
            }
          }
          const result = JSON.parse(jsonText);
          
          if (result.error) {
             console.warn(`⚠️ [Python ML] Validation error: ${result.error}`);
             finish(result); 
             return;
          }

          console.log(`✅ [Python ML] Analysis successful for ${mode}`);
          
          // Generate AI Insights & Prompts
          result.aiInsights = generateAiInsights(result, mode);

          finish(result);
        } catch (error) {
          console.error('❌ [Python ML] Failed to parse Python output:', error);
          console.log('📝 [Python ML] Raw output:', dataString);
          finish({ 
              error: 'Invalid analysis output',
              diseaseDetection: [{ name: 'Parse Error', confidence: 0, severity: 'unknown', recommendation: 'Could not read analysis results.' }]
          });
        }
      });
  });
};

const toInsightLines = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => {
        if (Array.isArray(val)) {
          const joined = val.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
          return joined ? `${key}: ${joined}` : '';
        }
        const text = String(val || '').trim();
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean);
  }

  const text = String(value).trim();
  return text ? [text] : [];
};

const generateAiInsights = (data, mode) => {
  const prompts = [];
  const suggestions = [];
  let overallReport = '';
  let diagnosis = '';
  let treatmentPlan = [];
  let preventionPlan = [];
  let tappabilityAdvice = '';

  if (mode === 'tree') {
     // Disease based prompts
     if (data.diseaseDetection && data.diseaseDetection.length > 0) {
        const disease = data.diseaseDetection[0];
        const diseaseName = String(disease.name || 'Unknown').trim();
        const aiDiagnosis = disease.ai_diagnosis;

        if (aiDiagnosis && typeof aiDiagnosis === 'object') {
            diagnosis = String(aiDiagnosis.diagnosis || '').trim();
            treatmentPlan = toInsightLines(aiDiagnosis.treatment);
            preventionPlan = toInsightLines(aiDiagnosis.prevention);
            tappabilityAdvice = toInsightLines(aiDiagnosis.tappability_advice).join(' ');
        } else if (aiDiagnosis) {
            diagnosis = String(aiDiagnosis).trim();
        }

        const appearsHealthy = disease.severity === 'none' || /healthy|no disease detected/i.test(diseaseName);

        if (appearsHealthy) {
            overallReport = diagnosis
              ? `Tree appears healthy. ${diagnosis}`
              : 'Tree appears healthy with no major disease signals.';
        } else {
            overallReport = diagnosis
              ? `Detected condition: ${diseaseName}. ${diagnosis}`
              : `Detected condition: ${diseaseName}. Immediate treatment and monitoring are advised.`;
        }

        if (disease.name && disease.name !== 'No disease detected') {
            prompts.push(`How do I treat ${disease.name}?`);
            prompts.push(`Prevent ${disease.name} spreading`);
            suggestions.push(`Isolate this tree to prevent spread of ${disease.name}.`);
        } else {
            prompts.push("General rubber tree care");
            prompts.push("Fertilizer recommendations");
            suggestions.push("Tree appears healthy. Maintain regular monitoring.");
        }

        if (treatmentPlan.length > 0) {
            suggestions.push(`Treatment: ${treatmentPlan.join('; ')}`);
        }
        if (preventionPlan.length > 0) {
            suggestions.push(`Prevention: ${preventionPlan.join('; ')}`);
        }
        if (tappabilityAdvice) {
            suggestions.push(`Tappability: ${tappabilityAdvice}`);
        }
     }
     
     // Tappability
     if (data.tappabilityAssessment) {
        if (data.tappabilityAssessment.isTappable) {
            prompts.push("Best time to tap rubber tree");
        } else {
            prompts.push("When will my tree be ready for tapping?");
        }
     }
  } else if (mode === 'latex') {
      // Merge Python-side AI insights if available
      if (data.aiInsights) {
           if (data.aiInsights.promptRecommendations) {
               prompts.push(...data.aiInsights.promptRecommendations);
           }
           if (data.aiInsights.suggestions) {
               suggestions.push(...data.aiInsights.suggestions);
           }
      }

      if (data.latexQualityPrediction) {
          prompts.push(`Improve latex quality from ${data.latexQualityPrediction.quality}`);
          // Avoid duplicates
          if (!prompts.includes("Current rubber market prices")) {
               prompts.push("Current rubber market prices");
          }
      }
      if (data.contaminationDetection && data.contaminationDetection.hasContamination) {
          prompts.push("How to remove contamination from latex");
          suggestions.push("Filter latex before processing to remove contaminants.");
      }
  }

  // Deduplicate prompts and suggestions
  const uniquePrompts = [...new Set(prompts)];
  const uniqueSuggestions = [...new Set(suggestions)];

  // Fallbacks
  if (uniquePrompts.length === 0) uniquePrompts.push("Rubber farming tips");
  if (uniqueSuggestions.length === 0) uniqueSuggestions.push("Regularly check for pests and diseases.");

  return {
      promptRecommendations: uniquePrompts.slice(0, 5), // Increased limit slightly
      suggestions: uniqueSuggestions,
      overallReport,
      diagnosis,
      treatmentPlan,
      preventionPlan,
      tappabilityAdvice,
      analysisTimestamp: new Date(),
      version: 1
  };
};

const analyzeTreeImage = async (imageUrl, subMode) => {
  return runPythonScript('tree', imageUrl, subMode);
};

const analyzeLatexImage = async (imageUrl) => {
  // Use 'latex' mode for Python script
  // The Python script 'analyze_latex_with_model' will be called
  return runPythonScript('latex', imageUrl);
};

const generateAiSuggestionsOnly = async (detectionData) => {
    // detectionData should be { disease_name, confidence, spot_count, color_name }
    const jsonString = JSON.stringify(detectionData);
    
    // We reuse runPythonScript but pass the JSON string as the second argument
    // which corresponds to sys.argv[2]
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../ai_service/main.py');
        const pythonProcess = spawn('python', [scriptPath, 'ai_suggestions', jsonString]);
        
        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => { dataString += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { errorString += data.toString(); });
        
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`❌ [Python AI] Suggestion generation failed: ${errorString}`);
                reject(new Error(errorString || 'AI Service failed'));
                return;
            }
            try {
                const result = JSON.parse(dataString.trim());
                if (!result || result.error) {
                    reject(new Error(result?.error || 'Unknown AI error'));
                    return;
                }
                
                // Construct a partial analysis result compatible with the route handler
                const aiDiagnosis = result;
                
                // Re-construct the disease detection object with updated diagnosis
                // Helper to safely format list or string
                const formatList = (val) => {
                    if (Array.isArray(val)) return val.join('; ');
                    if (typeof val === 'string') return val;
                    if (!val) return '';
                    if (typeof val === 'object') {
                         return Object.entries(val).map(([k, v]) => {
                             const vStr = Array.isArray(v) ? v.join(', ') : String(v);
                             return `${k.charAt(0).toUpperCase() + k.slice(1)}: ${vStr}`;
                         }).join(' | ');
                    }
                    return String(val);
                };

                const diseaseDetection = [{
                    name: detectionData.disease_name,
                    confidence: detectionData.confidence,
                    severity: aiDiagnosis.severity_reasoning || 'unknown', // Map if needed
                    recommendation: formatList(aiDiagnosis.treatment),
                    ai_diagnosis: aiDiagnosis
                }];
                
                // Generate JS-side insights (prompts/suggestions) based on this data
                // Include tappability if provided
                const analysisData = {
                    diseaseDetection,
                    tappabilityAssessment: detectionData.tappability
                };
                const jsInsights = generateAiInsights(analysisData, 'tree'); // Assuming tree mode for now
                
                resolve({
                    diseaseDetection,
                    aiInsights: jsInsights
                });
            } catch (e) {
                reject(e);
            }
        });
    });
};

module.exports = {
  analyzeTreeImage,
  analyzeLatexImage,
  generateAiSuggestionsOnly,
  generateAiInsights // Export for testing
};
