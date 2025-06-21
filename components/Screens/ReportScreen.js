import React, { useState, useEffect, useRef } from "react";
import {
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  StyleSheet,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { COLORS, ISSUE_TYPES } from "../utils/Constants";
import CustomText from "../utils/CustomText";
import Icon from "react-native-vector-icons/MaterialIcons";
import { auth, firestore } from "../utils/firebaseConfig";
import {
  createTicket,
  fetchUserProfile,
  getTodayScheduledWasteTypes,
} from "../services/firebaseFirestore";
import NotificationBanner from "../utils/NotificationBanner";
import TicketItem from "../utils/TicketItem";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export function ReportScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [locationMissing, setLocationMissing] = useState(false);
  const [notification, setNotification] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const [formData, setFormData] = useState({
    issueType: "Missed Collection",
    wasteType: "",
    notes: "",
  });
  const [wasteTypes, setWasteTypes] = useState([]);
  const [showWasteTypeModal, setShowWasteTypeModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showTicketDetailModal, setShowTicketDetailModal] = useState(false);
  const [ticketListenerUnsubscribe, setTicketListenerUnsubscribe] =
    useState(null);

  const scrollViewRef = useRef(null);

  const showNotification = (message, type = "error") => {
    setNotification({
      visible: true,
      message,
      type,
    });
  };

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
              (!userProfile?.district && updatedProfile?.district) ||
              (userProfile?.locationMissing && updatedProfile?.homeLocation)
            ) {
              console.log("Location was updated, reloading data");
              loadData(true);
            }
          }
        }
      };

      checkForUpdates();

      return () => {};
    }, [userProfile])
  );

  useEffect(() => {
    loadData();

    return () => {
      if (ticketListenerUnsubscribe) {
        ticketListenerUnsubscribe();
      }
    };
  }, []);

  const goToProfileScreen = () => {
    navigation.navigate("Profile");
  };

  const setupTicketListener = async (profile) => {
    if (ticketListenerUnsubscribe) {
      ticketListenerUnsubscribe();
    }

    try {
      const ticketsRef = collection(
        firestore,
        `municipalCouncils/${profile.municipalCouncil}/Districts/${profile.district}/Wards/${profile.ward}/tickets`
      );

      const q = query(ticketsRef, where("userId", "==", auth.currentUser.uid));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const ticketData = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate(),
              updatedAt: doc.data().updatedAt?.toDate(),
              resolvedAt: doc.data().resolvedAt?.toDate(),
            }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          setTickets(ticketData);
          setLoading(false);
          setRefreshing(false);
        },
        (error) => {
          console.error("Error in tickets listener:", error);
          setLoading(false);
          setRefreshing(false);
        }
      );

      setTicketListenerUnsubscribe(() => unsubscribe);
      return unsubscribe;
    } catch (error) {
      console.error("Error setting up ticket listener:", error);
      setLoading(false);
      setRefreshing(false);
      return null;
    }
  };

  const loadData = async (isReload = false) => {
    if (isReload) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLocationMissing(false);

    try {
      const user = auth.currentUser;
      if (!user) {
        showNotification("Please sign in to continue");
        setLoading(false);
        setRefreshing(false);
        return;
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
        setRefreshing(false);
        return;
      }

      if (!profile.phoneNumber) {
        setTimeout(() => {
          showNotification(
            "Please add your phone number in profile to enable reporting",
            "warning"
          );
        }, 500);
      }

      try {
        const todayWasteTypes = await getTodayScheduledWasteTypes(user.uid);
        setWasteTypes(todayWasteTypes);

        if (todayWasteTypes.length > 0) {
          setFormData((prev) => ({
            ...prev,
            wasteType: todayWasteTypes[0],
            issueType: "Missed Collection",
          }));
        }
      } catch (wasteTypeError) {
        console.error("Error loading waste types:", wasteTypeError);
        setWasteTypes([]);
      }

      await setupTicketListener(profile);
    } catch (error) {
      console.error("Error loading data:", error);
      showNotification("Failed to load data: " + error.message);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSubmit = async () => {
    const { wasteType, notes } = formData;

    if (!wasteType) {
      showNotification("Please select a waste type");
      return;
    }

    try {
      const user = auth.currentUser;
      const profile = await fetchUserProfile(user.uid);

      if (!profile.phoneNumber) {
        showNotification(
          "Please add your phone number in profile before submitting a ticket"
        );
        setTimeout(() => {
          navigation.navigate("Profile");
        }, 2000);
        return;
      }

      setSubmitting(true);

      await createTicket(user.uid, {
        issueType: "Missed Collection",
        wasteType,
        notes,
      });

      setFormData({
        issueType: "Missed Collection",
        wasteType: wasteTypes.length > 0 ? wasteTypes[0] : "",
        notes: "",
      });

      setCreateMode(false);
      showNotification("Ticket submitted successfully", "success");
      setSubmitting(false);
    } catch (error) {
      console.error("Error submitting ticket:", error);
      showNotification(error.message);
      setSubmitting(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
  };

  const handleTicketPress = (ticket) => {
    setSelectedTicket(ticket);
    setShowTicketDetailModal(true);
  };

  const renderPhoneNumberWarning = () => {
    if (userProfile && !userProfile.phoneNumber) {
      return (
        <TouchableOpacity
          style={styles.phoneWarningContainer}
          onPress={() => navigation.navigate("Profile")}
        >
          <Icon name="phone-missed" size={20} color="#FFA500" />
          <CustomText style={styles.phoneWarningText}>
            Add your phone number in profile to enable ticket submission
          </CustomText>
          <Icon name="arrow-forward" size={18} color="#FFA500" />
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderTicketDetailModal = () => {
    if (!selectedTicket) return null;

    const formatDate = (date) => {
      if (!date) return "N/A";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    };

    return (
      <Modal
        visible={showTicketDetailModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowTicketDetailModal(false);
          setSelectedTicket(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.ticketDetailContainer}>
            <View style={styles.ticketDetailHeader}>
              <View style={styles.ticketDetailTitleContainer}>
                <Icon name="receipt" size={24} color={COLORS.primary} />
                <CustomText style={styles.ticketDetailTitle}>
                  Ticket Details
                </CustomText>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowTicketDetailModal(false);
                  setSelectedTicket(null);
                }}
              >
                <Icon name="close" size={24} color={COLORS.textGray} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.ticketDetailContent}>
              <View style={styles.detailRow}>
                <CustomText style={styles.detailLabel}>Status</CustomText>
                <View
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor:
                        selectedTicket.status === "pending"
                          ? "#FFA500"
                          : selectedTicket.status === "assigned"
                          ? "#3498DB"
                          : selectedTicket.status === "resolved"
                          ? "#2ECC71"
                          : "#E74C3C",
                    },
                  ]}
                >
                  <CustomText style={styles.statusChipText}>
                    {selectedTicket.status === "pending"
                      ? "Pending"
                      : selectedTicket.status === "assigned"
                      ? "In Progress"
                      : selectedTicket.status === "resolved"
                      ? "Resolved"
                      : "Cancelled"}
                  </CustomText>
                </View>
              </View>

              <View style={styles.detailRow}>
                <CustomText style={styles.detailLabel}>Issue Type</CustomText>
                <CustomText style={styles.detailValue}>
                  {selectedTicket.issueType}
                </CustomText>
              </View>

              <View style={styles.detailRow}>
                <CustomText style={styles.detailLabel}>Waste Type</CustomText>
                <CustomText style={styles.detailValue}>
                  {selectedTicket.wasteType}
                </CustomText>
              </View>

              <View style={styles.detailRow}>
                <CustomText style={styles.detailLabel}>Submitted On</CustomText>
                <CustomText style={styles.detailValue}>
                  {formatDate(selectedTicket.createdAt)}
                </CustomText>
              </View>

              {selectedTicket.resolvedAt && (
                <View style={styles.detailRow}>
                  <CustomText style={styles.detailLabel}>
                    Resolved On
                  </CustomText>
                  <CustomText style={styles.detailValue}>
                    {formatDate(selectedTicket.resolvedAt)}
                  </CustomText>
                </View>
              )}

              {selectedTicket.notes && (
                <View style={styles.notesContainer}>
                  <CustomText style={styles.detailLabel}>Notes</CustomText>
                  <View style={styles.notesBox}>
                    <CustomText style={styles.notesText}>
                      {selectedTicket.notes}
                    </CustomText>
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => {
                setShowTicketDetailModal(false);
                setSelectedTicket(null);
              }}
            >
              <CustomText style={styles.closeModalButtonText}>Close</CustomText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderLocationMissingMessage = () => (
    <View style={styles.locationMissingContainer}>
      <Icon name="location-off" size={60} color={COLORS.errorbanner} />
      <CustomText style={styles.locationMissingTitle}>
        Location Not Set
      </CustomText>
      <CustomText style={styles.locationMissingText}>
        Please set your home location in your profile before reporting issues.
        This helps us direct your report to the right collection team.
      </CustomText>
      <TouchableOpacity
        style={styles.setLocationButton}
        onPress={goToProfileScreen}
      >
        <Icon name="edit-location" size={20} color={COLORS.white} />
        <CustomText style={styles.setLocationButtonText}>
          Set My Location
        </CustomText>
      </TouchableOpacity>
    </View>
  );

  const renderCreateTicketForm = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.createTicketContainer}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.createTicketContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeader}>
          <Icon name="report-problem" size={24} color={COLORS.primary} />
          <CustomText style={styles.formTitle}>Report an Issue</CustomText>
        </View>

        <View style={styles.formGroup}>
          <CustomText style={styles.label}>Issue Type</CustomText>
          <View style={styles.fixedSelection}>
            <Icon name="report-problem" size={20} color={COLORS.primary} />
            <CustomText style={styles.fixedSelectionText}>
              Missed Collection
            </CustomText>
          </View>
          <CustomText style={styles.helperText}>
            Currently, only missed collection reports are supported.
          </CustomText>
        </View>

        <View style={styles.formGroup}>
          <CustomText style={styles.label}>Waste Type *</CustomText>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowWasteTypeModal(true)}
          >
            <CustomText
              style={
                formData.wasteType
                  ? styles.dropdownTextSelected
                  : styles.dropdownText
              }
            >
              {formData.wasteType || "Select Waste Type"}
            </CustomText>
            <Icon name="arrow-drop-down" size={24} color={COLORS.textGray} />
          </TouchableOpacity>
        </View>

        <View style={styles.formGroup}>
          <CustomText style={styles.label}>Additional Notes</CustomText>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder="Describe the issue in detail (optional)"
            placeholderTextColor={COLORS.placeholderTextColor}
            value={formData.notes}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, notes: text }))
            }
          />
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setCreateMode(false)}
          >
            <Icon name="cancel" size={20} color={COLORS.textGray} />
            <CustomText style={styles.cancelButtonText}>Cancel</CustomText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Icon name="send" size={20} color={COLORS.white} />
                <CustomText style={styles.submitButtonText}>Submit</CustomText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderWasteTypeModal = () => (
    <Modal
      visible={showWasteTypeModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowWasteTypeModal(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowWasteTypeModal(false)}
      >
        <View style={styles.modalContent}>
          <CustomText style={styles.modalTitle}>Select Waste Type</CustomText>
          <ScrollView>
            {wasteTypes.length > 0 ? (
              wasteTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={styles.modalItem}
                  onPress={() => {
                    setFormData((prev) => ({ ...prev, wasteType: type }));
                    setShowWasteTypeModal(false);
                  }}
                >
                  <View style={styles.modalItemContent}>
                    <Icon
                      name={
                        type === "Degradable"
                          ? "delete-outline"
                          : type === "Recyclable"
                          ? "replay"
                          : "delete-forever"
                      }
                      size={20}
                      color={COLORS.textGray}
                    />
                    <CustomText style={styles.modalItemText}>{type}</CustomText>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.noWasteTypesContainer}>
                <Icon name="info" size={24} color={COLORS.textGray} />
                <CustomText style={styles.noWasteTypesText}>
                  No waste collection is scheduled for today
                </CustomText>
                <CustomText style={styles.noWasteTypesSubText}>
                  Please check your schedule for collection days
                </CustomText>
              </View>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <NotificationBanner
        {...notification}
        onHide={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <CustomText style={styles.heading}>Report Issue</CustomText>
          {!createMode && !locationMissing && !loading && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setCreateMode(true)}
            >
              <Icon name="add" size={24} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
        <CustomText style={styles.subtitle}>
          Report missed collections or other issues
        </CustomText>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <CustomText style={styles.loadingText}>Loading...</CustomText>
        </View>
      ) : locationMissing ? (
        renderLocationMissingMessage()
      ) : createMode ? (
        renderCreateTicketForm()
      ) : (
        <View style={styles.ticketListContainer}>
          {renderPhoneNumberWarning()}
          <FlatList
            data={tickets}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TicketItem ticket={item} onPress={handleTicketPress} />
            )}
            contentContainerStyle={styles.ticketList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.noTicketsContainer}>
                <Icon name="receipt-long" size={60} color={COLORS.textGray} />
                <CustomText style={styles.noTicketsText}>
                  No Reports Yet
                </CustomText>
                <CustomText style={styles.noTicketsSubText}>
                  Tap the + button to report a missed collection or other issue
                </CustomText>
                <TouchableOpacity
                  style={styles.createEmptyButton}
                  onPress={() => setCreateMode(true)}
                >
                  <Icon name="add" size={20} color={COLORS.white} />
                  <CustomText style={styles.createEmptyButtonText}>
                    Create New Report
                  </CustomText>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      )}

      {renderWasteTypeModal()}
      {renderTicketDetailModal()}
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
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    marginTop: 15,
  },
  heading: {
    fontSize: 28,
    fontWeight: "600",
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textGray,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 15,
  },
  phoneWarningContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 5,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#FFA500",
  },
  phoneWarningText: {
    flex: 1,
    color: "#996300",
    fontSize: 14,
    marginHorizontal: 8,
  },
  locationMissingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  createTicketContainer: {
    flex: 1,
    padding: 20,
  },
  createTicketContent: {
    paddingBottom: 20,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.primary,
    marginLeft: 10,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: COLORS.textGray,
    marginBottom: 8,
  },
  dropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 8,
    padding: 15,
    backgroundColor: COLORS.white,
  },
  dropdownText: {
    color: COLORS.placeholderTextColor,
    fontSize: 16,
  },
  dropdownTextSelected: {
    color: COLORS.black,
    fontSize: 16,
  },
  fixedSelection: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 8,
    padding: 15,
    backgroundColor: COLORS.secondary,
  },
  fixedSelectionText: {
    color: COLORS.black,
    fontSize: 16,
    marginLeft: 10,
    fontWeight: "500",
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textGray,
    marginTop: 4,
    fontStyle: "italic",
  },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 8,
    padding: 15,
    minHeight: 120,
    textAlignVertical: "top",
    fontSize: 16,
    color: COLORS.black,
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    padding: 15,
    flex: 1,
    marginRight: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.textGray,
    marginLeft: 6,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 15,
    flex: 1,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.white,
    marginLeft: 6,
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
  modalItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalItemText: {
    fontSize: 16,
    color: COLORS.black,
    marginLeft: 10,
  },
  noWasteTypesContainer: {
    padding: 20,
    alignItems: "center",
  },
  noWasteTypesText: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.textGray,
    marginTop: 10,
    textAlign: "center",
  },
  noWasteTypesSubText: {
    fontSize: 14,
    color: COLORS.textGray,
    marginTop: 5,
    textAlign: "center",
  },
  ticketListContainer: {
    flex: 1,
    backgroundColor: COLORS.secondary,
  },
  ticketList: {
    padding: 16,
    paddingBottom: 80,
  },
  noTicketsContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  noTicketsText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textGray,
    marginTop: 16,
    marginBottom: 8,
  },
  noTicketsSubText: {
    fontSize: 14,
    color: COLORS.textGray,
    textAlign: "center",
    marginBottom: 20,
  },
  createEmptyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    width: "80%",
  },
  createEmptyButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.white,
    marginLeft: 8,
  },
  ticketDetailContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
    alignSelf: "center",
  },
  ticketDetailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
    paddingBottom: 10,
  },
  ticketDetailTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  ticketDetailTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
    marginLeft: 10,
  },
  closeButton: {
    padding: 5,
  },
  ticketDetailContent: {
    maxHeight: "70%",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textGray,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusChipText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "600",
  },
  notesContainer: {
    marginTop: 15,
    marginBottom: 10,
  },
  notesBox: {
    backgroundColor: COLORS.secondary,
    padding: 15,
    borderRadius: 8,
    marginTop: 8,
  },
  notesText: {
    fontSize: 14,
    color: COLORS.textGray,
    lineHeight: 20,
  },
  closeModalButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 20,
  },
  closeModalButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "500",
  },
});

export default ReportScreen;
