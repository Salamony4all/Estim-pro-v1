import { Storage } from '@google-cloud/storage';

let storage: Storage;
let bucketName: string;

if (process.env.NODE_ENV === 'production') {
    // In production, App Hosting provides credentials and config via env variables
    if (!process.env.GCLOUD_PROJECT) {
        throw new Error("GCLOUD_PROJECT environment variable is not set.");
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS_CONTENT environment variable is not set.");
    }
     if (!process.env.GCS_BUCKET_NAME) {
        throw new Error("GCS_BUCKET_NAME environment variable is not set in production.");
    }

    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT);

    storage = new Storage({
        projectId: process.env.GCLOUD_PROJECT,
        credentials,
    });
    bucketName = process.env.GCS_BUCKET_NAME;

} else {
    // In local development, we use the .env file and local service account file
    if (!process.env.GCLOUD_PROJECT) {
        throw new Error("GCLOUD_PROJECT is not set in .env file for local development.");
    }
    if (!process.env.GCS_BUCKET_NAME) {
        throw new Error("GCS_BUCKET_NAME is not set in .env file for local development.");
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS_CONTENT is not set in .env file for local development.");
    }

    try {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT);
        storage = new Storage({
            projectId: process.env.GCLOUD_PROJECT,
            credentials,
        });
    } catch (error) {
        console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_CONTENT:", error);
        throw new Error("The GOOGLE_APPLICATION_CREDENTIALS_CONTENT environment variable is not a valid JSON string.");
    }
    
    bucketName = process.env.GCS_BUCKET_NAME;
}

const bucket = storage.bucket(bucketName);

export async function getSignedUrl(fileName: string, fileType: string) {
  const [url] = await bucket.file(fileName).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: fileType,
  });
  return url;
}

export function getPublicUrl(fileName: string) {
    return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}
