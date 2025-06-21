import React, { useState, useRef } from "react";
import {
  View,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  ImageBackground,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { COLORS } from "../utils/Constants";
import CustomText from "../utils/CustomText";
import Icon from "react-native-vector-icons/MaterialIcons";

const { width, height } = Dimensions.get("window");
const CARD_WIDTH = width * 0.85;
const CARD_HEIGHT = height * 0.7;
const SPACING = width * 0.05;

const wasteTypes = [
  {
    id: "degradable",
    title: "Degradable Waste",
    icon: "delete",
    color: COLORS.DEGRADABLE_WASTE,
    image:
      "https://images.unsplash.com/photo-1536703219213-0223580c76b2?q=80&w=1471&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    description:
      "Biodegradable waste naturally decomposes through biological processes, returning nutrients to the earth.",
    examples: [
      "Food scraps and leftovers",
      "Fruit and vegetable waste",
      "Garden waste (leaves, grass)",
      "Paper products",
      "Coffee grounds and tea bags",
    ],
    tips: [
      "Use a composting bin",
      "Keep waste dry when possible",
      "Mix with brown materials",
      "Avoid meat in home compost",
      "Turn compost regularly",
    ],
    timeToDegrade: "4-6 weeks under proper conditions",
  },
  {
    id: "recyclable",
    title: "Recyclable Waste",
    icon: "recycling",
    color: COLORS.RECYCLABLE_WASTE,
    image:
      "https://images.unsplash.com/photo-1562077981-4d7eafd44932?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    description:
      "Materials that can be processed and reused, helping conserve natural resources and reduce landfill waste.",
    examples: [
      "Paper and cardboard",
      "Glass bottles and jars",
      "Plastic containers (PET, HDPE)",
      "Metal cans and aluminum",
      "Clean food packaging",
    ],
    tips: [
      "Rinse containers before recycling",
      "Remove non-recyclable parts",
      "Don't bag recyclables",
      "Check local guidelines",
      "Flatten cardboard boxes",
    ],
    impact: "Reduces landfill waste by 30-40%",
  },
  {
    id: "non-recyclable",
    title: "Non-Recyclable",
    icon: "delete-forever",
    color: COLORS.NON_RECYCLABLE_WASTE,
    image:
      "https://images.unsplash.com/photo-1523293915678-d126868e96f1?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    description:
      "Waste that cannot be recycled or composted, requiring special disposal methods to minimize environmental impact.",
    examples: [
      "Styrofoam packaging",
      "Certain plastics (Type 3-7)",
      "Contaminated materials",
      "Mixed material packaging",
      "Certain electronic waste",
    ],
    tips: [
      "Minimize usage",
      "Seek alternatives",
      "Proper disposal methods",
      "Keep separate from recyclables",
      "Check local guidelines",
    ],
    environmental_impact: "Can take 500+ years to decompose",
  },
];

const PaginationDot = ({ active }) => {
  return (
    <View
      style={[
        styles.dot,
        {
          backgroundColor: active ? COLORS.primary : COLORS.borderGray,
          width: active ? 20 : 8,
        },
      ]}
    />
  );
};

const InfoSection = ({ title, items }) => (
  <View style={styles.infoSection}>
    <CustomText style={styles.infoTitle}>{title}</CustomText>
    {items.map((item, index) => (
      <View key={index} style={styles.infoItem}>
        <Icon name="check-circle" size={16} color={COLORS.primary} />
        <CustomText style={styles.infoText}>{item}</CustomText>
      </View>
    ))}
  </View>
);

const WasteCard = ({ item, index }) => {
  const [imageLoading, setImageLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const onImageLoad = () => {
    setImageLoading(false);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[styles.cardContainer, { marginLeft: index === 0 ? SPACING : 0 }]}
    >
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          <ImageBackground
            source={{ uri: item.image }}
            style={styles.cardImage}
            onLoad={onImageLoad}
          >
            {imageLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            )}
            <Animated.View
              style={[
                styles.overlay,
                {
                  backgroundColor: `${item.color}CC`,
                  opacity: fadeAnim,
                },
              ]}
            />
            <View style={styles.cardHeader}>
              <View style={styles.iconContainer}>
                <Icon name={item.icon} size={32} color={COLORS.white} />
              </View>
              <CustomText style={styles.cardTitle}>{item.title}</CustomText>
            </View>
          </ImageBackground>
        </View>

        <ScrollView
          style={styles.cardContent}
          showsVerticalScrollIndicator={false}
        >
          <CustomText style={styles.description}>{item.description}</CustomText>

          <InfoSection title="Common Examples" items={item.examples} />
          <InfoSection title="Disposal Tips" items={item.tips} />

          <View style={styles.impactSection}>
            <Icon name="info" size={20} color={COLORS.primary} />
            <CustomText style={styles.impactText}>
              {item.timeToDegrade || item.impact || item.environmental_impact}
            </CustomText>
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
};

export function RecycleScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef(null);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems[0]) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100,
  }).current;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <CustomText style={styles.heading}>Waste Guide</CustomText>
          <CustomText style={styles.subtitle}>
            Learn proper waste management
          </CustomText>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={wasteTypes}
        renderItem={({ item, index }) => (
          <WasteCard item={item} index={index} />
        )}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + SPACING}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={styles.flatListContent}
      />

      <View style={styles.pagination}>
        {wasteTypes.map((_, index) => (
          <PaginationDot key={index} active={index === activeIndex} />
        ))}
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
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 10,
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
  flatListContent: {
    paddingRight: SPACING,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginRight: SPACING,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    overflow: "hidden",
    elevation: 5,
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  imageContainer: {
    height: CARD_HEIGHT * 0.3,
  },
  cardImage: {
    flex: 1,
    resizeMode: "cover",
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.secondary,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  cardHeader: {
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: COLORS.white,
  },
  cardContent: {
    flex: 1,
    padding: 20,
  },
  description: {
    fontSize: 16,
    color: COLORS.black,
    lineHeight: 24,
    marginBottom: 20,
  },
  infoSection: {
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 10,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingRight: 10,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textGray,
    marginLeft: 10,
    flex: 1,
  },
  impactSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.secondary,
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  impactText: {
    fontSize: 14,
    color: COLORS.primary,
    marginLeft: 10,
    flex: 1,
    fontWeight: "500",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});
