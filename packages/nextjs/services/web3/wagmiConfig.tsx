import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { arbitrumNitro, getAlchemyHttpUrl } from "~~/utils/scaffold-stylus";

const { targetNetworks } = scaffoldConfig;

// We want mainnet enabled for ENS resolution, but only when a real network is actually in
// play. If every target network is the local devnode, adding mainnet here would make wagmi
// (and RainbowKit's own internal ENS lookups, which key off this same chain list) treat
// mainnet as configured and start firing ENS requests against the public internet from a
// pure local-dev session -- see Address.tsx's isLocalNetwork gate for the other half of this.
const isLocalOnlyConfig = targetNetworks.every((network: Chain) => network.id === arbitrumNitro.id);

export const enabledChains =
  targetNetworks.find((network: Chain) => network.id === 1) || isLocalOnlyConfig
    ? targetNetworks
    : ([...targetNetworks, mainnet] as const);

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: true,
  client({ chain }) {
    let rpcFallbacks = [http()];

    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    if (rpcOverrideUrl) {
      rpcFallbacks = [http(rpcOverrideUrl), http()];
    } else {
      const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
      if (alchemyHttpUrl) {
        const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
        // If using default Scaffold-ETH 2 API key, we prioritize the default RPC
        rpcFallbacks = isUsingDefaultKey ? [http(), http(alchemyHttpUrl)] : [http(alchemyHttpUrl), http()];
      }
    }

    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (arbitrumNitro as Chain).id
        ? {
            pollingInterval: scaffoldConfig.pollingInterval,
          }
        : {}),
    });
  },
});
