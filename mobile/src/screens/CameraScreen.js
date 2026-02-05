// ============================================
// Camera & Scan Screen
// ============================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { scanAPI, treeAPI, latexAPI } from '../services/api';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';
import { useAuth } from '../context/AuthContext';

const CameraScreen = ({ navigation }) => {
  const { user, resendVerificationEmail } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraRef, setCameraRef] = useState(null);

  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);
  const [selectedTree, setSelectedTree] = useState(null);
  const [trees, setTrees] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanResult, setScanResult] = useState(null);
  
  // New state for Latex Mode
  const [scanType, setScanType] = useState('tree'); // 'tree' or 'latex'
  const [treePart, setTreePart] = useState('trunk'); // 'trunk' or 'leaf' (only for tree mode)
  const [batchID, setBatchID] = useState('');
  const [isARMode, setIsARMode] = useState(true); // New AR Mode state

  // Auto-generate Batch ID when switching to Latex mode, selecting a tree, or capturing a new image
  useEffect(() => {
    // Force regeneration if we detect the problematic placeholder "BATCH-999" or empty ID
    if ((scanType === 'latex' && selectedTree && trees.length > 0) || batchID === 'BATCH-999') {
      const tree = trees.find(t => t._id === selectedTree);
      if (tree) {
        // Generate completely unique ID: TREE_ID + Random String + Timestamp
        // This ensures uniqueness even if multiple scans happen quickly
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const autoID = `${tree.treeID}-${timestamp}-${random}`;
        setBatchID(autoID);
      }
    }
  }, [scanType, selectedTree, trees, image]); // Added dependency on 'image' so it regenerates when a new image is picked

  useFocusEffect(
    useCallback(() => {
      loadTrees();
    }, [])
  );

  const loadTrees = async () => {
    setLoadingTrees(true);
    try {
      const response = await treeAPI.getAll();
      const treeList = response.data || [];
      setTrees(treeList);
      
      // Auto-select if only one tree or if none selected yet
      if (treeList.length > 0 && !selectedTree) {
        setSelectedTree(treeList[0]._id);
      }
    } catch (error) {
      console.log('Error fetching trees:', error);
    } finally {
      setLoadingTrees(false);
    }
  };

  const takePicture = async () => {
    if (cameraRef) {
      try {
        const photo = await cameraRef.takePictureAsync({
          quality: 0.8,
          base64: false,
        });
        setImage(photo);
        setIsCameraActive(false);
      } catch (error) {
        Alert.alert('Error', 'Failed to take picture');
      }
    }
  };

  if (isCameraActive) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView 
          style={styles.camera} 
          facing="back"
          ref={(ref) => setCameraRef(ref)}
        />
        {/* AR Overlay */}
        <View style={styles.overlayContainer}>
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.6)']}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />
          
          <View style={styles.overlayHeader}>
            <TouchableOpacity onPress={() => setIsCameraActive(false)} style={styles.closeCameraButton}>
              <MaterialIcons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            
            <View style={styles.arBadge}>
              <MaterialIcons name="view-in-ar" size={18} color="#FFF" />
              <Text style={styles.arText}>AR Assist</Text>
            </View>
          </View>

          {/* Guidelines */}
          {isARMode && (
            <View style={styles.guidelinesContainer} pointerEvents="none">
              {scanType === 'tree' ? (
                treePart === 'trunk' ? (
                  <>
                    {/* Trunk Alignment Box */}
                    <View style={styles.viewFinder}>
                      <View style={[styles.corner, styles.cornerTL]} />
                      <View style={[styles.corner, styles.cornerTR]} />
                      <View style={[styles.corner, styles.cornerBL]} />
                      <View style={[styles.corner, styles.cornerBR]} />
                      
                      {/* 30-degree Tapping Angle Guide */}
                      <View style={styles.angleGuideContainer}>
                        <View style={styles.angleLine} />
                        <Text style={styles.angleText}>30° Cut Angle</Text>
                      </View>
                    </View>

                    <View style={styles.instructionContainer}>
                      <Text style={styles.guideInstruction}>
                        Align trunk within frame & match cut angle
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Leaf Analysis Guide */}
                    <View style={styles.latexViewFinder}>
                      <View style={[styles.corner, styles.cornerTL]} />
                      <View style={[styles.corner, styles.cornerTR]} />
                      <View style={[styles.corner, styles.cornerBL]} />
                      <View style={[styles.corner, styles.cornerBR]} />
                      
                      <MaterialIcons 
                        name="eco" 
                        size={48} 
                        color="rgba(255,255,255,0.3)" 
                        style={styles.watermarkIcon}
                      />
                    </View>

                    <View style={styles.instructionContainer}>
                      <Text style={styles.guideInstruction}>
                        Center leaf in frame for disease detection
                      </Text>
                    </View>
                  </>
                )
              ) : (
                <>
                  {/* Latex Quality Guide */}
                  <View style={styles.latexViewFinder}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                    
                    {/* Liquid Level / Center Focus */}
                    <View style={styles.liquidLevelGuide} />
                    <MaterialIcons 
                      name="opacity" 
                      size={48} 
                      color="rgba(255,255,255,0.3)" 
                      style={styles.watermarkIcon}
                    />
                  </View>

                  <View style={styles.instructionContainer}>
                    <Text style={styles.guideInstruction}>
                      Center latex sample & ensure good lighting
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Capture Button */}
          <View style={styles.captureContainer}>
            {/* Camera Mode Toggles (Bottom Position) */}
            {scanType === 'tree' && (
              <View style={styles.cameraToggleContainer}>
                <TouchableOpacity 
                  style={[styles.cameraToggle, treePart === 'trunk' && styles.cameraToggleActive]}
                  onPress={() => setTreePart('trunk')}
                >
                  <MaterialIcons name="straighten" size={16} color={treePart === 'trunk' ? '#FFF' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[styles.cameraToggleText, treePart === 'trunk' && styles.cameraToggleTextActive]}>Trunk</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.cameraToggle, treePart === 'leaf' && styles.cameraToggleActive]}
                  onPress={() => setTreePart('leaf')}
                >
                  <MaterialIcons name="eco" size={16} color={treePart === 'leaf' ? '#FFF' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[styles.cameraToggleText, treePart === 'leaf' && styles.cameraToggleTextActive]}>Leaf</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={takePicture} activeOpacity={0.7}>
              <View style={styles.captureButtonOuter}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
                  style={styles.captureButtonRing}
                >
                  <View style={styles.captureButtonInner}>
                    <View style={styles.captureButtonCore} />
                  </View>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const handleResendVerification = async () => {
    if (resending) return;
    setResending(true);
    try {
      const result = await resendVerificationEmail(user.email);
      if (result.success) {
        Alert.alert('Success', result.message || 'Verification email sent!');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  if (!user?.isVerified) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <MaterialIcons name="lock-outline" size={80} color={theme.colors.textLight} style={styles.lockIcon} />
        <Text style={styles.lockTitle}>Feature Locked</Text>
        <Text style={styles.lockMessage}>
          Please verify your email address to access the camera and image processing features.
        </Text>
        <CustomButton
          title="Resend Verification Email"
          onPress={handleResendVerification}
          loading={resending}
          style={styles.resendButton}
        />
      </View>
    );
  }

  const pickImage = async (useCamera) => {
    try {
      if (useCamera) {
        if (!permission) {
          // Permission might be null initially
          const perm = await requestPermission();
          if (!perm.granted) {
             Alert.alert('Permission Required', 'Please allow camera access');
             return;
          }
        } else if (!permission.granted) {
          const perm = await requestPermission();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Please allow camera access');
            return;
          }
        }
        
        setIsCameraActive(true);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please allow gallery access');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled) {
          setImage(result.assets[0]);
        }
      }
    } catch (error) {
      console.error('ImagePicker Error:', error);
      Alert.alert('Error', `Failed to pick image: ${error.message || error}`);
    }
  };

  const uploadScan = async () => {
    if (!image) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    if (scanType === 'tree') {
      if (trees.length === 0) {
        Alert.alert('Error', 'Please create a tree first');
        return;
      }
      if (!selectedTree) {
        Alert.alert('Error', 'Please select a tree to scan');
        return;
      }
    }

    if (scanType === 'latex' && !batchID.trim()) {
      Alert.alert('Error', 'Please enter a Batch ID');
      return;
    }

    setUploading(true);
    setProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    try {
      const formData = new FormData();
      formData.append('image', {
        uri: Platform.OS === 'android' && !image.uri.startsWith('file://') ? `file://${image.uri}` : image.uri,
        type: 'image/jpeg',
        name: scanType === 'tree' ? 'tree-scan.jpg' : 'latex-scan.jpg',
      });

      if (scanType === 'tree') {
        formData.append('treeId', selectedTree);
        formData.append('scanType', 'tree');
        formData.append('scanSubType', treePart); // Send 'trunk' or 'leaf'
        await scanAPI.upload(formData);
      } else {
        formData.append('batchID', batchID);
        await latexAPI.createBatch(formData);
      }

      clearInterval(progressInterval);
      setProgress(100);

      // Slight delay to show 100%
      setTimeout(() => {
        setUploading(false);
        setScanResult({ success: true, type: scanType });
      }, 500);
      
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(0);
      setUploading(false);
      
      const errorMessage = error.error || error.message || 'Failed to upload scan';
      
      if (errorMessage.toLowerCase().includes("not appear to contain a tree")) {
         Alert.alert(
           'No Tree Detected 🌳', 
           'The image does not appear to contain a tree. Please capture a clear image of a rubber tree.'
         );
      } else {
         Alert.alert('Upload Failed', errorMessage);
      }
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.surface, theme.colors.background]}
        style={styles.background}
      />
      
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {scanType === 'tree' ? 'Scan Tree' : 'Scan Latex'}
        </Text>
        <TouchableOpacity 
          onPress={() => setImage(null)}
          style={[styles.iconButton, !image && styles.hidden]}
          disabled={!image}
        >
          <MaterialIcons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {scanResult ? (
        <View style={styles.resultContainer}>
          <View style={styles.resultContent}>
            <LinearGradient
              colors={['#FFFFFF', '#F0FDF4']}
              style={styles.resultGradient}
            >
              <View style={styles.resultIconRing}>
                <LinearGradient
                  colors={theme.gradients.primary}
                  style={styles.resultIconBg}
                >
                  <MaterialIcons name="check" size={40} color="#FFF" />
                </LinearGradient>
              </View>
              <Text style={styles.resultTitle}>Analysis Complete!</Text>
              <Text style={styles.resultMessage}>
                {scanResult.type === 'tree' 
                  ? 'Tree health data has been processed and saved to your history.' 
                  : 'Latex quality batch has been created and logged successfully.'}
              </Text>
              <View style={styles.resultStatsRow}>
                <View style={styles.resultStat}>
                  <Text style={styles.resultStatLabel}>Status</Text>
                  <Text style={[styles.resultStatValue, { color: theme.colors.success }]}>Success</Text>
                </View>
                <View style={styles.resultDivider} />
                <View style={styles.resultStat}>
                  <Text style={styles.resultStatLabel}>Type</Text>
                  <Text style={styles.resultStatValue}>
                    {scanResult.type === 'tree' ? 'Tree Scan' : 'Latex Batch'}
                  </Text>
                </View>
              </View>
              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={styles.resultButtonPrimary}
                  onPress={() => {
                    setScanResult(null);
                    setImage(null);
                    setBatchID('');
                    navigation.navigate('History', { initialTab: scanResult.type === 'latex' ? 'latex' : 'trees' });
                  }}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={theme.gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.resultButtonGradient}
                  >
                    <Text style={styles.resultButtonText}>View Results</Text>
                    <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.resultButtonSecondary}
                  onPress={() => {
                    setScanResult(null);
                    setImage(null);
                    setBatchID('');
                  }}
                >
                  <MaterialIcons name="qr-code-scanner" size={20} color={theme.colors.primary} />
                  <Text style={styles.resultButtonSecondaryText}>Scan Another</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Unique Mode Selector - Split Cards */}
        <View style={styles.modeSelectorContainer}>
          <TouchableOpacity 
            style={[styles.modeCard, scanType === 'tree' && styles.modeCardActive]}
            onPress={() => {
              setScanType('tree');
              // Keep image when switching modes
            }}
            activeOpacity={0.9}
          >
             <LinearGradient
                colors={scanType === 'tree' ? ['#ECFDF5', '#FFFFFF'] : ['#F8FAFC', '#F8FAFC']}
                style={styles.modeCardGradient}
             >
               <View style={[styles.modeIconCircle, scanType === 'tree' && styles.modeIconActive]}>
                 <MaterialIcons name="park" size={24} color={scanType === 'tree' ? '#FFF' : theme.colors.textSecondary} />
               </View>
               <Text style={[styles.modeCardTitle, scanType === 'tree' && styles.modeTextActive]}>Tree Analysis</Text>
               {scanType === 'tree' && <View style={styles.activeIndicator} />}
             </LinearGradient>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.modeCard, scanType === 'latex' && styles.modeCardActive]}
            onPress={() => {
              setScanType('latex');
              // Keep image when switching modes
            }}
            activeOpacity={0.9}
          >
             <LinearGradient
                colors={scanType === 'latex' ? ['#ECFDF5', '#FFFFFF'] : ['#F8FAFC', '#F8FAFC']}
                style={styles.modeCardGradient}
             >
               <View style={[styles.modeIconCircle, scanType === 'latex' && styles.modeIconActive]}>
                 <MaterialIcons name="opacity" size={24} color={scanType === 'latex' ? '#FFF' : theme.colors.textSecondary} />
               </View>
               <Text style={[styles.modeCardTitle, scanType === 'latex' && styles.modeTextActive]}>Latex Quality</Text>
               {scanType === 'latex' && <View style={styles.activeIndicator} />}
             </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Sub-Mode Selector (Floating Segmented Control) */}
        {scanType === 'tree' && (
          <View style={styles.subModeWrapper}>
            <View style={styles.subModeSegmented}>
              <TouchableOpacity 
                style={[styles.subModeSegment, treePart === 'trunk' && styles.subModeSegmentActive]}
                onPress={() => setTreePart('trunk')}
              >
                <Text style={[styles.subModeSegmentText, treePart === 'trunk' && styles.subModeSegmentTextActive]}>Trunk</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.subModeSegment, treePart === 'leaf' && styles.subModeSegmentActive]}
                onPress={() => setTreePart('leaf')}
              >
                <Text style={[styles.subModeSegmentText, treePart === 'leaf' && styles.subModeSegmentTextActive]}>Leaf</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tree Selector - Available for both modes now */}
        {trees.length > 0 && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>
              {scanType === 'tree' ? 'Select Tree to Scan' : 'Link to Tree Profile'}
            </Text>
            <TouchableOpacity 
              style={styles.selectorButton}
              onPress={() => setModalVisible(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="park" size={20} color={theme.colors.primary} />
                <Text style={styles.selectorText}>
                  {selectedTree 
                    ? (trees.find(t => t._id === selectedTree)?.treeID || 'Unknown Tree')
                    : 'Select a Tree'}
                </Text>
              </View>
              <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Image Preview Section */}
        {image ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: image.uri }} style={styles.image} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.imageOverlay}
            />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setImage(null)}
            >
              <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIconBg}>
              <MaterialIcons name="add-a-photo" size={40} color={theme.colors.primary} />
            </View>
            <Text style={styles.placeholderText}>No image selected</Text>
            <Text style={styles.placeholderSubtext}>Take a photo or choose from gallery</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => pickImage(true)}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={theme.gradients.primary}
              style={styles.actionButtonGradient}
            >
              <MaterialIcons name="camera-alt" size={28} color="#FFF" />
              <Text style={styles.actionButtonText}>Camera</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => pickImage(false)}
            disabled={uploading}
            activeOpacity={0.8}
          >
             <View style={styles.actionButtonSecondary}>
              <MaterialIcons name="photo-library" size={28} color={theme.colors.primary} />
              <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>Gallery</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Warning Card - Required for both modes now */}
        {trees.length === 0 && (
          <View style={styles.warningCard}>
            <MaterialIcons name="warning-amber" size={28} color={theme.colors.warning} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>No Trees Found</Text>
              <Text style={styles.warningText}>
                {scanType === 'tree' 
                  ? 'You need to create a tree profile before you can scan it.'
                  : 'You need a tree profile to generate a linked Batch ID.'}
              </Text>
              <TouchableOpacity 
                style={styles.createTreeLink}
                onPress={() => navigation.navigate('AddTree')}
              >
                <Text style={styles.createTreeLinkText}>+ Create Tree Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Latex Batch ID Input */}
        {scanType === 'latex' && image && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Batch ID (Auto-Generated)</Text>
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyText}>{batchID}</Text>
              <MaterialIcons name="lock" size={16} color={theme.colors.textLight} />
            </View>
            <Text style={styles.helperText}>
              Unique ID generated for this specific sample
            </Text>
          </View>
        )}

        {/* Upload Button */}
        {image && (
          <CustomButton
            title={scanType === 'tree' ? "Analyze Tree" : "Analyze Latex"}
            onPress={uploadScan}
            loading={uploading}
            disabled={scanType === 'tree' && trees.length === 0}
            icon="analytics"
            style={styles.uploadButton}
            size="lg"
          />
        )}

        {/* Tips Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <MaterialIcons name="lightbulb" size={24} color={theme.colors.primary} />
            <Text style={styles.infoTitle}>
              {scanType === 'tree' ? 'Tree Photography Tips' : 'Latex Sampling Tips'}
            </Text>
          </View>
          <View style={styles.tipsList}>
            {scanType === 'tree' ? (
              <>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Use natural lighting</Text>
                </View>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Focus on tree trunk</Text>
                </View>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Avoid heavy shadows</Text>
                </View>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Capture bark texture</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Ensure good lighting on latex</Text>
                </View>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Capture color clearly</Text>
                </View>
                <View style={styles.tipItem}>
                  <MaterialIcons name="check-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.tipText}>Avoid reflections in container</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
      )}

      {/* Tree Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Tree</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={trees}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.treeItem,
                    selectedTree === item._id && styles.treeItemActive
                  ]}
                  onPress={() => {
                    setSelectedTree(item._id);
                    setModalVisible(false);
                  }}
                >
                  <View style={styles.treeIconBg}>
                    <MaterialIcons name="park" size={20} color={selectedTree === item._id ? '#FFF' : theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.treeItemTitle, selectedTree === item._id && styles.treeItemTextActive]}>
                      {item.treeID}
                    </Text>
                    <Text style={[styles.treeItemSubtitle, selectedTree === item._id && styles.treeItemTextActive]}>
                      {item.species} • {new Date(item.plantedDate).getFullYear()}
                    </Text>
                  </View>
                  {selectedTree === item._id && (
                    <MaterialIcons name="check" size={20} color="#FFF" />
                  )}
                </TouchableOpacity>
              )}
            />
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.addNewTreeButton}
                onPress={() => {
                  setModalVisible(false);
                  navigation.navigate('AddTree');
                }}
              >
                <MaterialIcons name="add-circle-outline" size={24} color={theme.colors.primary} />
                <Text style={styles.addNewTreeText}>Add New Tree Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loading Progress Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={uploading}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Analyzing Image...</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressPercentage}>{progress}%</Text>
            <Text style={styles.loadingSubtext}>Please wait while AI processes your scan</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 50, // For status bar
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
    zIndex: 10,
  },
  modeSelectorContainer: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  modeCard: {
    flex: 1,
    borderRadius: 24,
    ...theme.shadows.md,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: 140,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeCardActive: {
    ...theme.shadows.lg,
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
  },
  modeCardGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modeIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeIconActive: {
    backgroundColor: theme.colors.primary,
  },
  modeCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  modeTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 12,
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.primary,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.background,
  },
  hidden: {
    opacity: 0,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  createTreeLink: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  createTreeLinkText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 100,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 3/4,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.lg,
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  removeButton: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContainer: {
    height: 300,
    backgroundColor: '#F8FAFC',
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginBottom: theme.spacing.lg,
  },
  placeholderIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  placeholderText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  placeholderSubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  
  // Loading Modal Styles
  loadingContainer: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    width: '80%',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    ...theme.shadows.lg,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },

  buttonContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  actionButton: {
    flex: 1,
    height: 100,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
  },
  actionButtonGradient: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonSecondary: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: '#FFF',
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: '#FCD34D',
    alignItems: 'center',
  },
  warningContent: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  warningTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.warning,
    marginBottom: 2,
  },
  warningText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  subModeWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  subModeSegmented: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 30,
    padding: 4,
  },
  subModeSegment: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 26,
  },
  subModeSegmentActive: {
    backgroundColor: '#FFFFFF',
    ...theme.shadows.sm,
  },
  subModeSegmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  subModeSegmentTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  readOnlyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readOnlyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 6,
    marginLeft: 4,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.md,
  },
  selectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    fontWeight: '500',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  treeList: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  treeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  treeItemActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  treeIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  treeItemTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  treeItemSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  treeItemTextActive: {
    color: '#FFF',
  },
  emptyList: {
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyListText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  modalFooter: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  addNewTreeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderStyle: 'dashed',
  },
  addNewTreeText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  createTreeButton: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  createTreeButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: theme.fontSize.md,
  },
  uploadButton: {
    marginBottom: theme.spacing.xl,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  infoTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  tipsList: {
    gap: theme.spacing.sm,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  lockIcon: {
    marginBottom: theme.spacing.lg,
  },
  lockTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  lockMessage: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
  },
  resendButton: {
    width: '100%',
  },
  
  // Camera & AR Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
    zIndex: 2,
  },
  closeCameraButton: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
  },
  arBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  arText: {
    color: 'white',
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cameraToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 4,
    marginBottom: 20, // Space above capture button
  },
  cameraToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 26,
    gap: 6,
  },
  cameraToggleActive: {
    backgroundColor: theme.colors.primary,
  },
  cameraToggleText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  cameraToggleTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  guidelinesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewFinder: {
    width: 250,
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  latexViewFinder: {
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  liquidLevelGuide: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    position: 'absolute',
  },
  watermarkIcon: {
    opacity: 0.5,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#FFF',
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 16,
  },
  angleGuideContainer: {
    position: 'absolute',
    top: '50%',
    right: -40,
    alignItems: 'center',
    transform: [{ translateY: -20 }],
  },
  angleLine: {
    width: 80,
    height: 3,
    backgroundColor: '#FFD700', // Gold
    transform: [{ rotate: '-30deg' }],
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  angleText: {
    color: '#FFD700',
    marginTop: 15,
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  instructionContainer: {
    marginTop: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  guideInstruction: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  captureContainer: {
    paddingBottom: 40,
    alignItems: 'center',
    zIndex: 2,
  },
  captureButtonOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  captureButtonRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  captureButtonCore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },

  // Result View Styles
  resultContainer: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)', // Subtle backdrop
  },
  resultContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 32,
    ...theme.shadows.xl, // Deeper shadow
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F0FDF4',
  },
  resultGradient: {
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
  },
  resultIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 6,
    borderColor: '#FFF',
    ...theme.shadows.md,
  },
  resultIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  resultMessage: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  resultStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  resultStat: {
    flex: 1,
    alignItems: 'center',
  },
  resultDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },
  resultStatLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: theme.colors.textLight,
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resultStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  resultActions: {
    width: '100%',
    gap: 16,
  },
  resultButtonPrimary: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    ...theme.shadows.md,
  },
  resultButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    gap: 8,
  },
  resultButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  resultButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#F1F5F9',
    gap: 8,
  },
  resultButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});

export default CameraScreen;
