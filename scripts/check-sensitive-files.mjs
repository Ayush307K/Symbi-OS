import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const MAX_SCANNED_FILE_BYTES = 2 * 1024 * 1024;
const checkHistory = process.argv.includes("--history");

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const forbiddenPathPatterns = [
  {
    pattern: /(^|\/)\.env(?:\..+)?$/i,
    message: "environment file",
    allow: (path) => path === ".env.example",
  },
  {
    pattern: /\.(?:db|sqlite|sqlite3)(?:-journal|-shm|-wal)?$/i,
    message: "database file",
  },
  {
    pattern: /(^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*\.pem|.*\.p12|.*\.pfx)$/i,
    message: "private key or certificate bundle",
  },
  {
    pattern:
      /(^|\/)(?:service[-_]?account|credentials|secrets?)(?:\.[^/]+)?\.(?:json|ya?ml)$/i,
    message: "credential bundle",
  },
];

const secretPatterns = [
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    message: "private key",
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    message: "AWS access key",
  },
  {
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    message: "Google API key",
  },
  {
    pattern: /\bgh[pousr]_[0-9A-Za-z]{30,}\b/,
    message: "GitHub token",
  },
  {
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
    message: "Slack token",
  },
  {
    pattern: /\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}\b/,
    message: "OpenAI API key",
  },
  {
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^/\s@]+@/i,
    message: "database URL containing credentials",
  },
];

const findings = [];

for (const path of repositoryFiles) {
  for (const rule of forbiddenPathPatterns) {
    if (rule.pattern.test(path) && !rule.allow?.(path)) {
      findings.push(`${path}: committable ${rule.message}`);
    }
  }

  let content;
  try {
    const buffer = readFileSync(path);
    if (
      buffer.length > MAX_SCANNED_FILE_BYTES ||
      buffer.subarray(0, 8_192).includes(0)
    ) {
      continue;
    }
    content = buffer.toString("utf8");
  } catch {
    continue;
  }

  for (const rule of secretPatterns) {
    if (rule.pattern.test(content)) {
      findings.push(`${path}: possible ${rule.message}`);
    }
  }

  if (basename(path).startsWith(".env")) {
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*["']?([^"'#\s]+)["']?/,
      );
      if (!match) continue;

      const value = match[1];
      const isDocumentedPlaceholder =
        /^(?:replace-|your-|example|sample|dummy|test|changeme|sk-\.\.\.|<|\$\{)/i.test(
          value,
        );

      if (value.length >= 12 && !isDocumentedPlaceholder) {
        findings.push(`${path}: non-placeholder secret-like environment value`);
      }
    }
  }
}

if (checkHistory) {
  const historicalPaths = execFileSync(
    "git",
    ["rev-list", "--objects", "--all"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .map((line) => line.match(/^[0-9a-f]+\s+(.+)$/i)?.[1])
    .filter(Boolean);

  for (const path of historicalPaths) {
    for (const rule of forbiddenPathPatterns) {
      if (rule.pattern.test(path) && !rule.allow?.(path)) {
        findings.push(`${path}: historical ${rule.message}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Sensitive-file scan failed:");
  for (const finding of [...new Set(findings)]) {
    console.error(`- ${finding}`);
  }
  console.error(
    "Remove the file/value from Git and rotate any exposed credential before retrying.",
  );
  process.exit(1);
}

console.log(
  `Sensitive-file scan passed (${repositoryFiles.length} repository files checked${checkHistory ? ", including Git history paths" : ""}).`,
);
