
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { treeAPI } from '../services/api';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';

const AddTreeScreen = ({ navigation }) => {
  const [treeID, setTreeID] = useState(`TREE-${Math.floor(Math.random() * 10000)}`);
  const [location, setLocation] = useState('');
  const [species, setSpecies] = useState('Rubber');
  const [plantedDate, setPlantedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!treeID.trim()) {
      Alert.alert('Error', 'Please enter a Tree ID');
      return;
    }

    setLoading(true);
    try {
      await treeAPI.create({
        treeID,
        location: location || 'Unknown',
        species,
        plantedDate,
        isRubberTree: true
      });

      Alert.alert(
        'Success',
        'Tree profile created successfully!',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('Create tree error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to create tree');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.gradients.primary}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Tree</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tree ID</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="qr-code" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={treeID}
                onChangeText={setTreeID}
                placeholder="Enter Tree ID"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location / Plot</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="place" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Plot A, Row 3"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Species</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="leaf" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={species}
                onChangeText={setSpecies}
                placeholder="Tree Species"
                editable={false} // Locked to Rubber for now
              />
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Planted Date (YYYY-MM-DD)</Text>
             <View style={styles.inputWrapper}>
              <MaterialIcons name="event" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={plantedDate}
                onChangeText={setPlantedDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <CustomButton
            title="Create Tree Profile"
            onPress={handleCreate}
            loading={loading}
            style={styles.createButton}
          />
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
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  content: {
    padding: 20,
  },
  formCard: {
    backgroundColor: '#FFF',
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    ...theme.shadows.md,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    height: 50,
    backgroundColor: '#FAFAFA',
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: theme.colors.text,
  },
  createButton: {
    marginTop: 10,
  },
});

export default AddTreeScreen;
