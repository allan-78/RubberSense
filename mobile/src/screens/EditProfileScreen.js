import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppRefresh } from '../context/AppRefreshContext';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

// Theme colors
const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#64748B',
  primary: '#556B2F', // Olive Green
  primaryLight: '#8FBC8F',
  border: '#E2E8F0',
  error: '#EF4444',
  success: '#10B981',
};

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user, updateProfile } = useAuth();
  const { refreshAllPages } = useAppRefresh();

  // Form State
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [location, setLocation] = useState(user?.location || '');
  const [bio, setBio] = useState(user?.bio || '');
  
  // Image State
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Loading State
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Initialize state from user object when available
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phoneNumber || '');
      setLocation(user.location || '');
      setBio(user.bio || '');
    }
  }, [user]);

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.log('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const getCurrentLocation = async () => {
    try {
      setIsLocating(true);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        setIsLocating(false);
        return;
      }

      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const { latitude, longitude } = locationData.coords;
      
      // Reverse Geocoding to get address
      try {
        const addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addressResponse && addressResponse.length > 0) {
          const addr = addressResponse[0];
          // Construct a readable address string
          const addressParts = [
            addr.city || addr.subregion,
            addr.region,
            addr.country
          ].filter(Boolean);
          
          setLocation(addressParts.join(', '));
        } else {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
      } catch (geoError) {
        console.log('Geocoding error:', geoError);
        setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      }
      
    } catch (error) {
      console.log('Location error:', error);
      Alert.alert('Error', 'Could not fetch location');
    } finally {
      setIsLocating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required');
      return;
    }

    try {
      setIsLoading(true);
      
      const formData = new FormData();
      formData.append('name', name);
      formData.append('bio', bio);
      formData.append('phoneNumber', phone);
      formData.append('location', location);
      
      if (selectedImage) {
        const filename = selectedImage.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('profileImage', {
          uri: selectedImage,
          name: filename,
          type,
        });
        console.log('📸 [EditProfile] Appending image:', { uri: selectedImage, name: filename, type });
      }

      console.log('🚀 [EditProfile] Sending update request...');
      const result = await updateProfile(formData);
      console.log('📡 [EditProfile] Response:', result);
      
      if (result.success) {
        refreshAllPages('profile_updated');
        Alert.alert('Success', 'Profile updated successfully', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to update profile');
      }
    } catch (error) {
      console.log('Save error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const displayImage = selectedImage || user?.profileImage || `https://ui-avatars.com/api/?name=${name.replace(' ', '+')}&background=556B2F&color=fff&size=200`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={isLoading}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity 
          style={[styles.saveButton, isLoading && styles.disabledButton]} 
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <Image 
              source={{ uri: displayImage }} 
              style={styles.avatar} 
            />
            <TouchableOpacity style={styles.cameraButton} onPress={pickImage}>
              <Ionicons name="camera" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={pickImage}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Personal Details Card */}
        <View style={styles.cardContainer}>
          <Text style={styles.sectionHeader}>PERSONAL DETAILS</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>FULL NAME</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={18} color={COLORS.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <View style={[styles.inputContainer, styles.disabledInput]}>
              <Ionicons name="mail" size={18} color={COLORS.primary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: COLORS.textSecondary }]}
                value={email}
                editable={false}
                placeholder="Enter email address"
              />
            </View>
            <Text style={styles.helperText}>Email cannot be changed.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PHONE NUMBER</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call" size={18} color={COLORS.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>LOCATION</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="location" size={18} color={COLORS.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="City, Region"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity 
                onPress={getCurrentLocation} 
                disabled={isLocating}
                style={styles.locationButton}
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="locate" size={20} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Bio Description Section */}
        <View style={styles.cardContainer}>
          <Text style={styles.sectionHeader}>BIO DESCRIPTION</Text>
          <View style={styles.bioContainer}>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
          <Text style={styles.helperText}>Brief description for your profile.</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 24) + 20,
    paddingBottom: 20,
    backgroundColor: COLORS.background,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.success,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  changePhotoText: {
    fontSize: 14,
    color: '#8B4513',
    fontWeight: '700',
  },

  // Cards
  cardContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginBottom: 20,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#FFF',
  },
  disabledInput: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  inputIcon: {
    marginRight: 12,
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  locationButton: {
    padding: 8,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: -12, // Pull closer to input group
    marginBottom: 12,
    marginLeft: 4,
  },
  
  // Bio
  bioContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#FFF',
    marginBottom: 20,
  },
  bioInput: {
    fontSize: 14,
    color: COLORS.text,
    minHeight: 80,
  },
});

export default EditProfileScreen;
