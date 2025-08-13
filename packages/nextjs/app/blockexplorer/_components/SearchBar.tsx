"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, isHex } from "viem";
import { usePublicClient } from "wagmi";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

export const SearchBar = () => {
  const [searchInput, setSearchInput] = useState("");
  const router = useRouter();

  const client = usePublicClient({ chainId: arbitrumNitro.id });

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isHex(searchInput)) {
      try {
        const tx = await client?.getTransaction({ hash: searchInput });
        if (tx) {
          router.push(`/blockexplorer/transaction/${searchInput}`);
          return;
        }
      } catch (error) {
        console.error("Failed to fetch transaction:", error);
      }
    }

    if (isAddress(searchInput)) {
      router.push(`/blockexplorer/address/${searchInput}`);
      return;
    }
  };

  return (
    <form onSubmit={handleSearch} className="flex items-center justify-between mb-5">
      <div className="uppercase text-3xl font-bold">Block explorer</div>
      <div className="flex items-center bg-surface rounded-lg shadow-lg py-3 px-4 overflow-hidden">
        <input
          className="text-gray-300 bg-transparent py-3 w-full md:w-96 lg:w-96 border-0 focus:outline-none focus:ring-0"
          type="text"
          value={searchInput}
          placeholder="Search by hash or address"
          onChange={e => setSearchInput(e.target.value)}
        />
        <button
          className="bg-pink-500 hover:bg-pink-600 text-white p-3 rounded-lg transition-colors duration-200 flex items-center justify-center"
          type="submit"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      </div>
    </form>
  );
};
