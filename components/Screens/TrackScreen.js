import React, { useState, useEffect, useRef } from "react";
import {
  View,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import { COLORS } from "../utils/Constants";
import CustomText from "../utils/CustomText";
import MapView, { Marker, PROVIDER_DEFAULT, Polyline } from "react-native-maps";
import { auth } from "../utils/firebaseConfig";
import NotificationBanner from "../utils/NotificationBanner";
import { fetchUserProfile } from "../services/firebaseFirestore";
import { firestore } from "../utils/firebaseConfig";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { sendTruckProximityNotification } from "../services/notificationService";

const { width, height } = Dimensions.get("window");

const calculateDistance = (location1, location2) => {
  if (!location1 || !location2) return null;

  const toRadian = (angle) => (Math.PI / 180) * angle;

  const lat1 = location1.latitude;
  const lon1 = location1.longitude;
  const lat2 = location2.latitude;
  const lon2 = location2.longitude;

  const R = 6371e3;
  const φ1 = toRadian(lat1);
  const φ2 = toRadian(lat2);
  const Δφ = toRadian(lat2 - lat1);
  const Δλ = toRadian(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

const subscribeToWardTrucks = async (userData, callback) => {
  if (!userData?.municipalCouncil || !userData?.district || !userData?.ward) {
    throw new Error("User location not set");
  }

  try {
    const wardPath = `municipalCouncils/${userData.municipalCouncil}/Districts/${userData.district}/Wards/${userData.ward}`;

    const supervisorsRef = collection(firestore, `${wardPath}/supervisors`);
    const supervisorsSnapshot = await getDocs(supervisorsRef);

    const unsubscribes = [];
    const allTrucks = [];

    for (const supervisorDoc of supervisorsSnapshot.docs) {
      const supervisorId = supervisorDoc.id;

      const trucksRef = collection(
        firestore,
        `${wardPath}/supervisors/${supervisorId}/trucks`
      );

      const unsubscribe = onSnapshot(trucksRef, (trucksSnapshot) => {
        const trucksList = trucksSnapshot.docs
          .map((doc) => ({
            id: doc.id,
            supervisorId,
            ...doc.data(),
          }))
          .filter(
            (truck) =>
              truck.routeStatus === "active" || truck.routeStatus === "paused"
          );

        allTrucks.splice(0, allTrucks.length, ...trucksList);
        callback([...allTrucks]);
      });

      unsubscribes.push(unsubscribe);
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  } catch (error) {
    console.error("Error subscribing to ward trucks:", error);
    throw error;
  }
};

export function TrackScreen({ navigation }) {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [notification, setNotification] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const mapRef = useRef(null);

  const [notifiedTrucks, setNotifiedTrucks] = useState(new Set());

  const showNotification = (message, type = "error") => {
    setNotification({
      visible: true,
      message,
      type,
    });
  };

  const [refreshing, setRefreshing] = useState(false);

  const checkAndNotifyNearbyTrucks = async (trucksData) => {
    if (!userProfile?.homeLocation) return;

    const nearbyTrucks = trucksData.filter(
      (truck) =>
        truck.distance !== null &&
        truck.distance <= 1000 &&
        truck.routeStatus === "active"
    );

    for (const truck of nearbyTrucks) {
      if (!notifiedTrucks.has(truck.id)) {
        const sent = await sendTruckProximityNotification(truck);
        if (sent) {
          setNotifiedTrucks((prev) => new Set([...prev, truck.id]));
        }
      }
    }
  };

  const loadTruckData = async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        showNotification("You must be logged in to track trucks");
        setLoading(false);
        setRefreshing(false);
        return { success: false };
      }

      const profile = await fetchUserProfile(user.uid);
      setUserProfile(profile);

      if (!profile.homeLocation) {
        setLoading(false);
        setRefreshing(false);
        return { success: false, locationMissing: true };
      }

      if (!profile.ward || !profile.district || !profile.municipalCouncil) {
        setLoading(false);
        setRefreshing(false);
        return { success: false, locationMissing: true };
      }

      const unsubscribe = await subscribeToWardTrucks(profile, (trucksList) => {
        const trucksWithDistance = trucksList
          .map((truck) => {
            if (truck.currentLocation && profile.homeLocation) {
              const distance = calculateDistance(
                profile.homeLocation,
                truck.currentLocation
              );
              return { ...truck, distance };
            }
            return truck;
          })
          .filter((truck) => truck.distance !== null && truck.distance <= 1000);

        trucksWithDistance.sort(
          (a, b) => (a.distance || Infinity) - (b.distance || Infinity)
        );

        setTrucks(trucksWithDistance);

        checkAndNotifyNearbyTrucks(trucksWithDistance);

        setLoading(false);
        setRefreshing(false);
      });

      return { success: true, unsubscribe };
    } catch (error) {
      console.error("Error loading truck data:", error);
      showNotification(error.message || "Failed to load truck data");
      setLoading(false);
      setRefreshing(false);
      return { success: false };
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadTruckData();
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};

    const initializeData = async () => {
      const result = await loadTruckData();
      if (result.success && result.unsubscribe) {
        unsubscribe = result.unsubscribe;
      }
    };

    initializeData();

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      setNotifiedTrucks(new Set());
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const checkForUpdates = async () => {
        if (!loading) {
          const user = auth.currentUser;
          if (user) {
            const updatedProfile = await fetchUserProfile(user.uid);

            if (
              (!userProfile?.homeLocation && updatedProfile?.homeLocation) ||
              (!userProfile?.ward && updatedProfile?.ward) ||
              (!userProfile?.district && updatedProfile?.district)
            ) {
              console.log("Location was updated, reloading truck data");
              await loadTruckData();
            }
          }
        }
      };

      checkForUpdates();

      return () => {};
    }, [userProfile])
  );

  const formatEstimatedTime = (distance) => {
    if (!distance) return "Unknown";

    const adjustedDistance = distance * 1.3;

    const timeInMinutes = Math.round((adjustedDistance / 1000 / 20) * 60);

    if (timeInMinutes < 1) return "Less than a minute";
    if (timeInMinutes === 1) return "1 minute";
    return `${timeInMinutes} minutes`;
  };

  const fitToMarkers = () => {
    if (!mapRef.current || !userProfile?.homeLocation || trucks.length === 0) {
      if (mapRef.current && userProfile?.homeLocation) {
        mapRef.current.animateToRegion({
          latitude: userProfile.homeLocation.latitude,
          longitude: userProfile.homeLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
      return;
    }

    const markers = [
      userProfile.homeLocation,
      ...trucks
        .filter(
          (truck) => truck.currentLocation && truck.routeStatus === "active"
        )
        .map((truck) => truck.currentLocation),
    ];

    mapRef.current.fitToCoordinates(markers, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  };

  const goToProfileScreen = () => {
    navigation.navigate("Profile");
  };

  const renderLocationMissingMessage = () => (
    <View style={styles.locationMissingContainer}>
      <MaterialIcons name="location-off" size={60} color={COLORS.errorbanner} />
      <CustomText style={styles.locationMissingTitle}>
        Location Not Set
      </CustomText>
      <CustomText style={styles.locationMissingText}>
        Please set your home location in your profile before tracking trucks
      </CustomText>
      <TouchableOpacity
        style={styles.setLocationButton}
        onPress={goToProfileScreen}
      >
        <MaterialIcons name="edit-location" size={20} color={COLORS.white} />
        <CustomText style={styles.setLocationButtonText}>
          Set My Location
        </CustomText>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <NotificationBanner
        visible={notification.visible}
        message={notification.message}
        type={notification.type}
        onHide={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <CustomText style={styles.heading}>Truck Tracking</CustomText>
          <CustomText style={styles.subtitle}>
            Monitor nearby waste collection trucks
          </CustomText>
        </View>
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <CustomText style={styles.loadingText}>
              Loading trucks...
            </CustomText>
          </View>
        ) : !userProfile?.homeLocation ? (
          renderLocationMissingMessage()
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
          >
            <View style={styles.mapWrapper}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_DEFAULT}
                style={styles.mapContainer}
                initialRegion={
                  userProfile?.homeLocation
                    ? {
                        latitude: userProfile.homeLocation.latitude,
                        longitude: userProfile.homeLocation.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }
                    : null
                }
                onLayout={fitToMarkers}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={true}
                rotateEnabled={true}
                scrollEnabled={true}
                zoomEnabled={true}
              >
                {userProfile?.homeLocation && (
                  <Marker
                    coordinate={userProfile.homeLocation}
                    title="Your Location"
                    description="Your home address"
                  >
                    <View style={styles.userMarker}>
                      <MaterialIcons
                        name="home"
                        size={24}
                        color={COLORS.primary}
                      />
                    </View>
                  </Marker>
                )}

                {trucks.map(
                  (truck) =>
                    truck.currentLocation &&
                    truck.routeStatus === "active" && (
                      <Marker
                        key={truck.id}
                        coordinate={truck.currentLocation}
                        title={`Truck ${truck.numberPlate || "Unknown"}`}
                        description={`${truck.distance}m away`}
                      >
                        <Image
                          source={require("../ApplicationAssets/truck-icon.png")}
                          style={styles.truckImage}
                        />
                      </Marker>
                    )
                )}

                {trucks.map(
                  (truck) =>
                    truck.currentLocation &&
                    userProfile?.homeLocation &&
                    truck.routeStatus === "active" && (
                      <Polyline
                        key={`route-${truck.id}`}
                        coordinates={[
                          userProfile.homeLocation,
                          truck.currentLocation,
                        ]}
                        strokeWidth={2}
                        strokeColor="rgba(0, 122, 255, 0.6)"
                        lineDashPattern={[5, 5]}
                      />
                    )
                )}
              </MapView>

              <TouchableOpacity
                style={styles.zoomButton}
                onPress={fitToMarkers}
              >
                <MaterialIcons
                  name="my-location"
                  size={24}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.truckListContainer}>
              {trucks.length === 0 ? (
                <View style={styles.noTrucksContainer}>
                  <MaterialIcons
                    name="info-outline"
                    size={40}
                    color={COLORS.textGray}
                  />
                  <CustomText style={styles.noTrucksText}>
                    No active waste collection trucks within 1km of your
                    location
                  </CustomText>
                </View>
              ) : (
                trucks.map((truck) => (
                  <View key={truck.id} style={styles.card}>
                    <MaterialIcons
                      name="local-shipping"
                      size={24}
                      color={COLORS.primary}
                    />
                    <View style={styles.cardContent}>
                      <CustomText style={styles.cardTitle} numberOfLines={1}>
                        {truck.numberPlate || "No vehicle number"}
                      </CustomText>
                      <View style={styles.statusContainer}>
                        <CustomText style={styles.cardTime}>
                          {truck.distance ? `${truck.distance}m - ` : ""}
                          {truck.distance
                            ? formatEstimatedTime(truck.distance)
                            : "Unknown ETA"}
                        </CustomText>
                      </View>
                    </View>
                  </View>
                ))
              )}
              <View style={styles.bottomSpace} />
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  heading: {
    fontSize: 28,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 6,
     marginTop: 15,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textGray,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.textGray,
    fontSize: 16,
  },
  mapWrapper: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mapContainer: {
    height: height * 0.5,
    width: "100%",
  },
  userMarker: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  truckImage: {
    width: 40,
    height: 40,
    resizeMode: "contain",
  },
  zoomButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "white",
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  noTrucksContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  noTrucksText: {
    color: COLORS.textGray,
    fontSize: 16,
    textAlign: "center",
    marginTop: 10,
  },
  scrollContent: {
    flex: 1,
  },
  card: {
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.black,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  cardTime: {
    fontSize: 14,
    color: COLORS.textGray,
  },
  bottomSpace: {
    height: 20,
  },
  locationMissingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  locationMissingTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: COLORS.errorbanner,
    marginTop: 16,
    marginBottom: 10,
  },
  locationMissingText: {
    fontSize: 16,
    color: COLORS.textGray,
    textAlign: "center",
    marginBottom: 24,
  },
  setLocationButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    borderRadius: 12,
    width: "80%",
    marginTop: 10,
  },
  setLocationButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  truckListContainer: {
    flex: 1,
  },
});

export default TrackScreen;
