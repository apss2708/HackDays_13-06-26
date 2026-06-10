import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const Factory = await ethers.getContractFactory("GovernanceFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("GovernanceFactory deployed to:", factoryAddress);

  // Write addresses to shared JSON so the API/frontend can read them
  const addresses = {
    GovernanceFactory: factoryAddress,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
  };

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("Addresses written to packages/contracts/deployments/addresses.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
