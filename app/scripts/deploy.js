import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const networkName = process.argv[2] || "testnet";

const networks = {
  testnet: {
    name: "Monad Testnet",
    rpc: "https://testnet-rpc.monad.xyz",
    chainId: 10143,
    explorer: "https://testnet.monadscan.com",
  },

  mainnet: {
    name: "Monad Mainnet",
    rpc: "https://rpc1.monad.xyz",
    chainId: 143,
    explorer: "https://monadscan.com",
  },
};

const network = networks[networkName];

if (!network) {
  throw new Error("Invalid network. Use testnet or mainnet.");
}

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is missing from .env.local");
}

async function main() {
  console.log("");
  console.log("====================================");
  console.log("Demo USD Token Deployment");
  console.log("====================================");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId);
  console.log("");

  const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId);

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);

  console.log("MON balance:", ethers.formatEther(balance));

  if (balance === 0n) {
    throw new Error("The deployer wallet has no MON.");
  }

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "DemoUSDToken.sol",
    "DemoUSDToken.json",
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error("Contract artifact not found. Run npm run compile first.");
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );

  console.log("");
  console.log("Deploying contract...");

  const contract = await factory.deploy();

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log("");
  console.log("====================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("====================================");
  console.log("Contract:", contractAddress);
  console.log("Explorer:", `${network.explorer}/address/${contractAddress}`);
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
    ethers.formatUnits(await contract.remainingMintableSupply(), 18),
  );

  console.log("====================================");
}

main().catch((error) => {
  console.error("");
  console.error("DEPLOYMENT FAILED");
  console.error(error);
  process.exitCode = 1;
});
