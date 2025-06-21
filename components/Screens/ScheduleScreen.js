import React, { useState, useEffect, useRef } from "react";
import {
  View,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Switch,
} from "react-native";
import { COLORS } from "../utils/Constants";
import CustomText from "../utils/CustomText";
import { auth } from "../utils/firebaseConfig";
import {
  fetchUserSchedules,
  fetchUserProfile,
} from "../services/firebaseFirestore";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import NotificationBanner from "../utils/NotificationBanner";
import {
  isNotificationsEnabled,
  setNotificationsEnabled,
  initializeNotifications,
  scheduleMorningReminders,
} from "../services/notificationService";

const CALENDAR_STRIP_HEIGHT = 90;

const WasteTypeColors = {
  Degradable: COLORS.DEGRADABLE_WASTE,
  Recyclable: COLORS.RECYCLABLE_WASTE,
  "Non Recyclable": COLORS.NON_RECYCLABLE_WASTE,
};

const WasteTypeIcons = {
  Degradable: "delete",
  Recyclable: "recycling",
  "Non Recyclable": "delete-forever",
};

const CalendarDay = ({ date, dayName, isSelected, collections, onPress }) => {
  const hasCollections = collections.length > 0;
  const dotColors = [
    ...new Set(collections.map((c) => WasteTypeColors[c.wasteType])),
  ];

  return (
    <TouchableOpacity
      style={[styles.calendarDay, isSelected && styles.selectedCalendarDay]}
      onPress={onPress}
    >
      <CustomText
        style={[
          styles.calendarDayName,
          isSelected && styles.selectedCalendarDayText,
        ]}
      >
        {dayName.slice(0, 3)}
      </CustomText>
      <CustomText
        style={[
          styles.calendarDayNumber,
          isSelected && styles.selectedCalendarDayText,
        ]}
      >
        {date.split(" ")[1]}
      </CustomText>
      <View style={styles.calendarDotContainer}>
        {hasCollections ? (
          dotColors.map((color, index) => (
            <View
              key={index}
              style={[styles.calendarDot, { backgroundColor: color }]}
            />
          ))
        ) : (
          <View style={styles.calendarDotPlaceholder} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const CollectionCard = ({ collection, style }) => {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View
        style={[
          styles.collectionItem,
          { backgroundColor: WasteTypeColors[collection.wasteType] },
        ]}
      >
        <View style={styles.collectionIconContainer}>
          <Icon
            name={WasteTypeIcons[collection.wasteType]}
            size={24}
            color={COLORS.white}
          />
        </View>
        <View style={styles.collectionContent}>
          <CustomText style={styles.collectionText}>
            {collection.wasteType}
          </CustomText>
          <View style={styles.collectionDetails}>
            {collection.timeSlot && (
              <View style={styles.timeSlotContainer}>
                <Icon name="access-time" size={14} color={COLORS.white} />
                <CustomText style={styles.timeSlotText}>
                  {`${collection.timeSlot.start} - ${collection.timeSlot.end}`}
                </CustomText>
              </View>
            )}
            {collection.frequency && (
              <View style={styles.frequencyContainer}>
                <Icon name="repeat" size={14} color={COLORS.white} />
                <CustomText style={styles.frequencyText}>
                  {collection.frequency}
                </CustomText>
              </View>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const UpcomingCollectionCard = ({ collection, date, dayName }) => {
  return (
    <View style={styles.upcomingCard}>
      <View
        style={[
          styles.upcomingColorStrip,
          { backgroundColor: WasteTypeColors[collection.wasteType] },
        ]}
      />
      <View style={styles.upcomingContent}>
        <View style={styles.upcomingHeader}>
          <View style={styles.upcomingDateContainer}>
            <Icon name="event" size={16} color={COLORS.textGray} />
            <CustomText style={styles.upcomingDate}>
              {`${dayName}, ${date}`}
            </CustomText>
          </View>
          <View style={styles.upcomingTypeContainer}>
            <Icon
              name={WasteTypeIcons[collection.wasteType]}
              size={16}
              color={WasteTypeColors[collection.wasteType]}
            />
            <CustomText
              style={[
                styles.upcomingType,
                { color: WasteTypeColors[collection.wasteType] },
              ]}
            >
              {collection.wasteType}
            </CustomText>
          </View>
        </View>
        <View style={styles.upcomingDetails}>
          {collection.timeSlot && (
            <View style={styles.upcomingDetailItem}>
              <Icon name="access-time" size={14} color={COLORS.textGray} />
              <CustomText style={styles.upcomingDetailText}>
                {`${collection.timeSlot.start} - ${collection.timeSlot.end}`}
              </CustomText>
            </View>
          )}
          {collection.frequency && (
            <View style={styles.upcomingDetailItem}>
              <Icon name="repeat" size={14} color={COLORS.textGray} />
              <CustomText style={styles.upcomingDetailText}>
                {collection.frequency}
              </CustomText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export function ScheduleScreen({ navigation }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [notificationsEnabled, setNotificationsToggle] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [locationMissing, setLocationMissing] = useState(false);
  const [notification, setNotification] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const scrollViewRef = useRef(null);

  const showNotification = (message, type = "error") => {
    setNotification({
      visible: true,
      message,
      type,
    });
  };

  const handleNotificationToggle = async (value) => {
    try {
      if (value) {
        const permissionGranted = await initializeNotifications();
        if (!permissionGranted) {
          showNotification("Please enable notifications in settings", "error");
          return;
        }
      }

      await setNotificationsEnabled(value);
      setNotificationsToggle(value);

      if (value) {
        showNotification("Collection notifications enabled", "success");

        const user = auth.currentUser;
        if (user) {
          await scheduleMorningReminders(user.uid);
        }
      } else {
        showNotification("Collection notifications disabled", "success");
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
      showNotification("Failed to update notification settings", "error");
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const enabled = await isNotificationsEnabled();
      setNotificationsToggle(enabled);
    } catch (error) {
      console.error("Error loading notification settings:", error);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadSchedules();
      loadNotificationSettings();
    }, [])
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadSchedules();
    await loadNotificationSettings();
    setRefreshing(false);
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      setLocationMissing(false);

      const user = auth.currentUser;
      if (!user) {
        throw new Error("Please sign in to view schedules");
      }

      const profile = await fetchUserProfile(user.uid);
      setUserProfile(profile);

      if (
        !profile.homeLocation ||
        !profile.ward ||
        !profile.district ||
        !profile.municipalCouncil
      ) {
        setLocationMissing(true);
        setLoading(false);
        return;
      }

      const scheduleData = await fetchUserSchedules(user.uid);
      const next7DaysSchedule = generateNext7DaysSchedule(scheduleData);
      setSchedules(next7DaysSchedule);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateNext7DaysSchedule = (scheduleData) => {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const next7Days = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayName = days[date.getDay()];
      const dateString = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const collections = scheduleData.filter(
        (schedule) => schedule.day === dayName || schedule.day === "All"
      );

      next7Days.push({
        date: dateString,
        dayName,
        dayLabel: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName,
        collections,
      });
    }

    return next7Days;
  };

  const getUpcomingCollections = () => {
    let upcoming = [];
    schedules.forEach((daySchedule, index) => {
      if (index > selectedDayIndex) {
        daySchedule.collections.forEach((collection) => {
          upcoming.push({
            ...collection,
            date: daySchedule.date,
            dayName: daySchedule.dayLabel,
          });
        });
      }
    });
    return upcoming;
  };

  const handleDayPress = (index) => {
    setSelectedDayIndex(index);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
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
        Please set your home location in your profile before viewing collection
        schedules
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <CustomText style={styles.heading}>Collection Schedule</CustomText>
          </View>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <CustomText style={styles.loadingText}>
            Loading schedule...
          </CustomText>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <CustomText style={styles.heading}>Collection Schedule</CustomText>
          </View>
        </View>
        <View style={styles.centered}>
          <Icon name="error-outline" size={48} color={COLORS.errorbanner} />
          <CustomText style={styles.errorText}>{error}</CustomText>
        </View>
      </SafeAreaView>
    );
  }

  const selectedDay = schedules[selectedDayIndex];
  const upcomingCollections = getUpcomingCollections();

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
          <CustomText style={styles.heading}>Collection Schedule</CustomText>
          {!locationMissing && (
            <View style={styles.notificationToggle}>
              <Icon
                name={
                  notificationsEnabled
                    ? "notifications-active"
                    : "notifications-off"
                }
                size={24}
                color={notificationsEnabled ? COLORS.primary : COLORS.textGray}
              />
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: COLORS.secondary, true: COLORS.primary }}
                thumbColor={COLORS.white}
                style={{ marginLeft: 8 }}
              />
            </View>
          )}
        </View>
        <CustomText style={styles.subtitle}>
          View your waste collection schedule
        </CustomText>
      </View>

      {locationMissing ? (
        <View style={styles.content}>{renderLocationMissingMessage()}</View>
      ) : (
        <>
          <View style={styles.calendarStrip}>
            {schedules.map((daySchedule, index) => (
              <CalendarDay
                key={daySchedule.date}
                date={daySchedule.date}
                dayName={daySchedule.dayLabel}
                isSelected={index === selectedDayIndex}
                collections={daySchedule.collections}
                onPress={() => handleDayPress(index)}
              />
            ))}
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
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
            {/* Selected Day's Collections */}
            <View style={styles.selectedDayHeader}>
              <CustomText style={styles.selectedDayText}>
                {selectedDay.dayLabel}
              </CustomText>
              <CustomText style={styles.selectedDateText}>
                {selectedDay.date}
              </CustomText>
            </View>
            <View style={styles.collectionsContainer}>
              {selectedDay.collections.length > 0 ? (
                selectedDay.collections.map((collection, index) => (
                  <CollectionCard
                    key={`${collection.wasteType}_${index}`}
                    collection={collection}
                    style={{ marginBottom: 12 }}
                  />
                ))
              ) : (
                <View style={styles.noCollectionContainer}>
                  <Icon name="event-busy" size={32} color={COLORS.textGray} />
                  <CustomText style={styles.noCollectionText}>
                    No collections scheduled
                  </CustomText>
                  <CustomText style={styles.noCollectionSubText}>
                    There are no waste collections scheduled for this day
                  </CustomText>
                </View>
              )}
            </View>

            {/* Upcoming Collections Section */}
            {upcomingCollections.length > 0 && (
              <View style={styles.upcomingSection}>
                <View style={styles.upcomingHeader}>
                  <Icon name="event-note" size={24} color={COLORS.primary} />
                  <CustomText style={styles.upcomingSectionTitle}>
                    Upcoming
                  </CustomText>
                </View>

                <View style={styles.upcomingList}>
                  {upcomingCollections.map((collection, index) => (
                    <UpcomingCollectionCard
                      key={`upcoming_${collection.wasteType}_${index}`}
                      collection={collection}
                      date={collection.date}
                      dayName={collection.dayName}
                    />
                  ))}
                </View>
              </View>
            )}
            <View style={styles.bottomSpace} />
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.errorbanner,
    textAlign: "center",
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.textGray,
    fontSize: 16,
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
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  calendarStrip: {
    height: CALENDAR_STRIP_HEIGHT,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary,
    marginTop: 15,
  },
  calendarDay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    marginHorizontal: 2,
    borderRadius: 12,
  },
  selectedCalendarDay: {
    backgroundColor: COLORS.primary,
  },
  calendarDayName: {
    fontSize: 14,
    color: COLORS.textGray,
    marginBottom: 4,
  },
  calendarDayNumber: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 4,
  },
  selectedCalendarDayText: {
    color: COLORS.white,
  },
  calendarDotContainer: {
    flexDirection: "row",
    justifyContent: "center",
    height: 6,
    gap: 4,
  },
  calendarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  calendarDotPlaceholder: {
    width: 6,
    height: 6,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.secondary,
  },
  selectedDayHeader: {
    padding: 20,
    backgroundColor: COLORS.white,
    marginBottom: 10,
  },
  selectedDayText: {
    fontSize: 24,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 4,
  },
  selectedDateText: {
    fontSize: 16,
    color: COLORS.textGray,
  },
  collectionsContainer: {
    padding: 15,
  },
  collectionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },
  collectionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  collectionContent: {
    flex: 1,
  },
  collectionText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  collectionDetails: {
    gap: 6,
  },
  timeSlotContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeSlotText: {
    color: COLORS.white,
    fontSize: 14,
    opacity: 0.9,
  },
  frequencyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  frequencyText: {
    color: COLORS.white,
    fontSize: 14,
    opacity: 0.9,
  },
  noCollectionContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 30,
    alignItems: "center",
    gap: 10,
  },
  noCollectionText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textGray,
  },
  noCollectionSubText: {
    fontSize: 14,
    color: COLORS.textGray,
    textAlign: "center",
    opacity: 0.8,
  },
  notificationToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 8,
    borderRadius: 20,
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    marginTop: 15,
    marginLeft:10,
  },
  upcomingSection: {
    padding: 20,
    backgroundColor: COLORS.white,
    marginTop: 20,
    borderRadius: 12,
    margin: 15,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  upcomingSectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.primary,
    marginLeft: 10,
  },
  upcomingList: {
    gap: 12,
  },
  upcomingCard: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  upcomingColorStrip: {
    width: 4,
  },
  upcomingContent: {
    flex: 1,
    padding: 12,
  },
  upcomingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  upcomingDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  upcomingDate: {
    fontSize: 14,
    color: COLORS.textGray,
    fontWeight: "500",
  },
  upcomingTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  upcomingType: {
    fontSize: 14,
    fontWeight: "600",
  },
  upcomingDetails: {
    gap: 6,
  },
  upcomingDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  upcomingDetailText: {
    fontSize: 13,
    color: COLORS.textGray,
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
  bottomSpace: {
    height: 20,
  },
});

export default ScheduleScreen;
