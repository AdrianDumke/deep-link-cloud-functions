import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from 'firebase-admin';

import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';

import DeepLinkConfig from './types';
import config from './config';

const {androidBundleID, androidScheme, androidHostname, region} = config;

// Initialize Express app
const app = express();
// Initialize Firebase Admin SDK
admin.initializeApp();

// Set up Firebase Cloud Functions
export const api = onRequest({ region: region }, app);

// Error-handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Error:", err);
    res.status(500).send("Internal Server Error");
  },
);

// Handle all other routes
app.get("*", async (req, res, next) => {

  try {
    // Get Firestore instance
    const collection = getFirestore().collection("_deep_link_settings_");
    // Parse link data
    const urlObject = new URL(req.url, "https://deeplink");
    const linkPath = urlObject.pathname;
    // Fetch link document
    const snapshotQuery = collection.where("path", "==", linkPath).limit(1);
    const linkSnapshot = await snapshotQuery.get();
    const linkFound = linkSnapshot.docs.length !== 0;
    // If not found, return 404
    if (!linkFound) {
      return res.status(404).send(getNotFoundResponse());
    }

    const deepLinkConfig = linkSnapshot.docs[0].data() as DeepLinkConfig;
    const source = await getDeepLinkResponse(deepLinkConfig);
    res.setHeader("Cache-Control", "no-cache");

    return res.status(200).send(source);

  } catch (error) {
    console.error("Error processing deep link: ", error);
    return res.status(500).send("Internal Server Error");
  }
});

function getNotFoundResponse(): string {

  // Gather metadata
  const thumbnail = `https://${androidHostname}/images/404-thumb.jpg`;
  const notFoundImage = `https://${androidHostname}/images/not-found.svg`;
  const poweredImage = `https://${androidHostname}/images/powered.svg`;
  const backgroundImage = `https://${androidHostname}/images/background.png`;

  const templatePath = join(__dirname, './html/404.html');
  const source = readFileSync(templatePath, { encoding: "utf-8" })
    .replace('{{thumbnail}}', thumbnail)
    .replace('{{notFoundImage}}', notFoundImage)
    .replace('{{backgroundImage}}', backgroundImage)
    .replace('{{poweredImage}}', poweredImage);

  return source;
}

async function getDeepLinkResponse(deepLinkConfig: DeepLinkConfig): Promise<string> {

  // Gather metadata
  let title = deepLinkConfig["og:title"] || "";
  let description = deepLinkConfig["og:description"] || "";
  let image = deepLinkConfig["og:image"] || "";

  const redirectToStore = deepLinkConfig.redirectToStore || false;
  const redirectUrl = deepLinkConfig.redirectUrl || '';
  const expires = deepLinkConfig.expires;

  if (expires && expires.toMillis() < Date.now()) {
    return '';
  }

  const statusImage = `https://${androidHostname}/images/status.svg`;
  const poweredImage = `https://${androidHostname}/images/powered.svg`;
  const backgroundImage = `https://${androidHostname}/images/background.png`;

  const templatePath = join(__dirname, "./html/index.html");
  const source = readFileSync(templatePath, { encoding: 'utf-8' })
    .replace("{{title}}", title)
    .replace("{{description}}", description)
    .replace("{{androidBundleID}}", androidBundleID)
    .replace("{{androidScheme}}", (androidScheme ?? false).toString())
    .replace("{{redirectToStore}}", redirectToStore.toString())
    .replace("{{redirectUrl}}", redirectUrl)
    .replace("{{thumbnail}}", image)
    .replace("{{statusImage}}", statusImage)
    .replace("{{backgroundImage}}", backgroundImage)
    .replace("{{poweredImage}}", poweredImage);

  return source;
}