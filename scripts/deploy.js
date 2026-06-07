/**
 * Deploys Voting, pointed at the live composite-DID registry on Sepolia.
 * Registration is external (the DID app), so this no longer deploys a
 * Registration contract.
 * Usage:
 *   npm run deploy:local     (after `npm run node` in another terminal)
 *   npm run deploy:sepolia   (requires SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY in .env)
 *   DID_REGISTRY=0x... npm run deploy:sepolia   (override the registry address)
 *
 * Writes the resulting addresses to shared/deployment.json so the backend and
 * frontend can pick them up. (The admin UI can also deploy from the browser
 * with MetaMask — this script is the CLI alternative.)
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Live composite-DID registry on Sepolia. Voting.isRegistered checks reach
// this contract's on-chain hashtable to decide who may vote.
const DID_REGISTRY =
  process.env.DID_REGISTRY || "0xb1768B404EB4102CCF4DBc0c9b661a17D48dcef8";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Network:", hre.network.name);

  const registrationAddress = DID_REGISTRY;
  console.log("Using DID registry (registration):", registrationAddress);

  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy(registrationAddress);
  await voting.waitForDeployment();
  const votingAddress = await voting.getAddress();
  console.log("Voting deployed to:", votingAddress);

  const deployment = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    registrationAddress,
    votingAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "shared");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "deployment.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("Wrote shared/deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
