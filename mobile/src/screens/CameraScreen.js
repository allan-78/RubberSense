// ============================================
// Camera & Scan Screen
// ============================================

import React, { useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { scanAPI, treeAPI, latexAPI } from '../services/api';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';
import { useAuth } from '../context/AuthContext';

const CameraScreen = ({ navigation }) => {
  const { user, resendVerificationEmail } = useAuth();
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);
  const [selectedTree, setSelectedTree] = useState(null);
  const [trees, setTrees] = useState([]);
  
  // New state for Latex Mode
  const [scanType, setScanType] = useState('tree'); // 'tree' or 'latex'
  const [batchID, setBatchID] = useState('');

  // Load user's trees
  React.useEffect(() => {
    if (user?.isVerified && scanType === 'tree') {
      loadTrees();
    }
  }, [user, scanType]);

  const loadTrees = async () => {
    try {
      const response = await treeAPI.getAll();
      setTrees(response.data);
      if (response.data.length > 0) {
        setSelectedTree(response.data[0]._id);
      }
    } catch (error) {
      console.log('Load trees error:', error);
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
      let permission;
      
      if (useCamera) {
        permission = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow camera/gallery access');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaType.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaType.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          });

      if (!result.canceled) {
        setImage(result.assets[0]);
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

    if (scanType === 'tree' && !selectedTree && trees.length === 0) {
      Alert.alert('Error', 'Please create a tree first');
      return;
    }

    if (scanType === 'latex' && !batchID.trim()) {
      Alert.alert('Error', 'Please enter a Batch ID');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', {
        uri: image.uri,
        type: 'image/jpeg',
        name: scanType === 'tree' ? 'tree-scan.jpg' : 'latex-scan.jpg',
      });

      if (scanType === 'tree') {
        formData.append('treeId', selectedTree);
        formData.append('scanType', 'tree');
        await scanAPI.upload(formData);
      } else {
        formData.append('batchID', batchID);
        await latexAPI.createBatch(formData);
      }

      Alert.alert(
        'Success! 🎉',
        `${scanType === 'tree' ? 'Tree' : 'Latex'} scanned successfully`,
        [
          {
            text: 'View Results',
            onPress: () => navigation.navigate('History'), // TODO: Navigate to Latex History if latex
          },
          {
            text: 'Scan Another',
            onPress: () => {
              setImage(null);
              setBatchID('');
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Upload Failed', error.error || 'Failed to upload scan');
    } finally {
      setUploading(false);
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Mode Switcher */}
        <View style={styles.modeContainer}>
          <TouchableOpacity 
            style={[styles.modeButton, scanType === 'tree' && styles.modeButtonActive]}
            onPress={() => {
              setScanType('tree');
              setImage(null);
            }}
          >
            <Text style={[styles.modeText, scanType === 'tree' && styles.modeTextActive]}>Tree Analysis</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modeButton, scanType === 'latex' && styles.modeButtonActive]}
            onPress={() => {
              setScanType('latex');
              setImage(null);
            }}
          >
            <Text style={[styles.modeText, scanType === 'latex' && styles.modeTextActive]}>Latex Quality</Text>
          </TouchableOpacity>
        </View>

        {/* Image Preview Section */}
        {image ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: image.uri }} style={styles.image} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.imageOverlay}
            />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setImage(null)}
            >
              <MaterialIcons name="delete-outline" size={24} color="#FFFFFF" />
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

        {/* Warning Card */}
        {scanType === 'tree' && trees.length === 0 && (
          <View style={styles.warningCard}>
            <MaterialIcons name="warning-amber" size={28} color={theme.colors.warning} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>No Trees Found</Text>
              <Text style={styles.warningText}>
                You need to create a tree profile before you can scan it.
              </Text>
            </View>
          </View>
        )}

        {/* Latex Batch ID Input */}
        {scanType === 'latex' && image && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Batch ID / Container #</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., BATCH-001"
              value={batchID}
              onChangeText={setBatchID}
              autoCapitalize="characters"
            />
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
            <MaterialIcons name="lightbulb" size={24} color={theme.colors.accent} />
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
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
    zIndex: 10,
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 4,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  modeText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textLight,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#FFF',
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
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 100,
  },
  imageContainer: {
    height: 400,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.lg,
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
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
    color: theme.colors.text,
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
});

export default CameraScreen;
