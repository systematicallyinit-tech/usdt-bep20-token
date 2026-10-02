import { network } from "hardhat";

const connection = await network.connect();

const { ethers } = connection;

console.log("");
console.log("====================================");
console.log("Demo USD Token Deployment");
console.log("====================================");
console.log("Network:", connection.networkName);
console.log("");

const [deployer] = await ethers.getSigners();

console.log("Deployer:", deployer.address);

const balance = await ethers.provider.getBalance(deployer.address);

console.log("MON balance:", ethers.formatEther(balance));

if (balance === 0n) {
  throw new Error("The deployer wallet has no MON.");
}

console.log("");
console.log("Deploying DemoUSDToken...");

const DemoUSDToken = await ethers.getContractFactory("DemoUSDToken");

const contract = await DemoUSDToken.deploy();

await contract.waitForDeployment();

const contractAddress = await contract.getAddress();

console.log("");
console.log("====================================");
console.log("DEPLOYMENT COMPLETE");
console.log("====================================");
console.log("Contract:", contractAddress);
console.log("");

console.log("Name:", await contract.name());
console.log("Symbol:", await contract.symbol());
console.log("Decimals:", await contract.decimals());

console.log(
  "Total supply:",
  ethers.formatUnits(await contract.totalSupply(), 18),
);

console.log("Owner:", await contract.owner());

console.log(
  "Remaining mintable:",
  ethers.formatUnits(
    await contract.remainingMintableSupply(),
    18,
  ),
);

console.log("====================================");
