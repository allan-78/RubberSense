// ============================================
// 🌲 Random Forest Regression Implementation
// ============================================

class DecisionTree {
  constructor(maxDepth = 5, minSamplesSplit = 2) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.tree = null;
  }

  train(X, y) {
    this.tree = this._buildTree(X, y, 0);
  }

  predict(x) {
    return this._predictNode(this.tree, x);
  }

  _buildTree(X, y, depth) {
    const numSamples = X.length;
    const numFeatures = X[0].length;
    
    // Stop criteria
    if (depth >= this.maxDepth || numSamples < this.minSamplesSplit || this._calculateVariance(y) === 0) {
      return { value: this._mean(y) };
    }

    // Find best split
    let bestSplit = null;
    let minVariance = Infinity;

    // Try random features (simplified RF logic)
    for (let featureIdx = 0; featureIdx < numFeatures; featureIdx++) {
      const uniqueValues = [...new Set(X.map(row => row[featureIdx]))];
      
      for (const threshold of uniqueValues) {
        const { leftIndices, rightIndices } = this._split(X, featureIdx, threshold);
        
        if (leftIndices.length === 0 || rightIndices.length === 0) continue;

        const yLeft = leftIndices.map(i => y[i]);
        const yRight = rightIndices.map(i => y[i]);
        
        const variance = (yLeft.length * this._calculateVariance(yLeft) + yRight.length * this._calculateVariance(yRight)) / numSamples;

        if (variance < minVariance) {
          minVariance = variance;
          bestSplit = { featureIdx, threshold, leftIndices, rightIndices };
        }
      }
    }

    if (!bestSplit) return { value: this._mean(y) };

    // Recurse
    const leftX = bestSplit.leftIndices.map(i => X[i]);
    const leftY = bestSplit.leftIndices.map(i => y[i]);
    const rightX = bestSplit.rightIndices.map(i => X[i]);
    const rightY = bestSplit.rightIndices.map(i => y[i]);

    return {
      featureIdx: bestSplit.featureIdx,
      threshold: bestSplit.threshold,
      left: this._buildTree(leftX, leftY, depth + 1),
      right: this._buildTree(rightX, rightY, depth + 1)
    };
  }

  _split(X, featureIdx, threshold) {
    const leftIndices = [];
    const rightIndices = [];
    for (let i = 0; i < X.length; i++) {
      if (X[i][featureIdx] <= threshold) leftIndices.push(i);
      else rightIndices.push(i);
    }
    return { leftIndices, rightIndices };
  }

  _predictNode(node, x) {
    if (!node.left) return node.value;
    if (x[node.featureIdx] <= node.threshold) return this._predictNode(node.left, x);
    return this._predictNode(node.right, x);
  }

  _mean(y) {
    return y.reduce((a, b) => a + b, 0) / y.length;
  }

  _calculateVariance(y) {
    if (y.length === 0) return 0;
    const mean = this._mean(y);
    return y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / y.length;
  }
}

export class RandomForestRegressor {
  constructor(nEstimators = 10, maxDepth = 5) {
    this.nEstimators = nEstimators;
    this.maxDepth = maxDepth;
    this.trees = [];
  }

  train(X, y) {
    this.trees = [];
    for (let i = 0; i < this.nEstimators; i++) {
      const { X_sample, y_sample } = this._bootstrap(X, y);
      const tree = new DecisionTree(this.maxDepth);
      tree.train(X_sample, y_sample);
      this.trees.push(tree);
    }
  }

  predict(x) {
    const predictions = this.trees.map(tree => tree.predict(x));
    return predictions.reduce((a, b) => a + b, 0) / predictions.length;
  }

  _bootstrap(X, y) {
    const X_sample = [];
    const y_sample = [];
    for (let i = 0; i < X.length; i++) {
      const idx = Math.floor(Math.random() * X.length);
      X_sample.push(X[idx]);
      y_sample.push(y[idx]);
    }
    return { X_sample, y_sample };
  }
}
