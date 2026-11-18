/**
 * Hardhat Deployment Script for FractalFlowMatrix27
 * Target Network: BNB Smart Chain (Chain ID 56)
 */
const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting FractalFlowMatrix27 deployment on BNB Smart Chain...");

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = deployer ? deployer.address : "0xEdD91926Ae28B9F692708e9A9D759320eab93158";
  console.log(`👤 Deployer Account: ${deployerAddress}`);

  // Constructor parameters matching FractalFlowMatrix27.sol:
  // (_usdt, _allSellWallet, _botWallet, _familyPool, _rootUser, _usdtDecimals)
  const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x00BeC3bd7D5FFCf31D043bB1af71f0d59867eB48";
  const ALL_SELL_WALLET = process.env.ALL_SELL_WALLET || deployerAddress;
  const BOT_WALLET = process.env.BOT_WALLET || deployerAddress;
  const FAMILY_POOL = process.env.FAMILY_POOL || deployerAddress;
  const ROOT_USER = process.env.ROOT_USER || deployerAddress;
  const USDT_DECIMALS = Number(process.env.USDT_DECIMALS || 18);

  console.log(`💵 USDT Token:      ${USDT_ADDRESS} (${USDT_DECIMALS} decimals)`);
  console.log(`🏦 AllSell Wallet:  ${ALL_SELL_WALLET}`);
  console.log(`🤖 Bot Wallet:      ${BOT_WALLET}`);
  console.log(`👨‍👩‍👧‍👦 Family Pool:     ${FAMILY_POOL}`);
  console.log(`👑 Root User (#1):  ${ROOT_USER}`);

  const FractalFlowMatrix27 = await hre.ethers.getContractFactory("FractalFlowMatrix27");
  const matrix = await FractalFlowMatrix27.deploy(
    USDT_ADDRESS,
    USDT_DECIMALS,
    ALL_SELL_WALLET,
    BOT_WALLET,
    FAMILY_POOL,
    ROOT_USER
  );
  await matrix.waitForDeployment();

  const deployedAddress = await matrix.getAddress();
  console.log(`🎉 FractalFlowMatrix27 deployed successfully to: ${deployedAddress}`);
  console.log(`🔍 Verify on BSCScan: https://bscscan.com/address/${deployedAddress}`);
  return deployedAddress;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
