import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/chain";

import scaffoldConfig from "~~/scaffold.config";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

const wallets = [
  metaMaskWallet,
  walletConnectWallet,
  ledgerWallet,
  coinbaseWallet,
  rainbowWallet,
  safeWallet,
  ...(!targetNetworks.some(network => network.id !== (arbitrumNitro as chains.Chain).id) || !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),
];

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = connectorsForWallets(
  [
    {
      groupName: "Supported Wallets",
      wallets,
    },
  ],

  {
    appName: "scaffold-eth-2",
    projectId: scaffoldConfig.walletConnectProjectId,
  },
);
