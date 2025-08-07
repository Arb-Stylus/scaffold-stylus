import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
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

rainbowkitBurnerWallet.rpcUrls = {
  [arbitrumNitro.id]: arbitrumNitro.rpcUrls.default.http[0],
};

const wallets = [
  ...(!targetNetworks.some(network => network.id !== (arbitrumNitro as chains.Chain).id) || !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),

  // NOTE: this is a workaround that loads the wallets if indexedDB is ready.
  // TODO: revert when fix is available from rainbowkit / wagmi side
  // source: https://github.com/rainbow-me/rainbowkit/issues/2476#issuecomment-3117608183
  ...(typeof indexedDB !== "undefined"
    ? [braveWallet, metaMaskWallet, walletConnectWallet, ledgerWallet, coinbaseWallet, rainbowWallet, safeWallet]
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
    appName: "scaffold-stylus",
    projectId: scaffoldConfig.walletConnectProjectId,
  },
);
