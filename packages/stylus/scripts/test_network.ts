import { getChain, getRpcUrlFromChain, ALIASES } from "./utils/";
import { SUPPORTED_NETWORKS } from "./utils/";

function testNetworkFunctionality() {
  console.log("🧪 Testing network functionality...\n");

  const testNetworks = [...Object.keys(SUPPORTED_NETWORKS)];

  testNetworks.forEach((network) => {
    const chain = getChain(network);
    if (chain) {
      console.log(`✅ ${network}: ${getRpcUrlFromChain(chain)}`);
    } else {
      console.log(`❌ ${network}: Not found in viem chains`);
    }
  });

  console.log("\n📝 Usage examples:");
  Object.keys(SUPPORTED_NETWORKS).forEach((network) => {
    const chain = getChain(network);
    // Find the alias for this network (reverse lookup)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const alias = Object.entries(ALIASES).find(([_, value]) => value === network)?.[0];
    const networkName = alias || network;
    console.log(
      `  yarn deploy --network ${networkName}\t# Deploy to ${chain?.name}`,
    );
  });
}

if (require.main === module) {
  testNetworkFunctionality();
}
