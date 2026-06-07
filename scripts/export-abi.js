/**
 * Copies compiled ABI + bytecode from Hardhat artifacts into both the frontend
 * and backend so they can interact with (and the admin UI can deploy) the
 * contracts. Run after `hardhat compile` (or use `npm run build`).
 */
const fs = require("fs");
const path = require("path");

// Only Voting is exported here. Registration is the external, already-deployed
// composite-DID registry; its read-only ABI is hand-maintained at
// frontend/src/contracts/DIDRegistry.json and backend/contracts/DIDRegistry.json.
const artifacts = [
  {
    name: "Voting",
    artifact: "artifacts/contracts/Voting.sol/Voting.json",
  },
];

const targets = [
  path.join(__dirname, "..", "frontend", "src", "contracts"),
  path.join(__dirname, "..", "backend", "contracts"),
];

for (const dir of targets) {
  fs.mkdirSync(dir, { recursive: true });
}

for (const { name, artifact } of artifacts) {
  const full = path.join(__dirname, "..", artifact);
  if (!fs.existsSync(full)) {
    console.error(`Missing artifact ${artifact}. Run "hardhat compile" first.`);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  const out = {
    contractName: name,
    abi: json.abi,
    bytecode: json.bytecode,
  };
  for (const dir of targets) {
    fs.writeFileSync(
      path.join(dir, `${name}.json`),
      JSON.stringify(out, null, 2)
    );
  }
  console.log(`Exported ${name} ABI + bytecode`);
}
