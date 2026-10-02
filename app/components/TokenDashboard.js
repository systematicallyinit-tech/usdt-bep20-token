"use client";

import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";

const TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_TOKEN_ADDRESS;

const MONAD_TESTNET = {
  chainId: "0x279f",
  chainName: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: [
    "https://testnet-rpc.monad.xyz",
  ],
  blockExplorerUrls: [
    "https://testnet.monadscan.com",
  ],
};

const MONAD_MAINNET = {
  chainId: "0x8f",
  chainName: "Monad Mainnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: [
    process.env.NEXT_PUBLIC_MONAD_RPC ||
      "https://rpc1.monad.xyz",
  ],
  blockExplorerUrls: [
    process.env.NEXT_PUBLIC_MONAD_EXPLORER ||
      "https://monadscan.com",
  ],
};

const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function remainingMintableSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
];

export default function TokenDashboard() {
  const [account, setAccount] = useState("");
  const [token, setToken] = useState(null);

  const [walletType, setWalletType] = useState("");

  const [tokenName, setTokenName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(18);
  const [totalSupply, setTotalSupply] = useState("0");
  const [balance, setBalance] = useState("0");
  const [remainingMintable, setRemainingMintable] =
    useState("0");
  const [owner, setOwner] = useState("");

  const [recipient, setRecipient] = useState("");
  const [transferAmount, setTransferAmount] =
    useState("");

  const [mintRecipient, setMintRecipient] =
    useState("");

  const [mintAmount, setMintAmount] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /*
   * Keep the currently connected EIP-1193 provider.
   */
  const providerRef = useRef(null);

  /*
   * Keep the current ethers BrowserProvider.
   */
  const browserProviderRef = useRef(null);

  /*
   * Keep event cleanup functions.
   */
  const cleanupWalletListenersRef = useRef(null);

  /*
   * EIP-6963 providers discovered in the browser.
   */
  const discoveredProvidersRef = useRef(
    new Map()
  );

  /*
   * Get the configured Monad network.
   */
  function getMonadNetwork() {
    const chainId =
      process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ||
      "143";

    if (String(chainId) === "143") {
      return MONAD_MAINNET;
    }

    return MONAD_TESTNET;
  }

  /*
   * ---------------------------------------------------------
   * EIP-6963 WALLET DISCOVERY
   * ---------------------------------------------------------
   *
   * Trust Wallet recommends EIP-6963 for provider discovery.
   *
   * Trust Wallet RDNS:
   * com.trustwallet.app
   *
   * MetaMask RDNS:
   * io.metamask
   */
  function initializeWalletDiscovery() {
    if (typeof window === "undefined") {
      return () => {};
    }

    const handleAnnounceProvider = (event) => {
      try {
        const detail = event?.detail;

        if (!detail) return;

        const { info, provider } = detail;

        if (!info || !provider) return;

        if (!info.uuid) return;

        discoveredProvidersRef.current.set(
          info.uuid,
          {
            info,
            provider,
          }
        );
      } catch (err) {
        console.error(
          "EIP-6963 provider discovery error:",
          err
        );
      }
    };

    window.addEventListener(
      "eip6963:announceProvider",
      handleAnnounceProvider
    );

    /*
     * Ask all installed wallets to announce themselves.
     */
    window.dispatchEvent(
      new Event("eip6963:requestProvider")
    );

    return () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handleAnnounceProvider
      );
    };
  }

  /*
   * Find Trust Wallet using EIP-6963.
   */
  function getTrustWalletProvider() {
    /*
     * First check EIP-6963.
     */
    for (const entry of discoveredProvidersRef.current.values()) {
      if (
        entry?.info?.rdns ===
        "com.trustwallet.app"
      ) {
        return entry.provider;
      }
    }

    /*
     * Legacy fallback.
     *
     * Some Trust Wallet versions may still expose
     * their provider through window.ethereum.
     */
    if (
      typeof window !== "undefined" &&
      window.ethereum
    ) {
      const providers =
        Array.isArray(
          window.ethereum.providers
        )
          ? window.ethereum.providers
          : [window.ethereum];

      const trustProvider =
        providers.find(
          (provider) =>
            provider?.isTrustWallet ||
            provider?.isTrust
        );

      if (trustProvider) {
        return trustProvider;
      }
    }

    return null;
  }

  /*
   * Find MetaMask using EIP-6963.
   */
  function getMetaMaskProvider() {
    /*
     * First check EIP-6963.
     */
    for (const entry of discoveredProvidersRef.current.values()) {
      if (
        entry?.info?.rdns ===
        "io.metamask"
      ) {
        return entry.provider;
      }
    }

    /*
     * Legacy fallback.
     */
    if (
      typeof window !== "undefined" &&
      window.ethereum
    ) {
      const providers =
        Array.isArray(
          window.ethereum.providers
        )
          ? window.ethereum.providers
          : [window.ethereum];

      const metaMaskProvider =
        providers.find(
          (provider) =>
            provider?.isMetaMask &&
            !provider?.isTrustWallet
        );

      if (metaMaskProvider) {
        return metaMaskProvider;
      }
    }

    return null;
  }

  /*
   * ---------------------------------------------------------
   * NETWORK
   * ---------------------------------------------------------
   */

  async function switchToMonad(provider) {
    if (!provider) {
      throw new Error(
        "Wallet provider was not found."
      );
    }

    const network = getMonadNetwork();

    try {
      await provider.request({
        method:
          "wallet_switchEthereumChain",
        params: [
          {
            chainId: network.chainId,
          },
        ],
      });
    } catch (switchError) {
      /*
       * 4902 = network isn't currently added.
       */
      if (
        switchError?.code === 4902 ||
        switchError?.code === -32603
      ) {
        await provider.request({
          method:
            "wallet_addEthereumChain",
          params: [network],
        });

        /*
         * Some wallets require a second explicit
         * switch after adding a network.
         */
        try {
          await provider.request({
            method:
              "wallet_switchEthereumChain",
            params: [
              {
                chainId: network.chainId,
              },
            ],
          });
        } catch (secondSwitchError) {
          /*
           * Ignore if the wallet already switched.
           */
          console.warn(
            "Second network switch:",
            secondSwitchError
          );
        }
      } else {
        throw switchError;
      }
    }
  }

  /*
   * ---------------------------------------------------------
   * WALLET CONNECTION
   * ---------------------------------------------------------
   */

  async function connectWithProvider(
    provider,
    type
  ) {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      if (!provider) {
        if (type === "MetaMask") {
          throw new Error(
            "MetaMask was not detected. Please install MetaMask or open this page in the MetaMask browser."
          );
        }

        if (type === "Trust Wallet") {
          throw new Error(
            "Trust Wallet was not detected. Please install the Trust Wallet extension or open this website inside the Trust Wallet browser."
          );
        }

        throw new Error(
          "No compatible wallet was detected."
        );
      }

      providerRef.current = provider;

      /*
       * Switch to Monad first.
       */
      await switchToMonad(provider);

      /*
       * Request account access.
       */
      const accounts =
        await provider.request({
          method: "eth_requestAccounts",
        });

      if (
        !accounts ||
        !accounts.length
      ) {
        throw new Error(
          "No wallet account was returned."
        );
      }

      /*
       * Create ethers provider.
       */
      const browserProvider =
        new ethers.BrowserProvider(
          provider
        );

      browserProviderRef.current =
        browserProvider;

      const signer =
        await browserProvider.getSigner();

      const address =
        await signer.getAddress();

      setAccount(address);
      setWalletType(type);

      /*
       * Validate token contract.
       */
      if (!TOKEN_ADDRESS) {
        throw new Error(
          "NEXT_PUBLIC_TOKEN_ADDRESS is not configured."
        );
      }

      if (
        !ethers.isAddress(TOKEN_ADDRESS)
      ) {
        throw new Error(
          "The configured token contract address is invalid."
        );
      }

      /*
       * Connect to token.
       */
      const contract =
        new ethers.Contract(
          TOKEN_ADDRESS,
          TOKEN_ABI,
          signer
        );

      setToken(contract);

      await loadTokenData(
        contract,
        address
      );

      /*
       * Listen for wallet changes.
       */
      setupWalletListeners(
        provider,
        contract
      );

      setMessage(
        `${type} connected successfully.`
      );
    } catch (err) {
      console.error(
        `${type} connection error:`,
        err
      );

      setError(
        err?.shortMessage ||
          err?.reason ||
          err?.message ||
          `Unable to connect ${type}.`
      );
    } finally {
      setLoading(false);
    }
  }

  async function connectMetaMask() {
    /*
     * Give EIP-6963 announcements a short moment
     * to arrive after the user clicks.
     */
    window.dispatchEvent(
      new Event("eip6963:requestProvider")
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 300)
    );

    const provider =
      getMetaMaskProvider();

    await connectWithProvider(
      provider,
      "MetaMask"
    );
  }

  async function connectTrustWallet() {
    /*
     * Request wallet announcements again.
     *
     * This is important when the extension wasn't
     * available when the page initially loaded.
     */
    window.dispatchEvent(
      new Event("eip6963:requestProvider")
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 500)
    );

    const provider =
      getTrustWalletProvider();

    await connectWithProvider(
      provider,
      "Trust Wallet"
    );
  }

  /*
   * ---------------------------------------------------------
   * WALLET EVENTS
   * ---------------------------------------------------------
   */

  function setupWalletListeners(
    provider,
    contract
  ) {
    /*
     * Remove listeners from previous wallet.
     */
    if (
      cleanupWalletListenersRef.current
    ) {
      cleanupWalletListenersRef.current();
      cleanupWalletListenersRef.current =
        null;
    }

    if (
      !provider ||
      typeof provider.on !== "function"
    ) {
      return;
    }

    const handleAccountsChanged =
      async (accounts) => {
        if (
          !accounts ||
          !accounts.length
        ) {
          setAccount("");
          setToken(null);
          setWalletType("");
          setOwner("");
          setBalance("0");
          return;
        }

        const newAddress =
          accounts[0];

        setAccount(newAddress);

        try {
          await loadTokenData(
            contract,
            newAddress
          );
        } catch (err) {
          console.error(err);
        }
      };

    const handleChainChanged =
      async (chainId) => {
        console.log(
          "Wallet network changed:",
          chainId
        );

        /*
         * Reloading keeps ethers and the
         * contract signer synchronized.
         */
        window.location.reload();
      };

    provider.on(
      "accountsChanged",
      handleAccountsChanged
    );

    provider.on(
      "chainChanged",
      handleChainChanged
    );

    cleanupWalletListenersRef.current =
      () => {
        try {
          provider.removeListener(
            "accountsChanged",
            handleAccountsChanged
          );

          provider.removeListener(
            "chainChanged",
            handleChainChanged
          );
        } catch (err) {
          console.warn(
            "Wallet listener cleanup error:",
            err
          );
        }
      };
  }

  /*
   * ---------------------------------------------------------
   * TOKEN DATA
   * ---------------------------------------------------------
   */

  async function loadTokenData(
    contract,
    address
  ) {
    try {
      const [
        name,
        tokenSymbol,
        tokenDecimals,
        supply,
        walletBalance,
        contractOwner,
        remaining,
      ] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
        contract.balanceOf(address),
        contract.owner(),
        contract.remainingMintableSupply(),
      ]);

      setTokenName(name);
      setSymbol(tokenSymbol);
      setDecimals(
        Number(tokenDecimals)
      );

      setTotalSupply(
        ethers.formatUnits(
          supply,
          tokenDecimals
        )
      );

      setBalance(
        ethers.formatUnits(
          walletBalance,
          tokenDecimals
        )
      );

      setOwner(contractOwner);

      setRemainingMintable(
        ethers.formatUnits(
          remaining,
          tokenDecimals
        )
      );
    } catch (err) {
      console.error(
        "Unable to load token data:",
        err
      );

      setError(
        err?.shortMessage ||
          err?.reason ||
          err?.message ||
          "Unable to load token data."
      );
    }
  }

  async function refreshBalance() {
    if (!token || !account) {
      return;
    }

    await loadTokenData(
      token,
      account
    );
  }

  /*
   * ---------------------------------------------------------
   * TRANSFER
   * ---------------------------------------------------------
   */

  async function transferTokens(e) {
    e.preventDefault();

    try {
      setError("");
      setMessage("");

      if (!token) {
        throw new Error(
          "Connect your wallet first."
        );
      }

      if (
        !ethers.isAddress(recipient)
      ) {
        throw new Error(
          "Enter a valid recipient address."
        );
      }

      if (
        !transferAmount ||
        Number(transferAmount) <= 0
      ) {
        throw new Error(
          "Enter a valid transfer amount."
        );
      }

      /*
       * Prevent accidentally sending to
       * the token contract itself.
       */
      if (
        recipient.toLowerCase() ===
        TOKEN_ADDRESS?.toLowerCase()
      ) {
        throw new Error(
          "The recipient cannot be the token contract address."
        );
      }

      setLoading(true);

      const amount =
        ethers.parseUnits(
          transferAmount,
          decimals
        );

      const transaction =
        await token.transfer(
          recipient,
          amount
        );

      setMessage(
        "Transfer submitted. Waiting for confirmation..."
      );

      await transaction.wait();

      setMessage(
        "Transfer completed successfully."
      );

      setRecipient("");
      setTransferAmount("");

      await refreshBalance();
    } catch (err) {
      console.error(
        "Transfer error:",
        err
      );

      setError(
        err?.shortMessage ||
          err?.reason ||
          err?.message ||
          "Transfer failed."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * MINT
   * ---------------------------------------------------------
   *
   * Your Solidity contract accepts a whole-token amount
   * and internally multiplies it by 10 ** decimals().
   *
   * Example:
   *
   * mint(recipient, 1000)
   *
   * creates:
   *
   * 1,000 DUSD
   *
   * because the contract performs:
   *
   * 1000 * 10 ** 18
   */

  async function mintTokens(e) {
    e.preventDefault();

    try {
      setError("");
      setMessage("");

      if (!token) {
        throw new Error(
          "Connect your wallet first."
        );
      }

      if (
        !ethers.isAddress(
          mintRecipient
        )
      ) {
        throw new Error(
          "Enter a valid recipient address."
        );
      }

      if (
        !mintAmount ||
        Number(mintAmount) <= 0
      ) {
        throw new Error(
          "Enter a valid mint amount."
        );
      }

      if (
        !account ||
        !owner ||
        account.toLowerCase() !==
          owner.toLowerCase()
      ) {
        throw new Error(
          "Only the token owner can mint."
        );
      }

      /*
       * Prevent minting directly to the
       * token contract.
       */
      if (
        mintRecipient.toLowerCase() ===
        TOKEN_ADDRESS?.toLowerCase()
      ) {
        throw new Error(
          "The mint recipient cannot be the token contract address."
        );
      }

      setLoading(true);

      /*
       * IMPORTANT:
       *
       * Do NOT use parseUnits here.
       *
       * Your Solidity contract itself multiplies
       * the supplied amount by 10 ** decimals().
       */
      const transaction =
        await token.mint(
          mintRecipient,
          mintAmount
        );

      setMessage(
        "Mint transaction submitted. Waiting for confirmation..."
      );

      await transaction.wait();

      setMessage(
        "Tokens minted successfully."
      );

      setMintRecipient("");
      setMintAmount("");

      await refreshBalance();
    } catch (err) {
      console.error(
        "Mint error:",
        err
      );

      setError(
        err?.shortMessage ||
          err?.reason ||
          err?.message ||
          "Mint failed."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * INITIAL WALLET DISCOVERY
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (
      typeof window === "undefined"
    ) {
      return;
    }

    const cleanup =
      initializeWalletDiscovery();

    /*
     * Ask installed wallets again after
     * the listener has been registered.
     */
    window.dispatchEvent(
      new Event(
        "eip6963:requestProvider"
      )
    );

    return () => {
      cleanup();

      if (
        cleanupWalletListenersRef.current
      ) {
        cleanupWalletListenersRef.current();

        cleanupWalletListenersRef.current =
          null;
      }
    };
  }, []);

  const isOwner =
    account &&
    owner &&
    account.toLowerCase() ===
      owner.toLowerCase();

  const network =
    getMonadNetwork();

  const isMainnet =
    network.chainId === "0x8f";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <div className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">

          <div>
            <div className="mb-3 flex flex-wrap gap-2">

              <Link
                href="/"
                className="inline-flex rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-300"
              >
                MONAD
              </Link>

              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  isMainnet
                    ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border border-yellow-400/20 bg-yellow-400/10 text-yellow-300"
                }`}
              >
                {isMainnet
                  ? "MAINNET"
                  : "TESTNET"}
              </span>

              {walletType && (
                <span className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-300">
                  {walletType}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              {tokenName ||
                "Token Dashboard"}
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              ERC-20 token dashboard
            </p>
          </div>

          {/* WALLET BUTTONS */}
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">

            <button
              type="button"
              onClick={connectMetaMask}
              disabled={loading}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {walletType ===
                "MetaMask" &&
              account
                ? `${account.slice(
                    0,
                    6
                  )}...${account.slice(
                    -4
                  )}`
                : "Connect MetaMask"}
            </button>

            <button
              type="button"
              onClick={connectTrustWallet}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {walletType ===
                "Trust Wallet" &&
              account
                ? `${account.slice(
                    0,
                    6
                  )}...${account.slice(
                    -4
                  )}`
                : "Connect Trust Wallet"}
            </button>
          </div>
        </div>

        {/* STATUS */}
        {message && (
          <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* TOKEN STATS */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Wallet Balance
            </p>

            <p className="mt-3 text-2xl font-bold">
              {balance} {symbol}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Total Supply
            </p>

            <p className="mt-3 text-2xl font-bold">
              {totalSupply}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Mintable Remaining
            </p>

            <p className="mt-3 text-2xl font-bold">
              {remainingMintable}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Decimals
            </p>

            <p className="mt-3 text-2xl font-bold">
              {decimals}
            </p>
          </div>
        </div>

        {/* TRANSFER + MINT */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* TRANSFER */}
          <form
            onSubmit={transferTokens}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >
            <h2 className="text-xl font-bold">
              Transfer{" "}
              {symbol || "Token"}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Send tokens to another Monad
              wallet.
            </p>

            <div className="mt-6 space-y-4">

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Recipient address
                </label>

                <input
                  value={recipient}
                  onChange={(e) =>
                    setRecipient(
                      e.target.value.trim()
                    )
                  }
                  placeholder="0x..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={transferAmount}
                  onChange={(e) =>
                    setTransferAmount(
                      e.target.value
                    )
                  }
                  placeholder="100"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-violet-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Processing..."
                  : `Send ${
                      symbol || "Token"
                    }`}
              </button>
            </div>
          </form>

          {/* MINT */}
          <form
            onSubmit={mintTokens}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >
            <div className="flex items-center justify-between gap-4">

              <div>
                <h2 className="text-xl font-bold">
                  Mint{" "}
                  {symbol || "Token"}
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Owner-only token
                  creation.
                </p>
              </div>

              {isOwner && (
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  OWNER
                </span>
              )}
            </div>

            <div className="mt-6 space-y-4">

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Recipient address
                </label>

                <input
                  value={mintRecipient}
                  onChange={(e) =>
                    setMintRecipient(
                      e.target.value.trim()
                    )
                  }
                  placeholder="0x..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={mintAmount}
                  onChange={(e) =>
                    setMintAmount(
                      e.target.value
                    )
                  }
                  placeholder="1000"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-violet-500"
                />
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !isOwner
                }
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isOwner
                  ? loading
                    ? "Processing..."
                    : "Mint Tokens"
                  : "Owner Only"}
              </button>
            </div>
          </form>
        </div>

        {/* CONTRACT INFORMATION */}
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">

          <h2 className="text-lg font-bold">
            Contract Information
          </h2>

          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">

            <div>
              <p className="text-slate-500">
                Network
              </p>

              <p className="mt-1 text-slate-300">
                {network.chainName}
              </p>
            </div>

            <div>
              <p className="text-slate-500">
                Chain ID
              </p>

              <p className="mt-1 text-slate-300">
                {isMainnet
                  ? "143"
                  : "10143"}
              </p>
            </div>

            <div>
              <p className="text-slate-500">
                Contract
              </p>

              <p className="mt-1 break-all text-slate-300">
                {TOKEN_ADDRESS ||
                  "Not configured"}
              </p>
            </div>

            <div>
              <p className="text-slate-500">
                Owner
              </p>

              <p className="mt-1 break-all text-slate-300">
                {owner ||
                  "Not loaded"}
              </p>
            </div>
          </div>

          {TOKEN_ADDRESS && (
            <a
              href={`${
                isMainnet
                  ? "https://monadscan.com"
                  : "https://testnet.monadscan.com"
              }/address/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex text-sm font-semibold text-violet-400 hover:text-violet-300"
            >
              View contract on
              MonadScan →
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
