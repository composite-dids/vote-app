/**
 * Deploys Registration, then Voting (pointing at Registration).
 * Usage:
 *   npm run deploy:local     (after `npm run node` in another terminal)
 *   npm run deploy:sepolia   (requires SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY in .env)
 *
 * Writes the resulting addresses to shared/deployment.json so the backend and
 * frontend can pick them up. (The admin UI can also deploy from the browser
 * with MetaMask — this script is the CLI alternative.)
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Network:", hre.network.name);

  const Registration = await hre.ethers.getContractFactory("Registration");
  const registration = await Registration.deploy();
  await registration.waitForDeployment();
  const registrationAddress = await registration.getAddress();
  console.log("Registration deployed to:", registrationAddress);

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
