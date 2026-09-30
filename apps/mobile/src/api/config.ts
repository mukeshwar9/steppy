import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveApiUrl } from "../lib/apiUrl";

export const API_URL: string = resolveApiUrl({
  env: process.env.EXPO_PUBLIC_API_URL,
  extra: Constants.expoConfig?.extra,
  os: Platform.OS
});
