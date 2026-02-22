import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neo4j driver and LangChain use Node.js APIs — ensure they run server-side only.
  serverExternalPackages: ["neo4j-driver", "@prisma/client"],
};

export default nextConfig;
