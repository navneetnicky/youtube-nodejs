import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user deatils from frontend
  // validation - not empty
  // check if user exists: username, email
  // check for images, check for avatar
  // updload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token fields from response
  // check for user creation
  // send back response

  const { fullName, email, username, password } = req.body;
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "Please fill all fields");
  }

  const existedUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Please upload an avatar");
  }

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Please upload an avatar");
  }

  const user = await User.create({
    fullName,
    email,
    username: username.toLowerCase(),
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while creating user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, "User created successfully!", createdUser));
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // check for email and password
  // check if user exists
  // check if password is correct
  // generate access token and refresh token
  // send back response (cookie)

  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "Please provide username or email");
  }

  const user = await User.findOne({ $or: [{ username }, { email }] });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPosswordValid = await user.isPosswordCorrect(password);

  if (!isPosswordValid) {
    throw new ApiError(401, "Password is incorrect");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  console.log(accessToken, refreshToken);
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true, // cookie is not accessible via client side script
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(200, "User logged in successfully", {
        user: loggedInUser,
        accessToken,
        refreshToken,
      })
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );

  const options = {
    httpOnly: true, // cookie is not accessible via client side script
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, "User logged out successfully"));
});

const refreshAcessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.token;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodeToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = User.findById(decodeToken?._id);

    if (!user) {
      throw new ApiError(404, "Invalid refresh token");
    }

    if (decodeincomingRefreshTokenToken !== user?.refreshToken) {
      throw new ApiError(401, "Invalid refresh token");
    }

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    const options = {
      httpOnly: true, // cookie is not accessible via client side script
      secure: true,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(200, "Access token refreshed successfully", {
          accessToken,
          refreshToken: newRefreshToken,
        })
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);

  const isPosswordCorrect = await user.isPosswordCorrect(currentPassword);

  if (!isPosswordCorrect) {
    throw new ApiError(400, "Current password is incorrect");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  return res
    .status(200)
    .json(new ApiResponse(200, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "User found", req.user));
});

const updateAccountUpdate = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "Please provide full name and email");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, "Account updated successfully", user));
});

const updateAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path; // its a single file

  if (!avatarLocalPath) {
    throw new ApiError(400, "Please upload an avatar");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Please upload an avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, "Avatar updated successfully", user));
});

const updateCoverAvatar = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path; // its a single file

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Please upload an cover image");
  }

  const coverImg = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImg.url) {
    throw new ApiError(400, "Please upload an avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        coverImage: coverImg.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, "Cover Image updated successfully", user));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username) {
    throw new ApiError(400, "Please provide username");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username.toLowerCase(), // like where clause
      },
    },
    {
      $lookup: {
        from: "Subscription",
        localField: "_id", // like join
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "Subscription",
        localField: "_id",
        foreignField: "subscriber", // like join
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        totalSubscribers: { $size: "$subscribers" }, // like select count(*)
        totalSubscribedTo: { $size: "$subscribedTo" },
        isSubscribed: {
          $cond: {
            if: { $$in: [req.user._id, "$subscribers.subscriber"] }, // like if exists
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1, // like select (if 1 then select, if 0 then not select)
        totalSubscribers: 1,
        totalSubscribedTo: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel) {
    throw new ApiError(404, "Channel not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, "Channel found Successfully", channel[0]));
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "Video",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "User",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: { $first: "$owner" },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        "Watch history found successfully",
        user[0].watchHistory
      )
    );
});

export {
  getWatchHistory,
  registerUser,
  loginUser,
  logoutUser,
  refreshAcessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountUpdate,
  updateAvatar,
  updateCoverAvatar,
  getUserChannelProfile,
};
