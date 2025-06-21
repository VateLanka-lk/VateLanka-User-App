import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  BackHandler,
} from "react-native";
import { auth } from "../utils/firebaseConfig";
import CustomText from "../utils/CustomText";
import { COLORS } from "../utils/Constants";
import Icon from "react-native-vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NotificationBanner from "../utils/NotificationBanner";
import { clearUserSession } from "../utils/authStorage";
import LocationPicker from "../utils/LocationPicker";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import {
  fetchUserProfile,
  fetchDistrictsForMunicipalCouncil,
  fetchWardsForDistrict,
  updateUserLocation,
  updateUserProfile,
} from "../services/firebaseFirestore";
import { useFocusEffect } from '@react-navigation/native';

export default function ProfileScreen({ navigation }) {
  const [userMunicipalCouncil, setUserMunicipalCouncil] = useState("");
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [showWardModal, setShowWardModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [locationLocked, setLocationLocked] = useState(false);
  const [selectedDistrictName, setSelectedDistrictName] = useState("");
  const [selectedWardName, setSelectedWardName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [nic, setNic] = useState("");
  const [birthday, setBirthday] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [homeLocation, setHomeLocation] = useState(null);
  const [notification, setNotification] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [])
  );

  const handleGoBack = () => {
    navigation.goBack();
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    if (selectedDistrict) {
      fetchWards();
    }
  }, [selectedDistrict]);

  const showNotification = (message, type = "error") => {
    setNotification({
      visible: true,
      message,
      type,
    });
  };

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const userData = await fetchUserProfile(user.uid);
        if (userData) {
          setUserName(userData.name);
          setEditedName(userData.name);
          setUserEmail(userData.email);
          setUserMunicipalCouncil(userData.municipalCouncil);
          setNic(userData.nic || "");
          setBirthday(userData.birthday || "");
          setPhoneNumber(userData.phoneNumber || "");

          if (userData.district && userData.ward) {
            setSelectedDistrict(userData.district);
            setSelectedWard(userData.ward);
            setSelectedDistrictName(userData.districtName);
            setSelectedWardName(userData.wardName);
            setLocationLocked(true);
          }

          if (userData.homeLocation) {
            setHomeLocation(userData.homeLocation);
          }

          await fetchDistricts(userData.municipalCouncil);
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      showNotification("Failed to load user data");
    }
    setLoading(false);
  };

  const validateNIC = (nic) => {
    const nicPattern1 = /^\d{9}[vV]$/;
    const nicPattern2 = /^\d{12}$/;
    return nicPattern1.test(nic) || nicPattern2.test(nic);
  };

  const validateBirthday = (date) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) return false;
    const birthday = new Date(date);
    const today = new Date();
    return birthday < today && birthday > new Date("1900-01-01");
  };

  const validatePhoneNumber = (number) => {
    const regex = /^(?:\+94|0)?[1-9]\d{8}$/;
    return regex.test(number);
  };

  const formatPhoneNumber = (number) => {
    if (!number) return "";
    let cleaned = number.replace(/\D/g, "");

    if (cleaned.startsWith("94")) {
      return "+" + cleaned;
    } else if (cleaned.startsWith("0")) {
      return "+94" + cleaned.slice(1);
    } else if (cleaned.length === 9) {
      return "+94" + cleaned;
    }
    return "+94" + cleaned;
  };

  const handleUpdateProfile = async () => {
    if (!editedName.trim()) {
      showNotification("Name cannot be empty");
      return;
    }

    if (nic && !validateNIC(nic)) {
      showNotification("Invalid NIC format");
      return;
    }

    if (birthday && !validateBirthday(birthday)) {
      showNotification("Invalid birthday format (YYYY-MM-DD)");
      return;
    }

    if (phoneNumber && !validatePhoneNumber(phoneNumber)) {
      showNotification("Invalid phone number");
      return;
    }

    try {
      setLoading(true);

      const user = auth.currentUser;
      if (user) {
        await updateUserProfile(user.uid, {
          name: editedName.trim(),
          nic,
          birthday,
          phoneNumber: formatPhoneNumber(phoneNumber),
        });
        setUserName(editedName.trim());
        setIsEditing(false);
        showNotification("Profile updated successfully!", "success");
      }
    } catch (error) {
      showNotification("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchDistricts = async (municipalCouncilId) => {
    try {
      const districtList = await fetchDistrictsForMunicipalCouncil(
        municipalCouncilId
      );
      setDistricts(districtList);
    } catch (error) {
      console.error("Error fetching districts:", error);
      showNotification("Failed to load districts");
    }
  };

  const fetchWards = async () => {
    try {
      const wardList = await fetchWardsForDistrict(
        userMunicipalCouncil,
        selectedDistrict
      );
      setWards(wardList);
    } catch (error) {
      console.error("Error fetching wards:", error);
      showNotification("Failed to load wards");
    }
  };

  const handleUpdateUserLocation = async () => {
    if (!selectedDistrict || !selectedWard) {
      showNotification("Please select both district and ward");
      return;
    }

    if (!homeLocation) {
      showNotification("Please select your home location on the map");
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const selectedDistrictData = districts.find(
          (d) => d.id === selectedDistrict
        );
        const selectedWardData = wards.find((w) => w.id === selectedWard);

        const locationData = {
          district: selectedDistrict,
          ward: selectedWard,
          districtName: selectedDistrictData.name,
          wardName: selectedWardData.name,
          homeLocation: homeLocation,
          updatedAt: new Date().toISOString(),
        };

        await updateUserLocation(user.uid, locationData);

        const locationString = `${selectedWardData.name}, ${selectedDistrictData.name}`;
        await AsyncStorage.setItem("userLocation", locationString);

        setSelectedDistrictName(selectedDistrictData.name);
        setSelectedWardName(selectedWardData.name);
        setLocationLocked(true);
        showNotification("Location updated successfully!", "success");
      }
    } catch (error) {
      console.error("Error updating user location:", error);
      showNotification("Failed to update location");
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem("userLocation");
      await AsyncStorage.removeItem("subGreeting");
      await AsyncStorage.removeItem("subGreetingTimestamp");
      await clearUserSession();
      await auth.signOut();

      navigation.reset({
        index: 0,
        routes: [{ name: "Welcome" }],
      });
    } catch (error) {
      console.error("Error signing out: ", error);
      showNotification("Failed to sign out");
    }
  };

  const LocationDisplay = () => (
    <View style={styles.locationDisplay}>
      <View style={styles.locationHeader}>
        <Icon name="location-on" size={24} color={COLORS.primary} />
        <CustomText style={styles.locationLabel}>Current Location</CustomText>
      </View>
      <CustomText style={styles.locationValue}>
        {selectedWardName
          ? `${selectedWardName}, ${selectedDistrictName}`
          : "Location not set"}
      </CustomText>

      {homeLocation && (
        <View style={styles.homeLocationContainer}>
          <View style={styles.homeLocationHeader}>
            <Icon name="home" size={18} color={COLORS.primary} />
            <CustomText style={styles.homeLocationLabel}>
              Home Address
            </CustomText>
          </View>
          <View style={styles.homeLocationMapThumbnail}>
            <MapView
              provider={PROVIDER_DEFAULT}
              style={styles.miniMap}
              region={{
                latitude: homeLocation.latitude,
                longitude: homeLocation.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: homeLocation.latitude,
                  longitude: homeLocation.longitude,
                }}
              />
            </MapView>
            <CustomText style={styles.coordinatesText}>
              {homeLocation.latitude.toFixed(6)},{" "}
              {homeLocation.longitude.toFixed(6)}
            </CustomText>
          </View>
        </View>
      )}

      {locationLocked && (
        <View style={styles.lockedMessageContainer}>
          <Icon name="lock" size={16} color={COLORS.errorbanner} />
          <CustomText style={styles.lockedMessage}>
            Location is locked. Contact admin to change.
          </CustomText>
        </View>
      )}
    </View>
  );

  const LocationSelector = ({ title, value, onPress, disabled }) => (
    <TouchableOpacity
      style={[styles.selectorButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.selectorContent}>
        <View style={styles.selectorHeader}>
          <Icon
            name={title === "District" ? "location-city" : "location-on"}
            size={20}
            color={disabled ? COLORS.textGray : COLORS.primary}
          />
          <CustomText style={styles.selectorLabel}>{title}</CustomText>
        </View>
        <CustomText
          style={[styles.selectorValue, disabled && styles.disabledText]}
        >
          {value || `Select ${title}`}
        </CustomText>
      </View>
      {!disabled && (
        <Icon name="arrow-drop-down" size={24} color={COLORS.primary} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <NotificationBanner
        {...notification}
        onHide={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />
      
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Icon name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <CustomText style={styles.headerTitle}>Profile</CustomText>
        <View style={styles.headerRight} />
      </View>
        
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} />
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <View style={styles.profileIcon}>
                  <Icon name="person" size={40} color={COLORS.primary} />
                </View>
                <View style={styles.profileInfo}>
                  <CustomText style={styles.userName}>{userName}</CustomText>
                  <CustomText style={styles.userEmail}>{userEmail}</CustomText>
                </View>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditing(!isEditing)}
                >
                  <Icon
                    name={isEditing ? "check" : "edit"}
                    size={24}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.formSection}>
                <View style={styles.fieldContainer}>
                  <CustomText style={styles.fieldLabel}>Name</CustomText>
                  <TextInput
                    style={[styles.input, !isEditing && styles.disabledInput]}
                    value={editedName}
                    onChangeText={setEditedName}
                    placeholder="Enter your name"
                    editable={isEditing}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.fieldContainer}>
                  <CustomText style={styles.fieldLabel}>NIC</CustomText>
                  <TextInput
                    style={[styles.input, !isEditing && styles.disabledInput]}
                    value={nic}
                    onChangeText={setNic}
                    placeholder="Enter NIC (9 digits + v or 12 digits)"
                    editable={isEditing}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.fieldContainer}>
                  <CustomText style={styles.fieldLabel}>Birthday</CustomText>
                  <TextInput
                    style={[styles.input, !isEditing && styles.disabledInput]}
                    value={birthday}
                    onChangeText={setBirthday}
                    placeholder="YYYY-MM-DD"
                    editable={isEditing}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.phoneContainer}>
                  <View style={styles.phonePrefix}>
                    <CustomText style={styles.phoneFlag}>🇱🇰</CustomText>
                    <CustomText style={styles.phonePrefixText}>+94</CustomText>
                  </View>
                  <TextInput
                    style={[
                      styles.phoneInput,
                      !isEditing && styles.disabledInput,
                    ]}
                    value={phoneNumber.replace(/^\+94/, "")}
                    onChangeText={(text) => {
                      const cleanedText = text
                        .replace(/[^\d]/g, "")
                        .slice(0, 9);
                      setPhoneNumber(cleanedText);
                    }}
                    placeholder="7XXXXXXXX"
                    editable={isEditing}
                    keyboardType="number-pad"
                    maxLength={9}
                  />
                </View>

                {isEditing && (
                  <TouchableOpacity
                    style={styles.updateButton}
                    onPress={handleUpdateProfile}
                  >
                    <Icon name="save" size={20} color={COLORS.white} />
                    <CustomText style={styles.updateButtonText}>
                      Save Changes
                    </CustomText>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.locationSection}>
                {locationLocked ? (
                  <LocationDisplay />
                ) : (
                  <>
                    <View style={styles.sectionTitleContainer}>
                      <Icon
                        name="edit-location"
                        size={24}
                        color={COLORS.primary}
                      />
                      <CustomText style={styles.sectionTitle}>
                        Set Your Location
                      </CustomText>
                    </View>

                    <LocationSelector
                      title="District"
                      value={selectedDistrictName}
                      onPress={() => setShowDistrictModal(true)}
                      disabled={locationLocked}
                    />

                    <LocationSelector
                      title="Ward"
                      value={selectedWardName}
                      onPress={() =>
                        selectedDistrict ? setShowWardModal(true) : null
                      }
                      disabled={locationLocked || !selectedDistrict}
                    />

                    {selectedDistrict && selectedWard && (
                      <>
                        <View style={styles.sectionSubtitleContainer}>
                          <Icon name="home" size={20} color={COLORS.primary} />
                          <CustomText style={styles.sectionSubtitle}>
                            Set Your Exact Home Location
                          </CustomText>
                        </View>

                        <LocationPicker
                          initialLocation={homeLocation}
                          onLocationSelect={(location) =>
                            setHomeLocation(location)
                          }
                          disabled={locationLocked}
                        />

                        <View style={styles.instructionsBox}>
                          <Icon name="info" size={16} color={COLORS.primary} />
                          <CustomText style={styles.instructionsText}>
                            Tap on the map to mark your exact home location. You
                            can drag the marker to adjust.
                          </CustomText>
                        </View>
                      </>
                    )}

                    {!locationLocked &&
                      selectedDistrict &&
                      selectedWard &&
                      homeLocation && (
                        <TouchableOpacity
                          style={styles.updateButton}
                          onPress={handleUpdateUserLocation}
                        >
                          <Icon name="check" size={20} color={COLORS.white} />
                          <CustomText style={styles.updateButtonText}>
                            Confirm & Lock My Location
                          </CustomText>
                        </TouchableOpacity>
                      )}
                  </>
                )}
              </View>

              <TouchableOpacity
                style={styles.signOutButton}
                onPress={handleSignOut}
              >
                <Icon name="logout" size={20} color={COLORS.white} />
                <CustomText style={styles.signOutText}>Sign Out</CustomText>
              </TouchableOpacity>
            </ScrollView>

            <Modal
              visible={showDistrictModal}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowDistrictModal(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowDistrictModal(false)}
              >
                <View style={styles.modalContent}>
                  <CustomText style={styles.modalTitle}>
                    Select District
                  </CustomText>
                  <ScrollView>
                    {districts.map((district) => (
                      <TouchableOpacity
                        key={district.id}
                        style={styles.modalItem}
                        onPress={() => {
                          setSelectedDistrict(district.id);
                          setSelectedDistrictName(district.name);
                          setSelectedWard("");
                          setSelectedWardName("");
                          setShowDistrictModal(false);
                        }}
                      >
                        <CustomText style={styles.modalItemText}>
                          {district.name}
                        </CustomText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>

            <Modal
              visible={showWardModal}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowWardModal(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowWardModal(false)}
              >
                <View style={styles.modalContent}>
                  <CustomText style={styles.modalTitle}>Select Ward</CustomText>
                  <ScrollView>
                    {wards.map((ward) => (
                      <TouchableOpacity
                        key={ward.id}
                        style={styles.modalItem}
                        onPress={() => {
                          setSelectedWard(ward.id);
                          setSelectedWardName(ward.name);
                          setShowWardModal(false);
                        }}
                      >
                        <CustomText style={styles.modalItemText}>
                          {ward.name}
                        </CustomText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 85,
    backgroundColor: COLORS.white,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderGray,
    marginTop: 15,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
     fontSize: 20,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 6,
  },
  headerRight: {
    width: 32,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
    padding: 15,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
  },
  profileIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.textGray,
  },
  locationSection: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 30,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.black,
    marginLeft: 10,
  },
  locationDisplay: {
    backgroundColor: COLORS.secondary,
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  locationLabel: {
    fontSize: 14,
    color: COLORS.textGray,
    marginLeft: 8,
  },
  locationValue: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 10,
  },
  lockedMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  lockedMessage: {
    fontSize: 14,
    color: COLORS.errorbanner,
    fontStyle: "italic",
    marginLeft: 6,
  },
  selectorButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    backgroundColor: COLORS.white,
  },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  selectorContent: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 12,
    color: COLORS.textGray,
    marginLeft: 6,
  },
  selectorValue: {
    fontSize: 16,
    color: COLORS.black,
    marginLeft: 26,
  },
  disabledButton: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.borderGray,
  },
  disabledText: {
    color: COLORS.textGray,
  },
  updateButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  updateButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  signOutButton: {
    backgroundColor: COLORS.errorbanner,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "auto",
    marginBottom: 20,
  },
  signOutText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 20,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 15,
  },
  modalItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
  },
  modalItemText: {
    fontSize: 16,
    color: COLORS.black,
  },
  formSection: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 30,
    padding: 15,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    color: COLORS.textGray,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: COLORS.black,
    backgroundColor: COLORS.white,
  },
  disabledInput: {
    backgroundColor: COLORS.secondary,
    color: COLORS.textGray,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  phonePrefix: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.secondary,
    padding: 12,
    borderRadius: 12,
    marginRight: 8,
  },
  phoneFlag: {
    fontSize: 16,
    marginRight: 4,
  },
  phonePrefixText: {
    fontSize: 16,
    color: COLORS.textGray,
    fontWeight: "600",
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: COLORS.black,
    backgroundColor: COLORS.white,
  },
  sectionSubtitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.black,
    marginLeft: 10,
  },
  homeLocationValue: {
    fontSize: 14,
    color: COLORS.textGray,
    marginTop: 5,
    marginBottom: 10,
  },
  instructionsBox: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  instructionsText: {
    fontSize: 12,
    color: COLORS.textGray,
    marginLeft: 8,
    flex: 1,
  },
  homeLocationContainer: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderGray,
    paddingTop: 15,
  },
  homeLocationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  homeLocationLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textGray,
    marginLeft: 8,
  },
  homeLocationMapThumbnail: {
    height: 120,
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
  },
  miniMap: {
    ...StyleSheet.absoluteFillObject,
  },
  coordinatesText: {
    position: "absolute",
    bottom: 5,
    right: 5,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    padding: 4,
    borderRadius: 4,
    fontSize: 10,
    color: COLORS.textGray,
  },
});