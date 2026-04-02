import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Provider setup for Sepolia network
export const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Wallet setup using the private key from .env
export const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Replace with your actual deployed contract address and ABI
export const contractAddress = process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

export const contractABI = [
    "function storeBlock(string memory mongoId, string memory blockHash) public",
    "function getBlockHash(string memory mongoId) public view returns (string)"
];

console.log("Backend using wallet address:", wallet.address);

// Initialize the Smart Contract instance
export const systemContract = new ethers.Contract(contractAddress, contractABI, wallet);

// Fetch Wallet Balance and Gas Information
const logBlockchainDetails = async () => {
    try {
        // 1. Get Wallet Balance in ETH
        const balanceWei = await provider.getBalance(wallet.address);
        console.log(`🤑 Wallet Balance      : ${ethers.formatEther(balanceWei)} ETH`);

        // 2. Get Current Network Gas Price
        const feeData = await provider.getFeeData();
        const gasPriceGwei = feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : 'Unknown';
        console.log(`⛽ Current Gas Price   : ${gasPriceGwei} Gwei`);

        // 3. Estimate gas for the \`storeBlock\` transaction
        if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
            const dummyMongoId = "609d2901a1c8f...";
            const dummyHash = "dummy_hash_for_estimation";

            // Estimate the number of gas units required
            const estimatedGas = await systemContract.storeBlock.estimateGas(dummyMongoId, dummyHash);
            
            // Calculate total fee in ETH (Gas Limit * Gas Price)
            const txFeeWei = estimatedGas * (feeData.gasPrice || 1n);
            const txFeeEth = ethers.formatEther(txFeeWei);

            console.log(`📊 Est. Tx Gas Limit   : ${estimatedGas.toString()} units`);
            console.log(`💸 Est. Tx Fee         : ~${txFeeEth} ETH`);
        } else {
            console.log("⚠️  Contract uninitialized (setup .env CONTRACT_ADDRESS) - skipping Tx gas estimation.");
        }
    } catch (error) {
        console.error("⚠️  Failed to fetch blockchain network details:", error.message);
    }
};

// Run the verification silently on startup
logBlockchainDetails();
