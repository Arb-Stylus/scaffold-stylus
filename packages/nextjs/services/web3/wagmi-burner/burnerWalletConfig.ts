import { Chain, Wallet } from "@rainbow-me/rainbowkit";
import scaffoldConfig from "~~/scaffold.config";
import { BurnerConnector, burnerWalletId, burnerWalletName } from "~~/services/web3/wagmi-burner/BurnerConnector";
import { getTargetNetworks } from "~~/utils/scaffold-eth";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/chain";

const { onlyLocalBurnerWallet } = scaffoldConfig;
const targetNetworks = getTargetNetworks();

export type BurnerWalletOptions = {
  chains: Chain[];
  privateKey?: string;
};

const burnerWalletIconBase64 =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUzIiBoZWlnaHQ9IjM1MiIgdmlld0JveD0iMCAwIDM1MyAzNTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHg9IjAuNzE2MzA5IiB5PSIwLjMxNzEzOSIgd2lkdGg9IjM1MS4zOTQiIGhlaWdodD0iMzUxLjM5NCIgZmlsbD0idXJsKCNwYWludDBfbGluZWFyXzNfMTUxKSIvPgo8Y2lyY2xlIGN4PSIzNC40OTUzIiBjeT0iMzQuNDk1MyIgcj0iMzQuNDk1MyIgdHJhbnNmb3JtPSJtYXRyaXgoLTEgMCAwIDEgMjA3LjAxOCAyNTQuMTIpIiBmaWxsPSIjRkY2NjBBIi8+CjxwYXRoIGQ9Ik0xNTQuMzE4IDMxNy45NTVDMTcxLjI3MyAzMTAuODkgMTc2LjU4MiAyOTAuNzE1IDE3Ni4xNTcgMjgzLjQ4N0wyMDcuMDE4IDI4OC44NjRDMjA3LjAxOCAzMDMuMzE0IDIwMC4yMTIgMzA5LjQwMiAxOTcuODI0IDMxMi40MzNDMTkzLjQ3NCAzMTcuOTU1IDE3My4zNTEgMzMwLjAzIDE1NC4zMTggMzE3Ljk1NVoiIGZpbGw9InVybCgjcGFpbnQxX3JhZGlhbF8zXzE1MSkiLz4KPGcgZmlsdGVyPSJ1cmwoI2ZpbHRlcjBfZF8zXzE1MSkiPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTIyNy4zNzcgMzAyLjI3NkMyMjYuNDI2IDMwNS44OTcgMjMwLjMxNSAzMDkuNDA1IDIzMy4zOTYgMzA3LjI3OUMyNTQuNTM4IDI5Mi42ODQgMjcwLjQ3OSAyNjkuOTQ1IDI3NC44OSAyNDcuNDg5QzI4Mi4yNCAyMTAuMDcxIDI3Mi4yMzUgMTc1LjcyNyAyMzguMDI4IDE0NS45MjVDMjAwLjg3NCAxMTMuNTU2IDE5MS44NDQgODguNDU2MSAxOTAuMTYyIDUwLjg3MThDMTg5Ljc5NyA0Mi43MjE4IDE4MS42MDQgMzcuMjk0NyAxNzQuODI0IDQxLjgzMTdDMTUyLjY2OCA1Ni42NTc0IDEzMi41MTIgODQuNDk5IDEzOC45MTEgMTIwLjc1OEMxNDEuMDA0IDEzMi42MjEgMTQ2Ljc5NCAxNDEuMDE2IDE1MS45NyAxNDguNTIzQzE1OC40OTEgMTU3Ljk3OCAxNjQuMDM5IDE2Ni4wMjMgMTU5Ljk5NyAxNzcuODFDMTU1LjIwMyAxOTEuNzk0IDEzOS4xMzQgMTk5LjE2MiAxMjguNzQ3IDE5Mi40MjlDMTE0LjE3IDE4Mi45ODEgMTEzLjI1MyAxNjYuNjUxIDExNy45NjkgMTQ5LjQ1NkMxMTguOTAyIDE0Ni4wNTUgMTE1LjQ3MSAxNDMuMjA0IDExMi42OCAxNDUuMzU5QzkxLjM2MDQgMTYxLjgyMSA2OS4xNTMyIDE5OS4yNjcgNzcuNjY0NyAyNDcuNDg5Qzg1Ljk3OTIgMjc2LjIxMiA5Ny45Mjc3IDI5Mi41MzcgMTEwLjk3MSAzMDEuNTQxQzExMy43NjMgMzAzLjQ2OCAxMTcuMTU5IDMwMC42MzEgMTE2LjU5NyAyOTcuMjg2QzExNi4wODEgMjk0LjIxMiAxMTUuODEzIDI5MS4wNTQgMTE1LjgxMyAyODcuODMzQzExNS44MTMgMjU2LjUxMyAxNDEuMjAzIDIzMS4xMjMgMTcyLjUyMyAyMzEuMTIzQzIwMy44NDIgMjMxLjEyMyAyMjkuMjMyIDI1Ni41MTMgMjI5LjIzMiAyODcuODMzQzIyOS4yMzIgMjkyLjgyNCAyMjguNTg3IDI5Ny42NjUgMjI3LjM3NyAzMDIuMjc2WiIgZmlsbD0idXJsKCNwYWludDJfbGluZWFyXzNfMTUxKSIvPgo8L2c+CjxkZWZzPgo8ZmlsdGVyIGlkPSJmaWx0ZXIwX2RfM18xNTEiIHg9IjcyLjExMTIiIHk9IjM2LjQ5NCIgd2lkdGg9IjIwOC43NDIiIGhlaWdodD0iMjc1LjEyIiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+CjxmZUZsb29kIGZsb29kLW9wYWNpdHk9IjAiIHJlc3VsdD0iQmFja2dyb3VuZEltYWdlRml4Ii8+CjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIiByZXN1bHQ9ImhhcmRBbHBoYSIvPgo8ZmVPZmZzZXQvPgo8ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxLjg0NTA2Ii8+CjxmZUNvbXBvc2l0ZSBpbjI9ImhhcmRBbHBoYSIgb3BlcmF0b3I9Im91dCIvPgo8ZmVDb2xvck1hdHJpeCB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMCAwIDAgMCAxIDAgMCAwIDAgMC40MiAwIDAgMCAwIDAgMCAwIDAgMC43IDAiLz4KPGZlQmxlbmQgbW9kZT0ibXVsdGlwbHkiIGluMj0iQmFja2dyb3VuZEltYWdlRml4IiByZXN1bHQ9ImVmZmVjdDFfZHJvcFNoYWRvd18zXzE1MSIvPgo8ZmVCbGVuZCBtb2RlPSJub3JtYWwiIGluPSJTb3VyY2VHcmFwaGljIiBpbjI9ImVmZmVjdDFfZHJvcFNoYWRvd18zXzE1MSIgcmVzdWx0PSJzaGFwZSIvPgo8L2ZpbHRlcj4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyXzNfMTUxIiB4MT0iMTc2LjQxMyIgeTE9IjAuMzE3MTM5IiB4Mj0iMTc2LjQxMyIgeTI9IjM1MS43MTEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iI0ZGRjI3OSIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNGRkQzMzYiLz4KPC9saW5lYXJHcmFkaWVudD4KPHJhZGlhbEdyYWRpZW50IGlkPSJwYWludDFfcmFkaWFsXzNfMTUxIiBjeD0iMCIgY3k9IjAiIHI9IjEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiBncmFkaWVudFRyYW5zZm9ybT0idHJhbnNsYXRlKDIxOC4wNDggMjQ5LjM0Nykgcm90YXRlKDEyNC4wMTgpIHNjYWxlKDg5LjI5NTUgMjY0LjgwOSkiPgo8c3RvcCBvZmZzZXQ9IjAuNjQwODUiIHN0b3AtY29sb3I9IiNGRjY2MEEiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkZCRTE1Ii8+CjwvcmFkaWFsR3JhZGllbnQ+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQyX2xpbmVhcl8zXzE1MSIgeDE9IjE3Ni40ODIiIHkxPSI0MC4xODQxIiB4Mj0iMTc2LjQ4MiIgeTI9IjMxNy4yNzgiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agb2Zmc2V0PSIwLjMzODU0MiIgc3RvcC1jb2xvcj0iI0ZGOEYzRiIvPgo8c3RvcCBvZmZzZXQ9IjAuNjU2MjUiIHN0b3AtY29sb3I9IiNGRjcwMjAiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkYzRDAwIi8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==";

/**
 * Wagmi config for burner wallet
 */
export const burnerWalletConfig = ({ chains, privateKey }: BurnerWalletOptions): Wallet => ({
  id: burnerWalletId,
  name: burnerWalletName,
  iconUrl: burnerWalletIconBase64,
  iconBackground: "#ffffff",
  hidden: () => {
    if (onlyLocalBurnerWallet) {
      return targetNetworks.some(({ id }) => id !== arbitrumNitro.id);
    }

    return false;
  },
  createConnector: () => {
    const connector = new BurnerConnector({
      chains,
      options: {
        defaultChainId: targetNetworks[0].id,
        privateKey: privateKey,
      },
    });

    return {
      connector,
    };
  },
});
