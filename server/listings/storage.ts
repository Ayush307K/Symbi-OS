import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredObject {
  body: Buffer;
  contentType?: string;
}

type StorageConfig =
  | { provider: "local"; root: string }
  | { provider: "s3"; bucket: string; client: S3Client };

let cachedConfig: StorageConfig | undefined;
let localStorageRootForTests: string | undefined;

function storageConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig;

  const provider = process.env.OBJECT_STORAGE_PROVIDER?.toLowerCase() || "local";
  if (provider === "s3") {
    const bucket = process.env.OBJECT_STORAGE_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new Error(
        "OBJECT_STORAGE_BUCKET and S3_REGION are required for S3 storage.",
      );
    }
    cachedConfig = {
      provider: "s3",
      bucket,
      client: new S3Client({
        region,
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials:
          process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      }),
    };
    return cachedConfig;
  }

  if (provider !== "local") {
    throw new Error(`Unsupported OBJECT_STORAGE_PROVIDER: ${provider}`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Production listing uploads require OBJECT_STORAGE_PROVIDER=s3.",
    );
  }
  cachedConfig = {
    provider: "local",
    root:
      localStorageRootForTests ??
      resolve(/* turbopackIgnore: true */ ".data", "listing-uploads"),
  };
  return cachedConfig;
}

function localPath(root: string, key: string) {
  const target = resolve(/* turbopackIgnore: true */ root, key);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid storage key.");
  }
  return target;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
) {
  const config = storageConfig();
  if (config.provider === "s3") {
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "private, max-age=31536000, immutable",
      }),
    );
    return;
  }
  const path = localPath(config.root, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { mode: 0o600 });
}

export async function getObject(key: string): Promise<StoredObject> {
  const config = storageConfig();
  if (config.provider === "s3") {
    const result = await config.client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("Stored object has no body.");
    return {
      body: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType,
    };
  }
  return {
    body: await readFile(
      /* turbopackIgnore: true */ localPath(config.root, key),
    ),
  };
}

export async function deleteObject(key: string) {
  const config = storageConfig();
  if (config.provider === "s3") {
    await config.client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return;
  }
  await unlink(localPath(config.root, key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export function resetStorageConfigForTests() {
  cachedConfig = undefined;
  localStorageRootForTests = undefined;
}

export function setLocalStorageRootForTests(root: string) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("A test storage root can only be configured in test mode.");
  }
  cachedConfig = undefined;
  localStorageRootForTests = root;
}
