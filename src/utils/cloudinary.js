import { v2 as cloudinary } from "cloudinary";

import fs from "fs";

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    return response;
  } catch (err) {
    fs.unlinkSync(localFilePath); // remove the locally file saved tamporarily file as the filed to upload on cloudinary
    throw new ApiError(400, "Please provide a file");
  }
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
