PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WasteMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "toxicityLevel" TEXT NOT NULL,
    "baseElement" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "embeddingJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_WasteMaterial" (
    "id", "name", "toxicityLevel", "baseElement", "category",
    "description", "embeddingJson", "createdAt", "updatedAt"
)
SELECT
    "id", "name", "toxicityLevel", "baseElement", "category",
    "description", "embeddingJson", "createdAt", "updatedAt"
FROM "WasteMaterial";

DROP TABLE "WasteMaterial";
ALTER TABLE "new_WasteMaterial" RENAME TO "WasteMaterial";
CREATE UNIQUE INDEX "WasteMaterial_name_key" ON "WasteMaterial"("name");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
