import { defineConfig, configVariable } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";

export default defineConfig({
  plugins: [hardhatEthers],

  solidity: {
    version: "0.8.31",

    settings: {
      evmVersion: "osaka",

      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  paths: {
    sources: "./app/contracts",
  },

  networks: {
    monadTestnet: {
      type: "http",
      url: "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: [configVariable("PRIVATE_KEY")],
    },

    monadMainnet: {
      type: "http",
      url: "https://rpc.monad.xyz",
      chainId: 143,
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});
