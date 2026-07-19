import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neo4j driver and LangChain use Node.js APIs — ensure they run server-side only.
  serverExternalPackages: [
    "neo4j-driver",
    "@prisma/client",
    "@aws-sdk/client-s3",
    "sharp",
  ],
};

export default nextConfig;
