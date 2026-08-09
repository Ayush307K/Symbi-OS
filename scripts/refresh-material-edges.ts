import "dotenv/config";
import prisma from "@/lib/prisma";
import { refreshMaterialEdges } from "@/server/feed/material-edges";

refreshMaterialEdges()
  .then((counts) => console.log("[MaterialEdges] refresh complete", counts))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
