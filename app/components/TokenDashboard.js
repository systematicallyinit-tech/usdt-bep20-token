"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";

/*
  DUSD / Demo USD Token

  Monad Mainnet:
    Chain ID: 143
    Contract:
    0x3D3243C68b7f60758414EF16992B69Ab1E442Cd5

  IMPORTANT:
  - Transfer amounts use parseUnits(amount, decimals).
  - This contract's mint() expects a WHOLE TOKEN amount and
    multiplies it by 10 ** decimals() internally.
*/

const TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_TOKEN_ADDRESS ||
  "0x3D3243C68b7f60758414EF16992B69Ab1E442Cd5";

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

function getConfiguredNetwork() {
  const configured =
    process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || "143";

  return String(configured) === "10143"
    ? MONAD_TESTNET
    : MONAD_MAINNET;
}

function friendlyWalletError(error, walletName) {
  const code = error?.code;

  if (code === 4001) {
    return `${walletName} request was rejected.`;
  }

  if (
    error?.message
      ?.toLowerCase()
      .includes("broadcast channel unavailable")
  ) {
    return (
      "Trust Wallet reported “Broadcast channel unavailable”. " +
      "The dashboard reached the Trust Wallet provider, but the wallet extension " +
      "could not complete its browser communication. Update/restart the Trust Wallet " +
      "extension and try again. This is not a DUSD contract error."
    );
  }

  return (
    error?.shortMessage ||
    error?.reason ||
    error?.message ||
    `Unable to connect ${walletName}.`
  );
}

