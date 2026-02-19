// ============================================
// Camera & Scan Screen - PROFESSIONAL REDESIGN
// ============================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { scanAPI, treeAPI, latexAPI } from '../services/api';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

const CameraScreen = ({ navigation }) => {
  const { user, resendVerificationEmail } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const cameraRef = useRef(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const [image, setImage] = useState(null);
  const [imageKey, setImageKey] = useState(0); // Add key for forcing re-render
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);
  const [selectedTree, setSelectedTree] = useState(null);
  const [trees, setTrees] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanResult, setScanResult] = useState(null);
  
  // Latex Mode State
  const [scanType, setScanType] = useState('tree'); // 'tree' or 'latex'
  const [treePart, setTreePart] = useState('trunk'); // 'trunk' or 'leaf'
  const [batchID, setBatchID] = useState('');
  const [volume, setVolume] = useState('');
  const [dryWeight, setDryWeight] = useState('');
  const [isARMode, setIsARMode] = useState(true);

  // Auto-generate Batch ID
  useEffect(() => {
    if (scanType === 'latex' && selectedTree && trees.length > 0) {
      const tree = trees.find(t => t._id === selectedTree);
      if (tree) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const autoID = `${tree.treeID}-${timestamp}-${random}`;
        setBatchID(autoID);
      }
    }
  }, [scanType, selectedTree, trees]);

  useFocusEffect(
    useCallback(() => {
      loadTrees();
      return () => {
        setIsCameraActive(false);
      };
    }, [])
  );

  const loadTrees = async () => {
    setLoadingTrees(true);
    try {
      const response = await treeAPI.getAll();
      const treeList = response.data || response || [];
      console.log('✅ Trees loaded:', treeList.length);
      setTrees(treeList);
      
      if (treeList.length > 0 && !selectedTree) {
        setSelectedTree(treeList[0]._id);
      }
    } catch (error) {
      console.log('❌ Error fetching trees:', error);
    } finally {
      setLoadingTrees(false);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        console.log('📸 Taking picture...');
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          skipProcessing: true, // Attempt to speed up capture
        });
        
        console.log('📸 Camera photo taken:', photo.uri);
        
        const imageData = {
          uri: photo.uri,
          fileName: `camera-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          width: photo.width,
          height: photo.height
        };
        
        console.log('✅ Image data set:', imageData);
        setImage(imageData);
        setImageKey(prev => prev + 1); // Force re-render
        setScanResult(null);
        setIsCameraActive(false);
      } catch (error) {
        console.error('❌ Take picture error:', error);
        // Retry logic
        try {
            console.log('🔄 Retrying capture in 500ms...');
            await new Promise(resolve => setTimeout(resolve, 500));
            if (cameraRef.current) {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.7, // Lower quality for retry
                    base64: false,
                    skipProcessing: true,
                });
                
                const imageData = {
                    uri: photo.uri,
                    fileName: `camera-retry-${Date.now()}.jpg`,
                    mimeType: 'image/jpeg',
                    width: photo.width,
                    height: photo.height
                };
                setImage(imageData);
                setImageKey(prev => prev + 1);
                setScanResult(null);
                setIsCameraActive(false);
                return;
            }
        } catch (retryError) {
             console.error('❌ Retry failed:', retryError);
             Alert.alert('Error', 'Failed to take picture. Please try again.');
        }
      }
    }
  };

  const pickImage = async (useCamera) => {
    try {
      if (useCamera) {
        if (!permission?.granted) {
          const perm = await requestPermission();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Please allow camera access to scan trees.');
            return;
          }
        }
        setIsCameraActive(true);
      } else {
        console.log('📷 Opening gallery picker...');
        
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.8,
        });

        console.log('📷 Picker result:', JSON.stringify(result, null, 2));

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          
          console.log('📸 Asset details:');
          console.log('  URI:', asset.uri);
          console.log('  Type:', asset.mimeType);
          console.log('  Name:', asset.fileName);
          console.log('  Size:', asset.width, 'x', asset.height);
          
          const imageData = {
            uri: asset.uri,
            fileName: asset.fileName || `gallery-${Date.now()}.jpg`,
            mimeType: asset.mimeType || asset.type || 'image/jpeg',
            width: asset.width,
            height: asset.height
          };
          
          console.log('✅ Setting image data:', JSON.stringify(imageData, null, 2));
          setImage(imageData);
          setImageKey(prev => prev + 1); // Force re-render
          setScanResult(null);
        } else {
          console.log('❌ Picker was canceled or no assets');
        }
      }
    } catch (error) {
      console.error('❌ ImagePicker Error:', error);
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

    console.log('📸 Starting upload with image:', image);

    setUploading(true);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 5;
      });
    }, 1000);

    try {
      // Prepare the image for upload
      let uploadUri = image.uri;
      let fileName = image.fileName || `scan-${Date.now()}.jpg`;
      
      console.log('📁 Original URI:', uploadUri);
      console.log('📁 Platform:', Platform.OS);
      
      // Handle Android content URIs
      if (Platform.OS === 'android' && uploadUri.startsWith('content://')) {
        try {
          const destPath = `${FileSystem.cacheDirectory}${fileName}`;
          console.log('📋 Copying from content URI to:', destPath);
          
          await FileSystem.copyAsync({
            from: uploadUri,
            to: destPath
          });
          
          uploadUri = destPath;
          console.log('✅ File copied successfully to:', uploadUri);
        } catch (copyError) {
          console.error('❌ Copy error:', copyError);
          clearInterval(progressInterval);
          setUploading(false);
          setProgress(0);
          Alert.alert('Error', 'Failed to prepare image for upload. Please try taking a photo with the camera instead.');
          return;
        }
      }
      
      // Ensure proper URI format for FormData
      if (!uploadUri.startsWith('file://') && !uploadUri.startsWith('http') && !uploadUri.startsWith('content://')) {
        uploadUri = `file://${uploadUri}`;
      }
      
      console.log('📤 Final upload URI:', uploadUri);
      
      // Create FormData
      const formData = new FormData();
      
      // Append the image
      const imageData = {
        uri: uploadUri,
        type: image.mimeType || 'image/jpeg',
        name: fileName,
      };
      
      console.log('📦 Image data for FormData:', imageData);
      formData.append('image', imageData);

      // Append additional fields
      if (scanType === 'tree') {
        formData.append('treeId', selectedTree);
        formData.append('scanType', 'tree');
        formData.append('scanSubType', treePart);
        
        console.log('🌳 Tree scan data:', {
          treeId: selectedTree,
          scanType: 'tree',
          scanSubType: treePart
        });
        
        console.log('🚀 Uploading tree scan...');
        const response = await scanAPI.upload(formData);
        console.log('✅ Upload response:', response);
        
        // Store the full scan data
        setScanResult({
            type: 'tree',
            data: response.data
        });
        
      } else {
        formData.append('batchID', batchID);
        formData.append('volume', volume || '0');
        formData.append('dryWeight', dryWeight || '0');
        // Explicitly append empty fields to avoid backend issues if it expects them
        formData.append('notes', '');
        
        console.log('💧 Latex scan data:', { batchID });
        console.log('🚀 Uploading latex scan...');
        const response = await latexAPI.createBatch(formData);
        console.log('✅ Upload response:', response);

        setScanResult({
            type: 'latex',
            data: response.data
        });
      }
      
      clearInterval(progressInterval);
      setProgress(100);

      setTimeout(() => {
        setUploading(false);
        // setScanResult is already called above with data
        console.log('✅ Upload completed successfully');
      }, 500);
      
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(0);
      setUploading(false);
      
      console.error('❌❌❌ UPLOAD ERROR ❌❌❌');
      console.error('Error type:', typeof error);
      console.error('Error object:', error);
      
      let errorMessage = 'Failed to upload scan';
      let debugInfo = '';
      
      // Handle different error formats
      if (typeof error === 'object' && error !== null) {
        if (error.error) {
          errorMessage = error.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        if (error.details) {
          debugInfo = JSON.stringify(error.details);
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      console.error('Parsed error message:', errorMessage);
      console.error('Debug info:', debugInfo);
      
      if (errorMessage.toLowerCase().includes("not appear to contain a tree")) {
        Alert.alert(
          'No Tree Detected 🌳', 
          'The image does not appear to contain a tree. Please capture a clear image of a rubber tree.'
        );
      } else if (errorMessage.toLowerCase().includes('network')) {
        Alert.alert(
          'Network Error',
          'Cannot connect to server. Please check:\n\n1. Your internet connection\n2. Server is running\n3. You are on the same WiFi network',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Upload Failed',
          errorMessage + (debugInfo ? `\n\n${debugInfo}` : ''),
          [{ text: 'OK' }]
        );
      }
    }
  };

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

  // Test backend connection
  const testBackendConnection = async () => {
    try {
      console.log('🧪 Testing backend connection...');
      
      // Try multiple endpoints to diagnose
      const endpoints = [
        { name: 'Trees API', method: () => treeAPI.getAll() },
        { name: 'Auth API', method: () => api.get('/api/auth/test-connection').catch(() => ({ status: 'skipped' })) } // Optional check
      ];

      const response = await treeAPI.getAll();
      const treeCount = (response.data || response || []).length;
      
      console.log('✅ Backend is reachable!', response);
      Alert.alert(
        'Connection Successful ✅', 
        `Successfully connected to backend.\nURL: ${api.defaults.baseURL}\nTrees found: ${treeCount}`
      );
    } catch (error) {
      console.error('❌ Backend test failed:', error);
      
      let errorMsg = error.message || 'Unknown error';
      if (errorMsg.includes('Network Error')) {
        errorMsg += '\n\nPossible causes:\n1. Server not running\n2. Different WiFi network\n3. Firewall blocking port 5000';
        if (Platform.OS === 'android') {
          errorMsg += '\n4. Emulator network bridge issue';
        }
      }

      Alert.alert(
        'Connection Failed ❌',
        `Cannot reach backend server.\n\n${errorMsg}`
      );
    }
  };

  // ------------------------------------------------------------------
  // Camera View Overlay
  // ------------------------------------------------------------------
  if (isCameraActive) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView 
          style={styles.camera} 
          facing="back"
          ref={cameraRef}
          mode="picture"
          onCameraReady={() => {
              console.log('📸 Camera is ready');
              setIsCameraReady(true);
          }}
          onMountError={(e) => console.error('❌ Camera mount error:', e)}
        >
          <View style={styles.overlayContainer}>
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            
            <View style={styles.cameraHeader}>
               <TouchableOpacity onPress={() => setIsCameraActive(false)} style={styles.closeButton}>
                 <Ionicons name="close" size={28} color="#FFF" />
               </TouchableOpacity>
               
               <View style={styles.arBadge}>
                 <MaterialCommunityIcons name="augmented-reality" size={18} color={theme.colors.primary} />
                 <Text style={styles.arText}>AI Assistant Active</Text>
               </View>

               <View style={{ width: 40 }} /> 
            </View>

            {isARMode && (
              <View style={styles.guidelinesContainer} pointerEvents="none">
                {scanType === 'tree' ? (
                  treePart === 'trunk' ? (
                    <>
                      <View style={styles.viewFinder}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        
                        <View style={styles.angleGuideContainer}>
                          <View style={styles.angleLine} />
                          <Text style={styles.angleText}>30° Angle</Text>
                        </View>
                      </View>
                      <Text style={styles.guideInstruction}>Align trunk within frame</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.latexViewFinder}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        <MaterialIcons name="eco" size={64} color="rgba(255,255,255,0.2)" />
                      </View>
                      <Text style={styles.guideInstruction}>Center leaf for disease check</Text>
                    </>
                  )
                ) : (
                  <>
                    <View style={styles.latexViewFinder}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        <View style={styles.liquidLevelGuide} />
                        <MaterialCommunityIcons name="water" size={64} color="rgba(255,255,255,0.2)" />
                    </View>
                    <Text style={styles.guideInstruction}>Ensure good lighting on latex</Text>
                  </>
                )}
              </View>
            )}

            <View style={styles.cameraControls}>
               {scanType === 'tree' && (
                <View style={styles.cameraToggleWrapper}>
                  <TouchableOpacity 
                    style={[styles.cameraToggle, treePart === 'trunk' && styles.cameraToggleActive]}
                    onPress={() => setTreePart('trunk')}
                  >
                    <Text style={[styles.cameraToggleText, treePart === 'trunk' && styles.cameraToggleTextActive]}>Trunk</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.cameraToggle, treePart === 'leaf' && styles.cameraToggleActive]}
                    onPress={() => setTreePart('leaf')}
                  >
                    <Text style={[styles.cameraToggleText, treePart === 'leaf' && styles.cameraToggleTextActive]}>Leaf</Text>
                  </TouchableOpacity>
                </View>
               )}

               <TouchableOpacity onPress={takePicture} activeOpacity={0.8} style={styles.shutterButton}>
                  <View style={styles.shutterInner} />
               </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // ------------------------------------------------------------------
  // Main Dashboard View
  // ------------------------------------------------------------------

  if (!user?.isVerified) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <View style={styles.lockIconContainer}>
          <MaterialIcons name="lock-outline" size={48} color={theme.colors.primary} />
        </View>
        <Text style={styles.lockTitle}>Access Restricted</Text>
        <Text style={styles.lockMessage}>
          Please verify your email address to unlock AI scanning capabilities.
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, '#F1F5F9']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Scan</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Test Backend Button */}
          <TouchableOpacity 
            onPress={testBackendConnection}
            style={[styles.iconButton, { backgroundColor: '#E0F2FE' }]}
          >
            <Ionicons name="cloud-outline" size={22} color="#0284C7" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              setImage(null);
              setScanResult(null);
            }} 
            style={[styles.iconButton, !image && { opacity: 0 }]}
            disabled={!image}
          >
            <Ionicons name="refresh-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {scanResult ? (
          <View style={styles.resultCard}>
            <LinearGradient colors={['#FFFFFF', '#F8FAFC']} style={styles.resultGradient}>
               
               {/* Result Header */}
               <View style={styles.resultHeader}>
                  <View style={[styles.resultIconBg, { 
                      backgroundColor: (scanResult.data?.healthStatus === 'healthy' || scanResult.data?.qualityClassification?.grade === 'A') 
                        ? '#DCFCE7' : '#FEE2E2' 
                  }]}>
                    <MaterialCommunityIcons 
                        name={scanResult.type === 'tree' ? "tree" : "water"} 
                        size={32} 
                        color={(scanResult.data?.healthStatus === 'healthy' || scanResult.data?.qualityClassification?.grade === 'A') 
                            ? '#16A34A' : '#DC2626'} 
                    />
                  </View>
                  <View style={{flex: 1}}>
                      <Text style={styles.resultTitle}>
                          {scanResult.type === 'tree' ? 'Health Analysis' : 'Latex Quality'}
                      </Text>
                      <Text style={styles.resultDate}>
                          {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString()}
                      </Text>
                  </View>
               </View>

               {/* Result Content */}
               <View style={styles.resultBody}>
                   {scanResult.type === 'tree' ? (
                       <>
                           <View style={styles.resultRow}>
                               <Text style={styles.resultLabel}>Diagnosis</Text>
                               <Text style={[styles.resultValue, { 
                                   color: scanResult.data?.diseaseDetection?.[0]?.name === 'No disease detected' ? '#16A34A' : '#DC2626',
                                   fontWeight: '700'
                               }]}>
                                   {scanResult.data?.diseaseDetection?.[0]?.name || 'Unknown'}
                               </Text>
                           </View>
                           
                           {scanResult.data?.diseaseDetection?.[0]?.confidence && (
                               <View style={styles.resultRow}>
                                   <Text style={styles.resultLabel}>Confidence</Text>
                                   <Text style={styles.resultValue}>
                                       {Math.round(scanResult.data.diseaseDetection[0].confidence)}%
                                   </Text>
                               </View>
                           )}

                           {scanResult.data?.diseaseDetection?.[0]?.recommendation && (
                               <View style={styles.recommendationBox}>
                                   <View style={styles.recommendationHeader}>
                                     <MaterialIcons name="lightbulb-outline" size={20} color={theme.colors.primary} />
                                     <Text style={styles.recommendationTitle}>Recommendation</Text>
                                   </View>
                                   <Text style={styles.recommendationText}>
                                       {scanResult.data.diseaseDetection[0].recommendation}
                                   </Text>
                               </View>
                           )}

                           {/* Tappability */}
                           {scanResult.data?.tappabilityAssessment && (
                               <View style={styles.tappabilityBox}>
                                   <View style={styles.resultRow}>
                                       <Text style={styles.resultLabel}>Tappable</Text>
                                       <View style={[styles.badge, {
                                           backgroundColor: scanResult.data.tappabilityAssessment.isTappable ? '#DCFCE7' : '#FEF3C7'
                                       }]}>
                                         <Text style={[styles.badgeText, {
                                             color: scanResult.data.tappabilityAssessment.isTappable ? '#16A34A' : '#D97706'
                                         }]}>
                                             {scanResult.data.tappabilityAssessment.isTappable ? 'YES' : 'NO'}
                                         </Text>
                                       </View>
                                   </View>
                                   <Text style={styles.tappabilityReason}>
                                       {scanResult.data.tappabilityAssessment.reason}
                                   </Text>
                               </View>
                           )}
                       </>
                   ) : (
                       <>
                           {/* Latex Result */}
                           <View style={styles.resultRow}>
                               <Text style={styles.resultLabel}>Quality Grade</Text>
                               <Text style={[styles.resultValue, { fontSize: 28, color: '#16A34A' }]}>
                                   {scanResult.data?.qualityClassification?.grade || 'N/A'}
                               </Text>
                           </View>

                           <View style={styles.statsGrid}>
                               <View style={styles.statItem}>
                                   <Text style={styles.statLabel}>Volume</Text>
                                   <Text style={styles.statValue}>
                                       {scanResult.data?.quantityEstimation?.volume || 0}
                                       <Text style={styles.statUnit}> L</Text>
                                   </Text>
                               </View>
                               <View style={styles.statItem}>
                                   <Text style={styles.statLabel}>Dry Rubber</Text>
                                   <Text style={styles.statValue}>
                                       {scanResult.data?.productYieldEstimation?.dryRubberContent || 0}
                                       <Text style={styles.statUnit}> %</Text>
                                   </Text>
                               </View>
                           </View>

                           {scanResult.data?.qualityClassification?.description && (
                               <View style={styles.recommendationBox}>
                                   <View style={styles.recommendationHeader}>
                                     <MaterialIcons name="assessment" size={20} color={theme.colors.primary} />
                                     <Text style={styles.recommendationTitle}>Assessment</Text>
                                   </View>
                                   <Text style={styles.recommendationText}>
                                       {scanResult.data.qualityClassification.description}
                                   </Text>
                               </View>
                           )}
                       </>
                   )}
               </View>
               
               <View style={styles.resultActions}>
                   <TouchableOpacity
                     style={styles.primaryButton}
                     onPress={() => {
                       setScanResult(null);
                       setImage(null);
                       setBatchID('');
                       setVolume('');
                       setDryWeight('');
                       navigation.navigate('History', { 
                            initialTab: scanResult.type === 'latex' ? 'latex' : 'trees',
                            newScan: scanResult.data,
                            refreshTimestamp: Date.now()
                        });
                     }}
                   >
                     <Text style={styles.primaryButtonText}>View Full History</Text>
                     <Ionicons name="arrow-forward" size={20} color="#FFF" />
                   </TouchableOpacity>

                   <TouchableOpacity 
                     style={styles.secondaryButton}
                     onPress={() => {
                       setScanResult(null);
                       setImage(null);
                       setBatchID('');
                       setVolume('');
                       setDryWeight('');
                     }}
                   >
                     <Text style={styles.secondaryButtonText}>Scan Another</Text>
                   </TouchableOpacity>
               </View>
            </LinearGradient>
          </View>
        ) : (
          <>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionLabel}>Select Scan Type</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity 
                  style={[styles.modeChip, scanType === 'tree' && styles.modeChipActive]}
                  onPress={() => {
                      setScanType('tree');
                      setVolume('');
                      setDryWeight('');
                      setBatchID('');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.modeIconBg, scanType === 'tree' && styles.modeIconBgActive]}>
                    <MaterialCommunityIcons 
                      name="tree-outline" 
                      size={24} 
                      color={scanType === 'tree' ? '#FFF' : theme.colors.textSecondary} 
                    />
                  </View>
                  <Text style={[styles.modeChipText, scanType === 'tree' && styles.modeChipTextActive]}>Tree Health</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modeChip, scanType === 'latex' && styles.modeChipActive]}
                  onPress={() => {
                      setScanType('latex');
                      setVolume('');
                      setDryWeight('');
                  }}
                  activeOpacity={0.8}
                >
                   <View style={[styles.modeIconBg, scanType === 'latex' && styles.modeIconBgActive]}>
                    <MaterialCommunityIcons 
                      name="water-outline" 
                      size={24} 
                      color={scanType === 'latex' ? '#FFF' : theme.colors.textSecondary} 
                    />
                  </View>
                  <Text style={[styles.modeChipText, scanType === 'latex' && styles.modeChipTextActive]}>Latex Quality</Text>
                </TouchableOpacity>
              </View>
            </View>

            {scanType === 'tree' && (
              <View style={styles.subModeContainer}>
                 <View style={styles.segmentControl}>
                    <TouchableOpacity 
                      style={[styles.segmentBtn, treePart === 'trunk' && styles.segmentBtnActive]}
                      onPress={() => setTreePart('trunk')}
                    >
                      <Text style={[styles.segmentText, treePart === 'trunk' && styles.segmentTextActive]}>Trunk</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.segmentBtn, treePart === 'leaf' && styles.segmentBtnActive]}
                      onPress={() => setTreePart('leaf')}
                    >
                      <Text style={[styles.segmentText, treePart === 'leaf' && styles.segmentTextActive]}>Leaf</Text>
                    </TouchableOpacity>
                 </View>
              </View>
            )}

            {trees.length > 0 && (
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>
                   {scanType === 'tree' ? 'Target Tree' : 'Linked Tree Profile'}
                </Text>
                <TouchableOpacity 
                  style={styles.dropdownButton}
                  onPress={() => setModalVisible(true)}
                >
                   <View style={styles.dropdownContent}>
                     <View style={[styles.miniIcon, { backgroundColor: '#F0FDF4' }]}>
                        <MaterialCommunityIcons name="pine-tree" size={20} color={theme.colors.primary} />
                     </View>
                     <View>
                        <Text style={styles.dropdownValue}>
                          {selectedTree 
                            ? (trees.find(t => t._id === selectedTree)?.treeID || 'Unknown Tree')
                            : 'Select a Tree'}
                        </Text>
                        <Text style={styles.dropdownSub}>
                           {selectedTree 
                             ? `${trees.find(t => t._id === selectedTree)?.species || 'Rubber Tree'}` 
                             : 'Tap to select from list'}
                        </Text>
                     </View>
                   </View>
                   <Ionicons name="chevron-down" size={20} color={theme.colors.textLight} />
                </TouchableOpacity>
              </View>
            )}

            {scanType === 'latex' && selectedTree && (
               <View style={styles.inputWrapper}>
                 <Text style={styles.inputLabel}>Batch Reference ID</Text>
                 <View style={styles.readOnlyField}>
                    <Text style={styles.readOnlyValue}>{batchID}</Text>
                    <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textLight} />
                 </View>
               </View>
            )}

            {scanType === 'latex' && image && (
                <View style={styles.inputRow}>
                    <View style={[styles.inputWrapper, { flex: 1, marginRight: 8 }]}>
                        <Text style={styles.inputLabel}>Volume (L)</Text>
                        <TextInput
                            style={styles.textInput}
                            value={volume}
                            onChangeText={setVolume}
                            placeholder="0.0"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                        />
                    </View>
                    <View style={[styles.inputWrapper, { flex: 1, marginLeft: 8 }]}>
                        <Text style={styles.inputLabel}>Dry Weight (%)</Text>
                        <TextInput
                            style={styles.textInput}
                            value={dryWeight}
                            onChangeText={setDryWeight}
                            placeholder="Optional"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                        />
                    </View>
                </View>
            )}

            <View style={styles.imageSection}>
               {image ? (
                 <View style={styles.previewContainer}>
                    <Image 
                      key={imageKey}
                      source={{ uri: image.uri }}
                      style={styles.previewImage} 
                      resizeMode="cover"
                      onError={(e) => {
                        console.log('❌❌ Image Load Error ❌❌');
                        console.log('URI:', image.uri);
                        console.log('Error:', e.nativeEvent.error);
                      }}
                      onLoad={() => {
                        console.log('✅✅ Image loaded successfully! ✅✅');
                      }}
                    />
                    
                    <View style={styles.imageInfo}>
                      <Text style={styles.imageInfoText} numberOfLines={1}>
                        {image.fileName || 'Image loaded'}
                      </Text>
                    </View>
                    
                    <TouchableOpacity 
                      style={styles.removeImageBtn}
                      onPress={() => {
                        setImage(null);
                        setScanResult(null);
                      }}
                    >
                      <Ionicons name="close" size={20} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.imageBadge}>
                      <Text style={styles.imageBadgeText}>
                        {scanType === 'tree' ? 'Tree Scan' : 'Latex Sample'}
                      </Text>
                    </View>
                 </View>
               ) : (
                 <View style={styles.placeholderCard}>
                    <View style={styles.placeholderIcon}>
                       <MaterialCommunityIcons name="camera-plus-outline" size={36} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.placeholderTitle}>Capture or Upload</Text>
                    <Text style={styles.placeholderDesc}>
                      {scanType === 'tree' 
                        ? 'Take a clear photo of the tree trunk or leaf for analysis.' 
                        : 'Take a well-lit photo of the latex sample for quality check.'}
                    </Text>
                    
                    <View style={styles.pickerButtons}>
                       <TouchableOpacity style={styles.pickerBtnPrimary} onPress={() => pickImage(true)}>
                          <Ionicons name="camera" size={20} color="#FFF" />
                          <Text style={styles.pickerBtnTextPrimary}>Use Camera</Text>
                       </TouchableOpacity>
                       <TouchableOpacity style={styles.pickerBtnSecondary} onPress={() => pickImage(false)}>
                          <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
                          <Text style={styles.pickerBtnTextSecondary}>Gallery</Text>
                       </TouchableOpacity>
                    </View>
                 </View>
               )}
            </View>

            {image && (
               <TouchableOpacity
                 style={styles.analyzeButton}
                 onPress={uploadScan}
                 disabled={uploading}
               >
                 {uploading ? (
                    <ActivityIndicator color="#FFF" />
                 ) : (
                    <>
                      <MaterialCommunityIcons name="creation" size={24} color="#FFF" />
                      <Text style={styles.analyzeButtonText}>
                         {scanType === 'tree' ? 'Analyze Health' : 'Assess Quality'}
                      </Text>
                    </>
                 )}
               </TouchableOpacity>
            )}

            {trees.length === 0 && (
              <View style={styles.warningBox}>
                 <Ionicons name="alert-circle-outline" size={24} color="#B45309" />
                 <View style={{ flex: 1 }}>
                    <Text style={styles.warningText}>No tree profiles found.</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('AddTree')}>
                       <Text style={styles.warningLink}>+ Create Tree Profile</Text>
                    </TouchableOpacity>
                 </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Tree Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Tree</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={trees}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.listItem,
                    selectedTree === item._id && styles.listItemActive
                  ]}
                  onPress={() => {
                    setSelectedTree(item._id);
                    setModalVisible(false);
                  }}
                >
                  <View style={[styles.listIcon, selectedTree === item._id && styles.listIconActive]}>
                    <MaterialCommunityIcons 
                      name="tree" 
                      size={20} 
                      color={selectedTree === item._id ? '#FFF' : theme.colors.primary} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listItemTitle, selectedTree === item._id && styles.listItemTextActive]}>
                      {item.treeID}
                    </Text>
                    <Text style={[styles.listItemSub, selectedTree === item._id && styles.listItemTextActive]}>
                      {item.species}
                    </Text>
                  </View>
                  {selectedTree === item._id && (
                    <Ionicons name="checkmark-circle" size={24} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.addTreeBtn}
                onPress={() => {
                  setModalVisible(false);
                  navigation.navigate('AddTree');
                }}
              >
                <Ionicons name="add" size={20} color={theme.colors.primary} />
                <Text style={styles.addTreeBtnText}>Add New Tree Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upload Progress Overlay */}
      <Modal visible={uploading} transparent animationType="fade">
         <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
               <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 20 }} />
               <Text style={styles.loadingTitle}>Analyzing Scan...</Text>
               <Text style={styles.loadingSub}>{progress}% Complete</Text>
               <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
               </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
  },
  sectionContainer: {
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  modeChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.primary,
    borderWidth: 2,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  modeIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIconBgActive: {
    backgroundColor: theme.colors.primary,
  },
  modeChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  modeChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  subModeContainer: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: -8,
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 24,
    padding: 4,
  },
  segmentBtn: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTextActive: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  inputWrapper: {
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 16,
    color: '#1E293B',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  dropdownContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  miniIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  dropdownSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  readOnlyField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readOnlyValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  imageSection: {
    marginBottom: 32,
  },
  placeholderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
  },
  placeholderDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  pickerButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  pickerBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pickerBtnTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  pickerBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  pickerBtnTextSecondary: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 3/4,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imageInfo: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backdropFilter: 'blur(4px)',
  },
  imageInfoText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(4px)',
  },
  imageBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  imageBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  analyzeButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    gap: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  analyzeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 16,
    marginTop: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    fontSize: 14,
    color: '#B45309',
    marginBottom: 2,
    fontWeight: '500',
  },
  warningLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B45309',
    textDecorationLine: 'underline',
  },
  // Camera Overlay Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  arBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  arText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cameraControls: {
    paddingBottom: 50,
    alignItems: 'center',
    gap: 32,
  },
  cameraToggleWrapper: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cameraToggle: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraToggleActive: {
    backgroundColor: theme.colors.primary,
  },
  cameraToggleText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    fontSize: 13,
  },
  cameraToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  guidelinesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewFinder: {
    width: width * 0.75,
    height: height * 0.55,
    position: 'relative',
  },
  latexViewFinder: {
    width: width * 0.75,
    height: width * 0.75,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#FFFFFF',
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 2,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  guideInstruction: {
    color: '#FFFFFF',
    marginTop: 32,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  angleGuideContainer: {
    position: 'absolute',
    right: -40,
    top: '50%',
    alignItems: 'center',
  },
  angleLine: {
    width: 50,
    height: 3,
    backgroundColor: '#FCD34D',
    transform: [{ rotate: '-30deg' }],
    borderRadius: 2,
  },
  angleText: {
    color: '#FCD34D',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  liquidLevelGuide: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    position: 'absolute',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listItemActive: {
    backgroundColor: '#F0FDF4',
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  listIconActive: {
    backgroundColor: theme.colors.primary,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  listItemSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  listItemTextActive: {
    color: '#1E293B',
  },
  modalFooter: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingBottom: 40,
  },
  addTreeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    gap: 8,
  },
  addTreeBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  // Loading Overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(5px)',
  },
  loadingCard: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
  },
  loadingSub: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  // Result Card Styles
  resultCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 32,
  },
  resultGradient: {
    padding: 24,
    alignItems: 'center',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 20,
    width: '100%',
  },
  resultIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  resultDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  resultBody: {
    marginBottom: 32,
    width: '100%',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  resultLabel: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  resultValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  recommendationBox: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  recommendationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  recommendationText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  tappabilityBox: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  tappabilityReason: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  statUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  resultActions: {
    gap: 12,
    width: '100%',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    marginBottom: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
  },
  lockMessage: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  resendButton: {
    width: '100%',
  },
});

export default CameraScreen;
