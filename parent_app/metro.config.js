
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

try {
  // Attempt to load NativeWind
  const { withNativeWind } = require("nativewind/metro");
  module.exports = withNativeWind(config, { input: "./global.css" });
} catch (error) {
  console.error(" NativeWind Failed to Load:", error.message);
  console.warn(" Falling back to default Expo config. Tailwind styles will not work.");
  module.exports = config;
}