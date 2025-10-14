import { useState } from "react";
import { TransactionReceipt } from "viem";
import { CheckCircleIcon, DocumentDuplicateIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { ObjectFieldDisplay } from "~~/app/debug/_components/contract";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth/useCopyToClipboard";
import { replacer } from "~~/utils/scaffold-eth/common";

export const TxReceipt = ({ txResult }: { txResult: TransactionReceipt }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { copyToClipboard: copyTxResultToClipboard, isCopiedToClipboard: isTxResultCopiedToClipboard } =
    useCopyToClipboard();

  return (
    <div
      className="text-sm rounded-lg min-h-0 p-4"
      style={{
        background: "var(--bg-surface-input-20, rgba(255, 255, 255, 0.04))",
        backdropFilter: "blur(25px)",
        border: "none",
      }}
    >
      {/* Fixed Header */}
      <div className="flex items-center">
        <div className="flex items-center">
          {isTxResultCopiedToClipboard ? (
            <CheckCircleIcon
              className="text-xl font-normal text-base-content h-5 w-5 cursor-pointer"
              aria-hidden="true"
            />
          ) : (
            <DocumentDuplicateIcon
              className="text-xl font-normal h-5 w-5 cursor-pointer"
              aria-hidden="true"
              onClick={() => copyTxResultToClipboard(JSON.stringify(txResult, replacer, 2))}
            />
          )}
        </div>
        <div className="flex-1 flex items-center pl-2">
          <strong>Transaction Receipt</strong>
        </div>
        <div className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="overflow-auto rounded-t-none mt-2">
          <pre className="text-xs">
            {Object.entries(txResult).map(([k, v]) => (
              <ObjectFieldDisplay name={k} value={v} size="xs" leftPad={false} key={k} />
            ))}
          </pre>
        </div>
      )}
    </div>
  );
};
