import { getChain } from "./utils/";
import { SUPPORTED_NETWORKS } from "./utils/";

function testNetworkFunctionality() {
  console.log("🧪 Testing network functionality...\n");

  const testNetworks = [...Object.keys(SUPPORTED_NETWORKS)];

  testNetworks.forEach((network) => {
    const chain = getChain(network);
    if (chain) {
      console.log(`✅ ${network}: ${chain.rpcUrl}`);
    } else {
      console.log(`❌ ${network}: Not found in viem chains`);
    }
  });

  console.log("\n📝 Usage examples:");
  Object.keys(SUPPORTED_NETWORKS).forEach((network) => {
    const chain = getChain(network);
    console.log(
      `  yarn deploy --network ${chain?.name}\t# Deploy to ${chain?.name}`,
    );

    // TODO: determine which one to use later, for now we use all original names
    // console.log(
    //   `  yarn deploy --network ${chain?.alias}\t\t# Deploy to ${chain?.name} (alias)`,
    // );
  });
}

if (require.main === module) {
  testNetworkFunctionality();
}
