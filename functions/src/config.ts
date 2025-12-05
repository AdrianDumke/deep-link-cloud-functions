export interface Config {
  androidBundleID: string;
  androidScheme: string;
  androidHostname: string;
  region: string;
}

const config: Config = {
  androidBundleID: process.env.ANDROID_BUNDLE_ID || "",
  androidScheme: process.env.ANDROID_SCHEME || "",
  androidHostname: process.env.ANDROID_HOST_NAME || "",
  region: process.env.REGION || "europe-west3"
};

export default config;
