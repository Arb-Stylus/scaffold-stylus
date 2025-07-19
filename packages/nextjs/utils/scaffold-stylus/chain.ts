import { defineChain } from "viem";

export const arbitrumNitro = defineChain({
  id: 412346,
  name: "Arbitrum Nitro",
  network: "arbitrum-nitro",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["http://localhost:8547"],
    },
    public: {
      http: ["http://localhost:8547"],
    },
  },
  accounts: [
    {
      privateKey: "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659",
      address: "0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E",
    },
    {
      privateKey: "0x64cf8b4376aca8e153f2aca74b7f5f59e19b8bbb2da594a98095729ba12a9f6c",
      address: "0xDD09b55496EaA3cFAe23137ABDeA52a9a979B70e",
    },
    {
      privateKey: "0x7a56d99de9eb0977d6dfab1f8465b2705a4c3ca9342ad4fc8cc97aa6f42056c4",
      address: "0xE9cB1563bE49002383D08386ee287aF7BAD08c3b",
    },
    {
      privateKey: "0xc011740e64cd1bcefb4b5b869ac1169f79e8524cd7c6d409b3fe5b7dfd92afa6",
      address: "0x838d568Ffb16BC74083e88fd769df85E8d3afcE6",
    },
    {
      privateKey: "0xf2e04103742c7623c6019ca2b7e4710c1bad9bde003383d29f92c6be026fa29c",
      address: "0xA491d1134388c78AeEDf6b1Ca3F21657015Ff8E1",
    },
  ],
});
