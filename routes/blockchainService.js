// blockchainService.js
const axios = require("axios");

const sendToBlockchain = async (blockchainData, token) => {
  try {
    const blockchainResponse = await axios.post(
      "https://blockchain-vkcv.onrender.com/api/blockchain/contribute",
      blockchainData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log("Blockchain response:", blockchainResponse.data);
    return blockchainResponse.data;
  } catch (error) {
    console.error("Error sending data to blockchain", error);
    throw new Error("Error sending data to blockchain");
  }
};

module.exports = { sendToBlockchain };
