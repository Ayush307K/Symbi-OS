import { rebuildKnowledgeIndex } from "../server/rag/index";

rebuildKnowledgeIndex()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
