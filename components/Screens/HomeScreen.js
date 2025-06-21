import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Animated,
  Platform,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { COLORS } from "../utils/Constants";
import CustomText from "../utils/CustomText";
import greetings from "../utils/greetings";
import Icon from "react-native-vector-icons/MaterialIcons";
import { auth, firestore } from "../utils/firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NewsFeed } from "../api/NewsFeed";
import { useFocusEffect } from "@react-navigation/native";
import {
  fetchUserSchedules,
  fetchUserProfile,
} from "../services/firebaseFirestore";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

const { width } = Dimensions.get("window");

const WasteTypeIcons = {
  Degradable: "delete-outline",
  Recyclable: "replay",
  "Non Recyclable": "delete-forever",
};

const WasteTypeColors = {
  Degradable: COLORS.DEGRADABLE_WASTE,
  Recyclable: COLORS.RECYCLABLE_WASTE,
  "Non Recyclable": COLORS.NON_RECYCLABLE_WASTE,
};

const ProfileButton = ({ onPress, style }) => (
  <TouchableOpacity
    style={[styles.profileButton, style]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.profileIconContainer}>
      <Icon name="person" size={24} color={COLORS.primary} />
    </View>
  </TouchableOpacity>
);

const TipCard = ({ tip, icon }) => (
  <View style={styles.tipCard}>
    <View style={styles.tipIconContainer}>
      <Icon name={icon} size={20} color={COLORS.white} />
    </View>
    <CustomText style={styles.tipText}>{tip}</CustomText>
  </View>
);

