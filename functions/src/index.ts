import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

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

    const urlObject = new URL(req.url, "https://deeplink");
    const linkPath = urlObject.pathname;

    // Fetch link document
    const deepLinkCollection = getFirestore().collection("_deep_link_settings_");
    const snapshotQuery = deepLinkCollection.where("path", "==", linkPath).limit(1);
    const linkSnapshot = await snapshotQuery.get();
    const linkFound = linkSnapshot.docs.length !== 0;
    // If not found, return 404
    if (!linkFound) {
      return res.status(404).send(getNotFoundResponse());
    }

    const deepLinkConfig = linkSnapshot.docs[0].data() as DeepLinkConfig;

    const manualId = urlObject.searchParams.get("manualId");

    if(manualId) {

      const manualsRef = getFirestore().collection("manuals").doc(manualId);
      const manual = await manualsRef.get();

      if(manual.exists) {

        const values = manual.data()?.values

        const title = values?.AT_TITLE?.value?.value || deepLinkConfig["og:title"];
        const description = values.AT_DESCRIPTION?.value?.value || deepLinkConfig["og:description"];

        const bigImageRef = toResizedImageRef("800x800", values?.AT_IMAGES_REFS?.values[0]?.value) || "";
        const fileRef = getStorage().bucket().file(bigImageRef); 

        try {

          const imageUrl = await getDownloadURL(fileRef);
          deepLinkConfig["og:image"] = imageUrl;

        } catch(error) {
          console.error("No image found");
        }

        deepLinkConfig["og:title"] = title;
        deepLinkConfig["og:description"] = description;
        
        const source = await getDeepLinkResponse(deepLinkConfig);

        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.status(200).send(source);
      }
    }

    return res.status(404).send(getNotFoundResponse());

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
    .replaceAll('{{thumbnail}}', thumbnail)
    .replaceAll('{{notFoundImage}}', notFoundImage)
    .replaceAll('{{backgroundImage}}', backgroundImage)
    .replaceAll('{{poweredImage}}', poweredImage);

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
    .replaceAll("{{title}}", title)
    .replaceAll("{{description}}", description)
    .replaceAll("{{androidBundleID}}", androidBundleID)
    .replaceAll("{{androidScheme}}", (androidScheme ?? false).toString())
    .replaceAll("{{redirectToStore}}", redirectToStore.toString())
    .replaceAll("{{redirectUrl}}", redirectUrl)
    .replaceAll("{{thumbnail}}", image)
    .replaceAll("{{statusImage}}", statusImage)
    .replaceAll("{{backgroundImage}}", backgroundImage)
    .replaceAll("{{poweredImage}}", poweredImage);

  return source;
}

const toResizedImageRef = (size: string, ref?: string) => {

  if(ref) {
      const dotIndex = ref.lastIndexOf('.');
      if (dotIndex === -1) {
          return undefined;
      }
  
      const nameWithoutExtension = ref.substring(0, dotIndex);
      const extension = ref.substring(dotIndex);
  
      return`${nameWithoutExtension}_${size}${extension}`;
  }

  return ref;
}