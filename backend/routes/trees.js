// ============================================
// 🌳 Tree Management Routes
// ============================================

const express = require('express');
const router = express.Router();
const Tree = require('../models/Tree');
const { protect } = require('../middleware/auth');

// All routes are protected (require authentication)

// ============================================
// @route   GET /api/trees
// @desc    Get all trees for logged in user
// @access  Private
// ============================================
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const trees = await Tree.find({ owner: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Optional: Get total count if needed for pagination UI
    // const total = await Tree.countDocuments({ owner: req.user.id });

    res.status(200).json({
      success: true,
      count: trees.length,
      // total,
      data: trees
    });

  } catch (error) {
    console.error('Get trees error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching trees'
    });
  }
});

// ============================================
// @route   GET /api/trees/:id
// @desc    Get single tree by ID
// @access  Private
// ============================================
router.get('/:id', protect, async (req, res) => {
  try {
    const tree = await Tree.findById(req.params.id);

    if (!tree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    // Check if user owns this tree
    if (tree.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this tree'
      });
    }

    res.status(200).json({
      success: true,
      data: tree
    });

  } catch (error) {
    console.error('Get tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching tree'
    });
  }
});

// ============================================
// @route   POST /api/trees
// @desc    Create new tree
// @access  Private
// ============================================
router.post('/', protect, async (req, res) => {
  try {
    const {
      treeID,
      location,
      plantedDate,
      age,
      trunkGirth,
      trunkDiameter,
      barkTexture,
      barkColor,
      notes
    } = req.body;

    // Validation
    if (!treeID) {
      return res.status(400).json({
        success: false,
        error: 'Tree ID is required'
      });
    }

    // Check if tree ID already exists for this user
    const existingTree = await Tree.findOne({ 
      treeID, 
      owner: req.user.id 
    });

    if (existingTree) {
      return res.status(400).json({
        success: false,
        error: 'Tree ID already exists'
      });
    }

    // Create tree
    const tree = await Tree.create({
      owner: req.user.id,
      treeID,
      location,
      plantedDate,
      age,
      trunkGirth,
      trunkDiameter,
      barkTexture,
      barkColor,
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Tree created successfully',
      data: tree
    });

  } catch (error) {
    console.error('Create tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error creating tree'
    });
  }
});

// ============================================
// @route   PUT /api/trees/:id
// @desc    Update tree
// @access  Private
// ============================================
router.put('/:id', protect, async (req, res) => {
  try {
    let tree = await Tree.findById(req.params.id);

    if (!tree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    // Check if user owns this tree
    if (tree.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this tree'
      });
    }

    // Update tree
    tree = await Tree.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Tree updated successfully',
      data: tree
    });

  } catch (error) {
    console.error('Update tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error updating tree'
    });
  }
});

// ============================================
// @route   DELETE /api/trees/:id
// @desc    Delete tree
// @access  Private
// ============================================
router.delete('/:id', protect, async (req, res) => {
  try {
    const tree = await Tree.findById(req.params.id);

    if (!tree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    // Check if user owns this tree
    if (tree.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this tree'
      });
    }

    await tree.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Tree deleted successfully',
      data: {}
    });

  } catch (error) {
    console.error('Delete tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error deleting tree'
    });
  }
});

// ============================================
// @route   GET /api/trees/stats/summary
// @desc    Get tree statistics for user
// @access  Private
// ============================================
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const [totalTrees, healthyTrees, diseasedTrees, tappableTrees] = await Promise.all([
      Tree.countDocuments({ owner: req.user.id }),
      Tree.countDocuments({ owner: req.user.id, healthStatus: 'healthy' }),
      Tree.countDocuments({ owner: req.user.id, healthStatus: 'diseased' }),
      Tree.countDocuments({ owner: req.user.id, isTappable: true })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalTrees,
        healthyTrees,
        diseasedTrees,
        tappableTrees,
        healthPercentage: totalTrees > 0 ? ((healthyTrees / totalTrees) * 100).toFixed(1) : 0
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching statistics'
    });
  }
});

module.exports = router;