export default function TokenDashboard() {
  const [account, setAccount] = useState("");
  const [walletType, setWalletType] = useState("");
  const [token, setToken] = useState(null);
  const [walletProvider, setWalletProvider] = useState(null);

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
  const [connectingWallet, setConnectingWallet] =
    useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const providersRef = useRef(new Map());
  const selectedProviderRef = useRef(null);

  const network = useMemo(
    () => getConfiguredNetwork(),
    []
  );

  const isMainnet =
    network.chainId === "0x8f";

  /*
    EIP-6963 wallet discovery.

    Trust Wallet:
      com.trustwallet.app

    MetaMask:
      io.metamask
  */

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const announceProvider = (event) => {
      const detail = event?.detail;

      if (
        !detail?.info?.uuid ||
        !detail?.provider
      ) {
        return;
      }

      providersRef.current.set(
        detail.info.uuid,
        detail
      );
    };

    window.addEventListener(
      "eip6963:announceProvider",
      announceProvider
    );

    window.dispatchEvent(
      new Event("eip6963:requestProvider")
    );

    const timer = setTimeout(() => {
      window.dispatchEvent(
        new Event("eip6963:requestProvider")
      );
    }, 500);

    return () => {
      clearTimeout(timer);

      window.removeEventListener(
        "eip6963:announceProvider",
        announceProvider
      );
    };
  }, []);

  const getDiscoveredProvider = useCallback(
    (rdns) => {
      for (
        const entry of providersRef.current.values()
      ) {
        if (
          entry?.info?.rdns === rdns &&
          entry?.provider
        ) {
          return entry.provider;
        }
      }

      return null;
    },
    []
  );

  /*
    META MASK
  */

  const getMetaMaskProvider = useCallback(
    () => {
      const eip6963Provider =
        getDiscoveredProvider(
          "io.metamask"
        );

      if (eip6963Provider) {
        return eip6963Provider;
      }

      if (
        typeof window !== "undefined" &&
        window.ethereum?.isMetaMask
      ) {
        return window.ethereum;
      }

      return null;
    },
    [getDiscoveredProvider]
  );

  /*
    TRUST WALLET
  */

  const getTrustWalletProvider =
    useCallback(() => {
      const eip6963Provider =
        getDiscoveredProvider(
          "com.trustwallet.app"
        );

      if (eip6963Provider) {
        return eip6963Provider;
      }

      /*
        Legacy Trust Wallet fallback.
      */

      if (
        typeof window !== "undefined" &&
        window.trustwallet?.ethereum
      ) {
        return window.trustwallet.ethereum;
      }

      /*
        Additional legacy fallback.
      */

      if (
        typeof window !== "undefined" &&
        Array.isArray(
          window.ethereum?.providers
        )
      ) {
        const trust =
          window.ethereum.providers.find(
            (provider) =>
              provider?.isTrustWallet ||
              provider?.isTrust
          );

        if (trust) {
          return trust;
        }
      }

      return null;
    }, [getDiscoveredProvider]);

  /*
    SWITCH TO MONAD
  */

  const switchToMonad = useCallback(
    async (provider) => {
      if (!provider) {
        throw new Error(
          "Wallet provider was not found."
        );
      }

      try {
        await provider.request({
          method:
            "wallet_switchEthereumChain",

          params: [
            {
              chainId:
                network.chainId,
            },
          ],
        });
      } catch (switchError) {
        const code = switchError?.code;

        /*
          Wallet doesn't know Monad yet.
        */

        if (code === 4902) {
          await provider.request({
            method:
              "wallet_addEthereumChain",

            params: [network],
          });

          await provider.request({
            method:
              "wallet_switchEthereumChain",

            params: [
              {
                chainId:
                  network.chainId,
              },
            ],
          });

          return;
        }

        throw switchError;
      }
    },
    [network]
  );

  /*
    LOAD TOKEN DATA
  */

  const loadTokenData = useCallback(
    async (contract, address) => {
      if (!contract || !address) {
        return;
      }

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

        const decimalsNumber =
          Number(tokenDecimals);

        setTokenName(name);

        setSymbol(tokenSymbol);

        setDecimals(
          decimalsNumber
        );

        setTotalSupply(
          ethers.formatUnits(
            supply,
            decimalsNumber
          )
        );

        setBalance(
          ethers.formatUnits(
            walletBalance,
            decimalsNumber
          )
        );

        setOwner(contractOwner);

        setRemainingMintable(
          ethers.formatUnits(
            remaining,
            decimalsNumber
          )
        );
      } catch (err) {
        console.error(
          "Token data error:",
          err
        );

        setError(
          err?.shortMessage ||
          err?.message ||
          "Unable to load token data."
        );
      }
    },
    []
  );

  /*
    WALLET LISTENERS
  */

  const attachProviderListeners =
    useCallback(
      (provider) => {
        if (!provider?.on) {
          return;
        }

        const handleAccountsChanged =
          async (accounts) => {
            if (!accounts?.length) {
              setAccount("");
              setWalletType("");
              setToken(null);
              setWalletProvider(null);
              setOwner("");
              setBalance("0");

              return;
            }

            const nextAddress =
              accounts[0];

            setAccount(
              nextAddress
            );

            if (token) {
              await loadTokenData(
                token,
                nextAddress
              );
            }
          };

        const handleChainChanged =
          () => {
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

        selectedProviderRef.current =
          provider;

        return () => {
          try {
            provider.removeListener?.(
              "accountsChanged",
              handleAccountsChanged
            );

            provider.removeListener?.(
              "chainChanged",
              handleChainChanged
            );
          } catch (cleanupError) {
            console.warn(
              "Wallet listener cleanup failed:",
              cleanupError
            );
          }
        };
      },
      [loadTokenData, token]
    );

  /*
    GENERIC WALLET CONNECTION
  */

  const connectWithProvider =
    useCallback(
      async (
        provider,
        type
      ) => {
        try {
          setConnectingWallet(type);

          setError("");

          setMessage("");

          if (!provider) {
            throw new Error(
              `${type} was not detected. Make sure the ${type} extension is installed and enabled.`
            );
          }

          console.log(
            `[TokenDashboard] ${type} provider:`,
            provider
          );

          /*
            Request accounts FIRST.

            This avoids requesting the network
            before the wallet has established
            the dApp connection.
          */

          const accounts =
            await provider.request({
              method:
                "eth_requestAccounts",
            });

          if (
            !accounts ||
            accounts.length === 0
          ) {
            throw new Error(
              `${type} returned no wallet accounts.`
            );
          }

          /*
            Switch to Monad.
          */

          await switchToMonad(
            provider
          );

          const browserProvider =
            new ethers.BrowserProvider(
              provider
            );

          const signer =
            await browserProvider.getSigner();

          const address =
            await signer.getAddress();

          if (
            !ethers.isAddress(
              address
            )
          ) {
            throw new Error(
              "The wallet returned an invalid address."
            );
          }

          if (
            !TOKEN_ADDRESS ||
            !ethers.isAddress(
              TOKEN_ADDRESS
            )
          ) {
            throw new Error(
              "The DUSD token contract address is invalid or missing."
            );
          }

          const contract =
            new ethers.Contract(
              TOKEN_ADDRESS,
              TOKEN_ABI,
              signer
            );

          setAccount(address);

          setWalletType(type);

          setWalletProvider(
            provider
          );

          setToken(contract);

          selectedProviderRef.current =
            provider;

          attachProviderListeners(
            provider
          );

          await loadTokenData(
            contract,
            address
          );

          setMessage(
            `${type} connected successfully on ${network.chainName}.`
          );
        } catch (err) {
          console.error(
            `${type} connection error:`,
            err
          );

          setError(
            friendlyWalletError(
              err,
              type
            )
          );
        } finally {
          setConnectingWallet("");
        }
      },
      [
        attachProviderListeners,
        loadTokenData,
        network.chainName,
        switchToMonad,
      ]
    );

  /*
    CONNECT METAMASK
  */

  const connectMetaMask =
    useCallback(
      async () => {
        setError("");

        setMessage("");

        if (
          typeof window !==
          "undefined"
        ) {
          window.dispatchEvent(
            new Event(
              "eip6963:requestProvider"
            )
          );
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500
            )
        );

        const provider =
          getMetaMaskProvider();

        await connectWithProvider(
          provider,
          "MetaMask"
        );
      },
      [
        connectWithProvider,
        getMetaMaskProvider,
      ]
    );

  /*
    CONNECT TRUST WALLET
  */

  const connectTrustWallet =
    useCallback(
      async () => {
        setError("");

        setMessage("");

        if (
          typeof window !==
          "undefined"
        ) {
          window.dispatchEvent(
            new Event(
              "eip6963:requestProvider"
            )
          );
        }

        /*
          Trust Wallet can announce
          slightly later than MetaMask.
        */

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              900
            )
        );

        const provider =
          getTrustWalletProvider();

        if (!provider) {
          setError(
            "Trust Wallet was not detected. Make sure the Trust Wallet browser extension is installed, enabled, and unlocked, then refresh this page."
          );

          return;
        }

        console.log(
          "[TokenDashboard] Trust Wallet provider detected:",
          provider
        );

        await connectWithProvider(
          provider,
          "Trust Wallet"
        );
      },
      [
        connectWithProvider,
        getTrustWalletProvider,
      ]
    );

  /*
    REFRESH TOKEN DATA
  */

  const refreshBalance =
    useCallback(
      async () => {
        if (
          !token ||
          !account
        ) {
          return;
        }

        await loadTokenData(
          token,
          account
        );
      },
      [
        account,
        loadTokenData,
        token,
      ]
    );

  /*
    TRANSFER DUSD
  */

  async function transferTokens(
    event
  ) {
    event.preventDefault();

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
          recipient
        )
      ) {
        throw new Error(
          "Enter a valid recipient address."
        );
      }

      if (
        recipient.toLowerCase() ===
        TOKEN_ADDRESS.toLowerCase()
      ) {
        throw new Error(
          "Do not send tokens to the DUSD contract address."
        );
      }

      if (
        !transferAmount ||
        Number(
          transferAmount
        ) <= 0
      ) {
        throw new Error(
          "Enter a valid transfer amount."
        );
      }

      /*
        Transfer uses token decimals.
      */

      const amount =
        ethers.parseUnits(
          transferAmount,
          decimals
        );

      if (amount <= 0n) {
        throw new Error(
          "Transfer amount must be greater than zero."
        );
      }

      setLoading(true);

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
        `Transfer completed successfully. Transaction: ${transaction.hash}`
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
    MINT DUSD

    IMPORTANT:
    Your Solidity contract does:

      amountWithDecimals =
          amount * 10 ** decimals();

    Therefore:

      mint("1000")

    means:

      1,000 DUSD

    DO NOT use parseUnits()
    for the mint function.
  */

  async function mintTokens(
    event
  ) {
    event.preventDefault();

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
          "Enter a valid mint recipient address."
        );
      }

      if (
        mintRecipient.toLowerCase() ===
        TOKEN_ADDRESS.toLowerCase()
      ) {
        throw new Error(
          "Do not mint tokens directly to the DUSD contract address."
        );
      }

      if (
        !mintAmount ||
        Number(
          mintAmount
        ) <= 0
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

      const wholeTokenAmount =
        mintAmount.trim();

      setLoading(true);

      const transaction =
        await token.mint(
          mintRecipient,
          wholeTokenAmount
        );

      setMessage(
        "Mint transaction submitted. Waiting for confirmation..."
      );

      await transaction.wait();

      setMessage(
        `Tokens minted successfully. Transaction: ${transaction.hash}`
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
    CLEANUP
  */

  useEffect(() => {
    return () => {
      try {
        selectedProviderRef.current?.removeListener?.(
          "accountsChanged"
        );

        selectedProviderRef.current?.removeListener?.(
          "chainChanged"
        );
      } catch {
        // Ignore wallet cleanup errors.
      }
    };
  }, []);

  /*
    OWNER CHECK
  */

  const isOwner =
    Boolean(
      account &&
      owner &&
      account.toLowerCase() ===
        owner.toLowerCase()
    );

  const shortAccount =
    account
      ? `${account.slice(
          0,
          6
        )}...${account.slice(
          -4
        )}`
      : "";

  const shortOwner =
    owner
      ? `${owner.slice(
          0,
          6
        )}...${owner.slice(
          -4
        )}`
      : "Not loaded";

  const explorerUrl =
    TOKEN_ADDRESS
      ? `${network.blockExplorerUrls[0]}/address/${TOKEN_ADDRESS}`
      : "";

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
                "Demo USD Token"}
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              {symbol ||
                "DUSD"} ERC-20 dashboard
            </p>

            {account && (
              <p className="mt-3 break-all text-xs text-slate-500">
                Connected:{" "}
                {shortAccount}
              </p>
            )}

          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">

            <button
              type="button"
              onClick={
                connectMetaMask
              }
              disabled={
                Boolean(
                  connectingWallet
                )
              }
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectingWallet ===
              "MetaMask"
                ? "Connecting..."
                : walletType ===
                    "MetaMask" &&
                  account
                  ? shortAccount
                  : "Connect MetaMask"}
            </button>

            <button
              type="button"
              onClick={
                connectTrustWallet
              }
              disabled={
                Boolean(
                  connectingWallet
                )
              }
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectingWallet ===
              "Trust Wallet"
                ? "Connecting..."
                : walletType ===
                    "Trust Wallet" &&
                  account
                  ? shortAccount
                  : "Connect Trust Wallet"}
            </button>

          </div>
        </div>

        {/* STATUS */}

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-300">
            <p className="break-words">
              {message}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
            <p className="break-words">
              {error}
            </p>
          </div>
        )}

        {/* TOKEN STATS */}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Wallet Balance
            </p>

            <p className="mt-3 break-all text-2xl font-bold">
              {balance}{" "}
              {symbol}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Total Supply
            </p>

            <p className="mt-3 break-all text-2xl font-bold">
              {totalSupply}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">
              Mintable Remaining
            </p>

            <p className="mt-3 break-all text-2xl font-bold">
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
            onSubmit={
              transferTokens
            }
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >

            <h2 className="text-xl font-bold">
              Transfer{" "}
              {symbol ||
                "DUSD"}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Send DUSD to another Monad wallet.
            </p>

            <div className="mt-6 space-y-4">

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Recipient address
                </label>

                <input
                  value={
                    recipient
                  }
                  onChange={(
                    event
                  ) =>
                    setRecipient(
                      event.target
                        .value
                    )
                  }
                  placeholder="0x..."
                  spellCheck="false"
                  autoComplete="off"
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
                  value={
                    transferAmount
                  }
                  onChange={(
                    event
                  ) =>
                    setTransferAmount(
                      event.target
                        .value
                    )
                  }
                  placeholder="100"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-violet-500"
                />

              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !token
                }
                className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Processing..."
                  : `Send ${
                      symbol ||
                      "DUSD"
                    }`}
              </button>

            </div>
          </form>

          {/* MINT */}

          <form
            onSubmit={
              mintTokens
            }
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >

            <div className="flex items-center justify-between gap-4">

              <div>

                <h2 className="text-xl font-bold">
                  Mint{" "}
                  {symbol ||
                    "DUSD"}
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Owner-only token creation.
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
                  value={
                    mintRecipient
                  }
                  onChange={(
                    event
                  ) =>
                    setMintRecipient(
                      event.target
                        .value
                    )
                  }
                  placeholder="0x..."
                  spellCheck="false"
                  autoComplete="off"
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
                  value={
                    mintAmount
                  }
                  onChange={(
                    event
                  ) =>
                    setMintAmount(
                      event.target
                        .value
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
                  !token ||
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <h2 className="text-lg font-bold">
              Contract Information
            </h2>

            <button
              type="button"
              onClick={
                refreshBalance
              }
              disabled={
                !token ||
                loading
              }
              className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Refresh Token Data
            </button>

          </div>

          <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">

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
                Token Name
              </p>

              <p className="mt-1 text-slate-300">
                {tokenName ||
                  "Not loaded"}
              </p>
            </div>

            <div>
              <p className="text-slate-500">
                Symbol
              </p>

              <p className="mt-1 text-slate-300">
                {symbol ||
                  "Not loaded"}
              </p>
            </div>

            <div className="md:col-span-2">

              <p className="text-slate-500">
                Contract
              </p>

              <p className="mt-1 break-all text-slate-300">
                {TOKEN_ADDRESS}
              </p>

            </div>

            <div className="md:col-span-2">

              <p className="text-slate-500">
                Owner
              </p>

              <p className="mt-1 break-all text-slate-300">
                {owner
                  ? `${owner} (${shortOwner})`
                  : "Not loaded"}
              </p>

            </div>

            <div className="md:col-span-2">

              <p className="text-slate-500">
                Connected Wallet
              </p>

              <p className="mt-1 break-all text-slate-300">
                {account ||
                  "Not connected"}
              </p>

            </div>

          </div>

          {explorerUrl && (
            <a
              href={
                explorerUrl
              }
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-300 transition hover:bg-violet-400/20"
            >
              View contract on MonadScan →
            </a>
          )}

        </div>

        {/* WALLET TROUBLESHOOTING */}

        <div className="mt-6 rounded-3xl border border-blue-400/10 bg-blue-400/[0.04] p-6">

          <h2 className="text-lg font-bold">
            Wallet Connection
          </h2>

          <div className="mt-4 space-y-2 text-sm leading-6 text-slate-400">

            <p>
              MetaMask and Trust Wallet
              are discovered independently
              through EIP-6963 when supported.
            </p>

            <p>
              If Trust Wallet still displays
              “Broadcast channel unavailable”,
              update/restart the Trust Wallet
              browser extension and reload this
              page.
            </p>

            <p>
              The DUSD contract does not need
              to be redeployed to fix a wallet
              provider connection problem.
            </p>

          </div>

        </div>

      </div>

    </main>
  );
}
