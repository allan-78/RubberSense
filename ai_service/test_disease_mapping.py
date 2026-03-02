
import sys
import os
import unittest

# Add current directory to path so we can import disease_mapping
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from disease_mapping import map_trunk_disease

class TestDiseaseMapping(unittest.TestCase):

    def test_healthy_classes(self):
        """Test healthy/normal classes mapping"""
        cases = [
            ("nayang-normal", "none", "Tree is healthy"),
            ("rubber tree", "none", "Tree is healthy"),
            ("rubber leaves", "none", "Healthy tree with visible leaves")
        ]
        for name, expected_severity, expected_rec_part in cases:
            mapped_name, severity, recommendation = map_trunk_disease(name)
            self.assertEqual(severity, expected_severity, f"Failed for {name}")
            self.assertIn(expected_rec_part, recommendation, f"Failed recommendation for {name}")

    def test_disease_classes(self):
        """Test various disease classes mapping"""
        cases = [
            ("bark rot", "high", "Bark Rot detected"),
            ("black line disease", "high", "Black Line Disease detected"),
            ("brown root disease", "critical", "Brown Root Disease detected"),
            ("white root disease", "critical", "White Root Disease detected"),
            ("dry crust disease", "moderate", "Dry Crust Disease detected"),
            ("fishbone disease", "high", "Fishbone Disease detected"),
            ("pink mold disease", "high", "Pink Mold Disease detected"),
            ("powdery mildew", "moderate", "Powdery Mildew detected"),
            ("leaf pustule disease", "moderate", "Leaf Pustule detected")
        ]
        for name, expected_severity, expected_rec_part in cases:
            mapped_name, severity, recommendation = map_trunk_disease(name)
            self.assertEqual(severity, expected_severity, f"Failed severity for {name}")
            self.assertIn(expected_rec_part, recommendation, f"Failed recommendation for {name}")

    def test_fallback_logic(self):
        """Test fallback logic for unknown or partial matches"""
        cases = [
            ("unknown root issue", "critical", "Root disease detected"),
            ("generic rot", "high", "Apply copper-based fungicide"),
            ("random canker", "high", "Apply copper-based fungicide"),
            ("weird mold", "high", "Apply copper-based fungicide"),
            ("completely unknown thing", "high", "Treatment required") # Default fallback
        ]
        for name, expected_severity, expected_rec_part in cases:
            mapped_name, severity, recommendation = map_trunk_disease(name)
            self.assertEqual(severity, expected_severity, f"Failed severity for {name}")
            self.assertIn(expected_rec_part, recommendation, f"Failed recommendation for {name}")

    def test_case_insensitivity(self):
        """Test that mapping is case insensitive"""
        name, severity, _ = map_trunk_disease("BARK ROT")
        self.assertEqual(severity, "high")
        
        name, severity, _ = map_trunk_disease("WhItE RoOt DiSeAsE")
        self.assertEqual(severity, "critical")

if __name__ == '__main__':
    print("🧪 Running Disease Mapping Tests...")
    unittest.main()
