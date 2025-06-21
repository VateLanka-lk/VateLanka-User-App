import React from "react";
import { View, SafeAreaView, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { COLORS } from "../utils/Constants"; 
import CustomText from "../utils/CustomText"; 

const Donations = () => {
  const payHereForm = `
    <html>
      <body onload="document.forms[0].submit()">
        <form method="post" action="https://sandbox.payhere.lk/pay/checkout">
          <input type="hidden" name="merchant_id" value="1211149">
          <input type="hidden" name="return_url" value="https://yourapp.com/return">
          <input type="hidden" name="cancel_url" value="https://yourapp.com/cancel">
          <input type="hidden" name="notify_url" value="https://yourapp.com/notify">

          <input type="hidden" name="order_id" value="VateLanka1234">
          <input type="hidden" name="items" value="Donation">
          <input type="hidden" name="currency" value="LKR">
          <input type="hidden" name="amount" value="500.00">

          <input type="hidden" name="first_name" value="Nisal">
          <input type="hidden" name="last_name" value="Perera">
          <input type="hidden" name="email" value="nisal@email.com">
          <input type="hidden" name="phone" value="0771234567">
          <input type="hidden" name="address" value="123, Street, Colombo">
          <input type="hidden" name="city" value="Colombo">
          <input type="hidden" name="country" value="Sri Lanka">
        </form>
      </body>
    </html>
  `;
  const bankTransferForm = `
    <html>
      <body onload="document.forms[0].submit()">
        <form method="post" action="https://sandbox.payhere.lk/pay/checkout">
          <input type="hidden" name="merchant_id" value="1211149">
          <input type="hidden" name="return_url" value="https://yourapp.com/return">
          <input type="hidden" name="cancel_url" value="https://yourapp.com/cancel">
          <input type="hidden" name="notify_url" value="https://yourapp.com/notify">
          <input type="hidden" name="order_id" value="Donation2">
          <input type="hidden" name="items" value="Support Package">
          <input type="hidden" name="currency" value="LKR">
          <input type="hidden" name="amount" value="1000.00">
          <input type="hidden" name="first_name" value="Nisal">
          <input type="hidden" name="last_name" value="Perera">
          <input type="hidden" name="email" value="nisal@email.com">
          <input type="hidden" name="phone" value="0771234567">
          <input type="hidden" name="address" value="123, Street, Colombo">
          <input type="hidden" name="city" value="Colombo">
          <input type="hidden" name="country" value="Sri Lanka">
        </form>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <CustomText style={styles.heading}>Donations</CustomText>
        <CustomText style={styles.subtitle}>
          Donate to support our cause
        </CustomText>
      </View>
      <View style={styles.webViewContainer}>
        <WebView
          originWhitelist={['*']}
          source={{ html: payHereForm }}
          startInLoadingState
          renderLoading={() => <ActivityIndicator size="large" color={COLORS.primary} />}
        />
      </View>
    </SafeAreaView>
  );
};

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
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textGray,
  },
  webViewContainer: {
    flex: 1,
    padding: 10,
  },
});

export default Donations;
