import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Abi, AbiEvent, ExtractAbiEventNames } from "abitype";
import { BlockNumber, GetLogsParameters } from "viem";
import { Config, UsePublicClientReturnType, useBlockNumber, usePublicClient } from "wagmi";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { AllowedChainIds } from "~~/utils/scaffold-stylus";
import { replacer } from "~~/utils/scaffold-eth/common";
import {
  ContractAbi,
  ContractName,
  UseScaffoldEventHistoryConfig,
  UseScaffoldEventHistoryData,
} from "~~/utils/scaffold-eth/contract";

const getEvents = async (
  getLogsParams: GetLogsParameters<AbiEvent | undefined, AbiEvent[] | undefined, boolean, BlockNumber, BlockNumber>,
  publicClient?: UsePublicClientReturnType<Config, number>,
  Options?: {
    blockData?: boolean;
    transactionData?: boolean;
    receiptData?: boolean;
  },
) => {
  const logs = await publicClient?.getLogs({
    address: getLogsParams.address,
    fromBlock: getLogsParams.fromBlock,
    toBlock: getLogsParams.toBlock,
    args: getLogsParams.args,
    event: getLogsParams.event,
  });
  if (!logs) return undefined;

  const finalEvents = await Promise.all(
    logs.map(async log => {
      return {
        ...log,
        blockData:
          Options?.blockData && log.blockHash ? await publicClient?.getBlock({ blockHash: log.blockHash }) : null,
        transactionData:
          Options?.transactionData && log.transactionHash
            ? await publicClient?.getTransaction({ hash: log.transactionHash })
            : null,
        receiptData:
          Options?.receiptData && log.transactionHash
            ? await publicClient?.getTransactionReceipt({ hash: log.transactionHash })
            : null,
      };
    }),
  );

  return finalEvents;
};

/**
 * Reads events from a deployed contract
 * @param config - The config settings
 * @param config.contractName - deployed contract name
 * @param config.eventName - name of the event to listen for
 * @param config.fromBlock - the block number to start reading events from
 * @param config.toBlock - optional block number to stop reading events at (if not provided, reads until current block)
 * @param config.chainId - optional chainId that is configured with the scaffold project to make use for multi-chain interactions.
 * @param config.filters - filters to be applied to the event (parameterName: value)
 * @param config.blockData - if set to true it will return the block data for each event (default: false)
 * @param config.transactionData - if set to true it will return the transaction data for each event (default: false)
 * @param config.receiptData - if set to true it will return the receipt data for each event (default: false)
 * @param config.watch - if set to true, the events will be updated every pollingInterval milliseconds set at scaffoldConfig (default: false)
 * @param config.enabled - set this to false to disable the hook from running (default: true)
 * @param config.blocksBatchSize - optional batch size for fetching events. If specified, each batch will contain at most this many blocks (default: 500)
 */
export const useScaffoldEventHistory = <
  TContractName extends ContractName,
  TEventName extends ExtractAbiEventNames<ContractAbi<TContractName>>,
  TBlockData extends boolean = false,
  TTransactionData extends boolean = false,
  TReceiptData extends boolean = false,
>({
  contractName,
  eventName,
  fromBlock,
  toBlock,
  chainId,
  filters,
  blockData,
  transactionData,
  receiptData,
  watch,
  enabled = true,
  blocksBatchSize = 500,
}: UseScaffoldEventHistoryConfig<TContractName, TEventName, TBlockData, TTransactionData, TReceiptData>) => {
  const selectedNetwork = useSelectedNetwork(chainId);

  const publicClient = usePublicClient({
    chainId: selectedNetwork.id,
  });
  const [isFirstRender, setIsFirstRender] = useState(true);

  const { data: blockNumber } = useBlockNumber({ watch: watch, chainId: selectedNetwork.id });

  const { data: deployedContractData } = useDeployedContractInfo({
    contractName,
    chainId: selectedNetwork.id as AllowedChainIds,
  });

  const event =
    deployedContractData &&
    ((deployedContractData.abi as Abi).find(part => part.type === "event" && part.name === eventName) as AbiEvent);

  const isContractAddressAndClientReady = Boolean(deployedContractData?.address) && Boolean(publicClient);

  const query = useInfiniteQuery({
    queryKey: [
      "eventHistory",
      {
        contractName,
        address: deployedContractData?.address,
        eventName,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock?.toString(),
        chainId: selectedNetwork.id,
        filters: JSON.stringify(filters, replacer),
        blocksBatchSize: blocksBatchSize.toString(),
      },
    ],
    queryFn: async ({ pageParam }) => {
      if (!isContractAddressAndClientReady) return undefined;

      // Calculate the toBlock for this batch
      let batchToBlock = toBlock;
      const batchEndBlock = pageParam + BigInt(blocksBatchSize) - 1n;
      const maxBlock = toBlock || (blockNumber ? BigInt(blockNumber) : undefined);
      if (maxBlock) {
        batchToBlock = batchEndBlock < maxBlock ? batchEndBlock : maxBlock;
      }

      const data = await getEvents(
        {
          address: deployedContractData?.address,
          event,
          fromBlock: pageParam,
          toBlock: batchToBlock,
          args: filters,
        },
        publicClient,
        { blockData, transactionData, receiptData },
      );

      return data;
    },
    enabled: enabled && isContractAddressAndClientReady,
    initialPageParam: fromBlock,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (!blockNumber || fromBlock >= blockNumber) return undefined;

      const lastPageHighestBlock = Math.max(
        Number(lastPageParam),
        ...(lastPage || []).map(event => Number(event.blockNumber || 0)),
      );
      const nextBlock = BigInt(Math.max(Number(lastPageParam), lastPageHighestBlock) + 1);

      // Don't go beyond the specified toBlock or current block
      const maxBlock = toBlock && toBlock < blockNumber ? toBlock : blockNumber;

      if (nextBlock > maxBlock) return undefined;

      return nextBlock;
    },
    select: data => {
      const events = data.pages.flat() as unknown as UseScaffoldEventHistoryData<
        TContractName,
        TEventName,
        TBlockData,
        TTransactionData,
        TReceiptData
      >;

      return {
        pages: events?.reverse(),
        pageParams: data.pageParams,
      };
    },
  });

  useEffect(() => {
    const shouldSkipEffect = !blockNumber || !watch || isFirstRender;
    if (shouldSkipEffect) {
      // skipping on first render, since on first render we should call queryFn with
      // fromBlock value, not blockNumber
      if (isFirstRender) setIsFirstRender(false);
      return;
    }

    query.fetchNextPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, watch]);

  // Manual trigger to fetch next page when previous page completes
  useEffect(() => {
    if (query.status === "success" && query.hasNextPage && !query.isFetchingNextPage && !query.error) {
      query.fetchNextPage();
    }
  }, [query]);

  return {
    data: query.data?.pages,
    status: query.status,
    error: query.error,
    isLoading: query.isLoading,
    isFetchingNewEvent: query.isFetchingNextPage,
    refetch: query.refetch,
  };
};
