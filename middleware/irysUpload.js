const fs = require("fs");
const { umi, logger } = require("../config/solanaConfig");

const uploadImageToIrys = async (file) => {
  try {
    const fileSize = fs.statSync(file.path).size;

    logger.info(`Image path: ${file.path}`);

    if (typeof fileSize !== "number" || !Number.isInteger(fileSize)) {
      throw new Error("File size must be an integer");
    }

    const fileStream = fs.readFileSync(file.path);

    const fileObject = {
      buffer: fileStream,
      name: file.filename,
      type: file.mimetype || "image/png",
      size: fileSize,
    };

    // Upload the file to Irys
    const imageUri = await umi.uploader.upload([fileObject]);
    logger.info(`Image URI: ${imageUri}`);
    return imageUri;
  } catch (error) {
    logger.error("Failed to upload image to Irys:", error);
    throw error;
  }
};

module.exports = { uploadImageToIrys };