export default function HomeScreen({ navigation }) {
  const [userName, setUserName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [subGreeting, setSubGreeting] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [newsKey, setNewsKey] = useState(0);
  const [locationText, setLocationText] = useState("Select Location");
  const [todayCollections, setTodayCollections] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [nearbyTrucks, setNearbyTrucks] = useState([]);
  const [loadingTrucks, setLoadingTrucks] = useState(true);

  const scrollViewRef = useRef(null);
  const searchAnimation = useRef(new Animated.Value(0)).current;
  const mapRef = useRef(null);

  const recyclingTips = [
    {
      tip: "Rinse containers before recycling to avoid contamination.",
      icon: "opacity",
    },
    {
      tip: "Flatten cardboard boxes to save space in recycling bins.",
      icon: "dashboard",
    },
    { tip: "Remove plastic caps from bottles before recycling.", icon: "eco" },
    {
      tip: "Separate different types of recyclables for more efficient processing.",
      icon: "layers",
    },
    {
      tip: "Check with your local council about which plastics they accept.",
      icon: "info",
    },
  ];

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

  const fetchUserData = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const profile = await fetchUserProfile(user.uid);
        setUserProfile(profile);

        if (profile) {
          setUserName(profile.name);

          if (profile.wardName && profile.districtName) {
            const locationString = `${profile.wardName}, ${profile.districtName}`;
            setLocationText(locationString);
            await AsyncStorage.setItem("userLocation", locationString);
          } else {
            setLocationText("Select Location");
            await AsyncStorage.removeItem("userLocation");
          }

          if (
            profile.homeLocation &&
            profile.ward &&
            profile.district &&
            profile.municipalCouncil
          ) {
            subscribeTrucks(profile);
          } else {
            setLoadingTrucks(false);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setLoadingTrucks(false);
    }
  };

  const subscribeTrucks = async (profile) => {
    if (
      !profile?.municipalCouncil ||
      !profile?.district ||
      !profile?.ward ||
      !profile?.homeLocation
    ) {
      setLoadingTrucks(false);
      return;
    }

    try {
      const wardPath = `municipalCouncils/${profile.municipalCouncil}/Districts/${profile.district}/Wards/${profile.ward}`;

      const supervisorsRef = collection(firestore, `${wardPath}/supervisors`);
      const supervisorsSnapshot = await getDocs(supervisorsRef);

      const unsubscribes = [];
      const activeTrucks = [];

      for (const supervisorDoc of supervisorsSnapshot.docs) {
        const supervisorId = supervisorDoc.id;

        const trucksRef = collection(
          firestore,
          `${wardPath}/supervisors/${supervisorId}/trucks`
        );

        const q = query(
          trucksRef,
          where("routeStatus", "in", ["active", "paused"])
        );

        const unsubscribe = onSnapshot(q, (trucksSnapshot) => {
          const trucksList = trucksSnapshot.docs
            .map((doc) => ({
              id: doc.id,
              supervisorId,
              ...doc.data(),
            }))
            .filter((truck) => truck.currentLocation);

          const trucksWithDistance = trucksList.map((truck) => {
            if (truck.currentLocation && profile.homeLocation) {
              const distance = calculateDistance(
                profile.homeLocation,
                truck.currentLocation
              );
              return { ...truck, distance };
            }
            return truck;
          });

          const nearbyTrucksList = trucksWithDistance
            .filter(
              (truck) => truck.distance !== null && truck.distance <= 1000
            )
            .sort(
              (a, b) => (a.distance || Infinity) - (b.distance || Infinity)
            );

          setNearbyTrucks(nearbyTrucksList);
          setLoadingTrucks(false);
        });

        unsubscribes.push(unsubscribe);
      }

      return () => {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
      };
    } catch (error) {
      console.error("Error subscribing to trucks:", error);
      setLoadingTrucks(false);
    }
  };

  const fetchTodaySchedule = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const scheduleData = await fetchUserSchedules(user.uid);
        const today = new Date();
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const todayName = days[today.getDay()];

        const todaySchedules = scheduleData.filter(
          (schedule) => schedule.day === todayName || schedule.day === "All"
        );
        setTodayCollections(todaySchedules);
      }
    } catch (error) {
      console.error("Error fetching schedule:", error);
    }
  };

  const updateGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const fetchSubGreeting = async () => {
    const randomIndex = Math.floor(Math.random() * greetings.length);
    const newGreeting = greetings[randomIndex];
    setSubGreeting(newGreeting);
    await AsyncStorage.setItem("subGreeting", newGreeting);
    await AsyncStorage.setItem(
      "subGreetingTimestamp",
      new Date().getTime().toString()
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchUserData(),
      fetchSubGreeting(),
      fetchTodaySchedule(),
    ]);
    setGreeting(updateGreeting());
    setNewsKey((prev) => prev + 1);
    setRefreshing(false);
  };

  const handleSearch = (text) => {
    setSearchQuery(text);

    if (text.length > 0) {
      setIsSearchActive(true);
      const fakeResults = [
        {
          id: 1,
          title: "Collection Schedule",
          icon: "event",
          screen: "Schedule",
        },
        {
          id: 2,
          title: "Track Collection Trucks",
          icon: "local-shipping",
          screen: "Track",
        },
        {
          id: 3,
          title: "Report an Issue",
          icon: "report-problem",
          screen: "Report",
        },
        {
          id: 4,
          title: "Recycling Information",
          icon: "eco",
          screen: "Recycle",
        },
      ].filter((item) => item.title.toLowerCase().includes(text.toLowerCase()));

      setSearchResults(fakeResults);
    } else {
      setIsSearchActive(false);
      setSearchResults([]);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchUserData();
      setGreeting(updateGreeting());
      fetchSubGreeting();
      fetchTodaySchedule();
    }, [])
  );

  useEffect(() => {
    fetchUserData();
    setGreeting(updateGreeting());
    fetchSubGreeting();
    fetchTodaySchedule();

    return () => {};
  }, []);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <Icon name="location-on" size={20} color={COLORS.primary} />
          <CustomText style={styles.locationText}>{locationText}</CustomText>
          <Icon name="arrow-drop-down" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <ProfileButton onPress={() => navigation.navigate("Profile")} />
      </View>

      <View style={styles.greetingContainer}>
        <CustomText style={styles.greetingText}>
          {greeting}, {userName}!
        </CustomText>
        <CustomText style={styles.subGreetingText}>{subGreeting}</CustomText>
      </View>
    </View>
  );

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <Icon name="search" size={24} color={COLORS.textGray} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search for updates"
        placeholderTextColor={COLORS.textGray}
        value={searchQuery}
        onChangeText={handleSearch}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          onPress={() => {
            setSearchQuery("");
            setIsSearchActive(false);
            setSearchResults([]);
          }}
        >
          <Icon name="close" size={20} color={COLORS.textGray} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSearchResults = () => {
    if (!isSearchActive) return null;

    return (
      <View style={styles.searchResultsContainer}>
        {searchResults.length > 0 ? (
          searchResults.map((result) => (
            <TouchableOpacity
              key={result.id}
              style={styles.searchResultItem}
              onPress={() => {
                setSearchQuery("");
                setIsSearchActive(false);
                navigation.navigate(result.screen);
              }}
            >
              <Icon name={result.icon} size={20} color={COLORS.primary} />
              <CustomText style={styles.searchResultText}>
                {result.title}
              </CustomText>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.noResultsContainer}>
            <Icon name="search-off" size={30} color={COLORS.textGray} />
            <CustomText style={styles.noResultsText}>
              No results found
            </CustomText>
          </View>
        )}
      </View>
    );
  };

  const renderTodayTip = () => {
    const randomTip =
      recyclingTips[Math.floor(Math.random() * recyclingTips.length)];
    return <TipCard tip={randomTip.tip} icon={randomTip.icon} />;
  };

  const renderScheduleCard = (collection, index) => (
    <View
      key={index}
      style={[
        styles.scheduleCard,
        { backgroundColor: WasteTypeColors[collection.wasteType] },
      ]}
    >
      <View style={styles.scheduleCardHeader}>
        <Icon
          name={WasteTypeIcons[collection.wasteType]}
          size={24}
          color={COLORS.white}
        />
        <CustomText style={styles.wasteTypeText}>
          {collection.wasteType}
        </CustomText>
      </View>

      {collection.timeSlot && (
        <View style={styles.scheduleTimeContainer}>
          <Icon name="access-time" size={16} color={COLORS.white} />
          <CustomText style={styles.timeText}>
            {`${collection.timeSlot.start} - ${collection.timeSlot.end}`}
          </CustomText>
        </View>
      )}

      {collection.frequency && (
        <View style={styles.frequencyContainer}>
          <Icon name="replay" size={14} color={COLORS.white} />
          <CustomText style={styles.frequencyText}>
            {collection.frequency}
          </CustomText>
        </View>
      )}
    </View>
  );

  const renderNearbyTrucksMap = () => {
    if (loadingTrucks) {
      return (
        <View style={styles.truckMapLoading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <CustomText style={styles.loadingText}>
            Locating nearby trucks...
          </CustomText>
        </View>
      );
    }

    if (!userProfile?.homeLocation) {
      return (
        <TouchableOpacity
          style={styles.setLocationContainer}
          onPress={() => navigation.navigate("Profile")}
        >
          <Icon name="add-location" size={40} color={COLORS.primary} />
          <CustomText style={styles.setLocationText}>
            Set your home location to see nearby trucks
          </CustomText>
          <View style={styles.setLocationButton}>
            <CustomText style={styles.setLocationButtonText}>
              Go to Profile
            </CustomText>
            <Icon name="arrow-forward" size={16} color={COLORS.white} />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.truckMapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.truckMap}
          initialRegion={{
            latitude: userProfile.homeLocation.latitude,
            longitude: userProfile.homeLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {/* User's home location marker */}
          <Marker coordinate={userProfile.homeLocation} title="Your Location">
            <View style={styles.homeMarker}>
              <Icon name="home" size={16} color={COLORS.primary} />
            </View>
          </Marker>

          {/* Nearby trucks */}
          {nearbyTrucks.map((truck) => (
            <Marker
              key={truck.id}
              coordinate={truck.currentLocation}
              title={`Truck ${truck.numberPlate || "Unknown"}`}
              description={`${truck.distance}m away`}
            >
              <View style={styles.truckMarker}>
                <Icon name="local-shipping" size={14} color="#fff" />
              </View>
            </Marker>
          ))}
        </MapView>

        <View style={styles.truckMapOverlay}>
          <View style={styles.truckCountContainer}>
            <Icon name="local-shipping" size={18} color={COLORS.primary} />
            <CustomText style={styles.truckCountText}>
              {nearbyTrucks.length}{" "}
              {nearbyTrucks.length === 1 ? "truck" : "trucks"} nearby
            </CustomText>
          </View>

          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={() => navigation.navigate("Track")}
          >
            <CustomText style={styles.viewAllText}>View All</CustomText>
            <Icon name="arrow-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderSearchBar()}
      {renderSearchResults()}

      {!isSearchActive && (
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Today's Tip */}
          <View style={styles.tipSection}>
            <View style={styles.sectionHeader}>
              <Icon name="lightbulb" size={24} color={COLORS.primary} />
              <CustomText style={styles.sectionTitle}>Today's Tip</CustomText>
            </View>
            {renderTodayTip()}
          </View>

          {/* Nearby Trucks Map */}
          <View style={styles.trucksSection}>
            <View style={styles.sectionHeader}>
              <Icon name="local-shipping" size={24} color={COLORS.primary} />
              <CustomText style={styles.sectionTitle}>Nearby Trucks</CustomText>
            </View>
            {renderNearbyTrucksMap()}
          </View>

          {/* Today's Collection */}
          {todayCollections.length > 0 && (
            <View style={styles.scheduleSection}>
              <View style={styles.sectionHeader}>
                <Icon name="event" size={24} color={COLORS.primary} />
                <CustomText style={styles.sectionTitle}>
                  Today's Collection
                </CustomText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scheduleScrollContent}
              >
                {todayCollections.map((collection, index) =>
                  renderScheduleCard(collection, index)
                )}
              </ScrollView>
            </View>
          )}

          {/* CMC News */}
          <View style={styles.newsFeedSection}>
            <View style={styles.sectionHeader}>
              <Icon name="article" size={24} color={COLORS.primary} />
              <CustomText style={styles.sectionTitle}>CMC News</CustomText>
            </View>
            <NewsFeed key={newsKey} />
          </View>

          {/* Bottom space */}
          <View style={styles.bottomSpace} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  headerContainer: {
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === "ios" ? 0 : 20,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 50,
    marginTop: 20,
  },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  locationText: {
    fontSize: 14,
    color: COLORS.textGray,
    marginHorizontal: 8,
    fontWeight: "500",
  },
  profileButton: {
    padding: 8,
  },
  profileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  greetingContainer: {
    marginTop: 20,
  },
  greetingText: {
    fontSize: 16,
    color: COLORS.textGray,
    marginBottom: 4,
  },
  subGreetingText: {
    fontSize: 24,
    color: COLORS.primary,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 12,
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 20,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    marginRight: 10,
    fontSize: 16,
    color: COLORS.black,
    paddingVertical: 8,
  },
  searchResultsContainer: {
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    padding: 10,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: -10,
    marginBottom: 10,
    zIndex: 10,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary,
  },
  searchResultText: {
    fontSize: 16,
    color: COLORS.black,
    marginLeft: 12,
  },
  noResultsContainer: {
    alignItems: "center",
    padding: 20,
  },
  noResultsText: {
    color: COLORS.textGray,
    fontSize: 16,
    marginTop: 8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  statsSection: {
    marginTop: 15,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    paddingVertical: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
    marginLeft: 10,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    color: COLORS.textGray,
  },
  tipSection: {
    marginTop: 25,
    paddingHorizontal: 20,
  },
  tipCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    lineHeight: 20,
  },
  trucksSection: {
    marginTop: 25,
    paddingHorizontal: 20,
  },
  truckMapContainer: {
    borderRadius: 12,
    overflow: "hidden",
    height: 180,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 5,
  },
  truckMap: {
    ...StyleSheet.absoluteFillObject,
  },
  truckMapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  truckCountContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  truckCountText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.black,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  viewAllText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "500",
    marginRight: 4,
  },
  homeMarker: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  truckMarker: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  truckMapLoading: {
    height: 180,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: COLORS.textGray,
    marginTop: 8,
    fontSize: 14,
  },
  setLocationContainer: {
    height: 180,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  setLocationText: {
    color: COLORS.textGray,
    fontSize: 14,
    textAlign: "center",
    marginVertical: 12,
  },
  setLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 10,
  },
  setLocationButtonText: {
    color: COLORS.white,
    marginRight: 6,
    fontWeight: "500",
  },
  scheduleSection: {
    marginTop: 25,
    paddingHorizontal: 20,
  },
  scheduleScrollContent: {
    paddingRight: 20,
    paddingVertical: 5,
  },
  scheduleCard: {
    padding: 20,
    borderRadius: 15,
    marginRight: 15,
    width: 300,
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  scheduleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  wasteTypeText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  scheduleTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    padding: 8,
    borderRadius: 8,
  },
  timeText: {
    color: COLORS.white,
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "500",
  },
  frequencyContainer: {
    flexDirection: "row",
    alignItems: "center",
    opacity: 0.9,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  frequencyText: {
    color: COLORS.white,
    fontSize: 12,
    marginLeft: 6,
    fontWeight: "500",
  },
  newsFeedSection: {
    marginTop: 25,
    paddingHorizontal: 20,
  },
  bottomSpace: {
    height: 30,
  },
});
