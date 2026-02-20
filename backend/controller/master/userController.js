import CompanySettingsModel from "../../model/CompanySettings.model.js";
import UserModel from "../../model/userModel.js";
import mongoose from "mongoose";
import BranchModel from "../../model/masters/BranchModel.js";
export const createUsers = async (req, res) => {
  try {
    const {
      userName,
      email,
      password,
      aadharNumber,
      mobile,
      address,
      companyName,
      branchName,
    } = req.body;
    if (!userName || !email) {
      return res.status(400).json({ message: "name and email are required" });
    }
    const existingUser = await UserModel.findOne({
      name: userName,
    });
    if (existingUser) {
      return res.status(409).json({ message: "user already exist" });
    }
    const newUser = new UserMOdel({
      name: userName,
      email,
      password,
      aadharNumber: Number(aadharNumber),
      mobile,
      address,
    });
    if (companyName && branchName) {
      newUser.access = [
        {
          company: companyName,
          branches: branchName,
        },
      ];
    }
    await newUser.save();
    res.status(201).json({
      message: "user created successfully",
    });
  } catch (error) {
    console.log("error", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/// get user by id
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    let user = await UserModel.findById(id)
      .select("-password")
      .populate({
        path: "access.company",
        // select: "companyName _id", // keep full for now; you can limit later
      })
      .populate({
        path: "access.branches",
        select: "branchName _id",
      })
      .lean(); // so we can modify object easily

    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }

    const companies = Array.isArray(user.access)
      ? user.access.map((a) => a.company)
      : [];

    if (companies.length > 0) {
      const companyIds = companies.map((c) => c._id);

      const settingsDocs = await CompanySettingsModel.find({
        company: { $in: companyIds },
      })
        .lean()
        .select("company financialYear");

      const settingsMap = new Map(
        settingsDocs.map((s) => [s.company.toString(), s]),
      );

      const withSettings = companies.map((c) => {
        const s = settingsMap.get(c._id.toString());
        return {
          ...c,
          settings: s ? s.financialYear : null, // or whole s if you prefer
        };
      });


      // Put back in user object in same shape (array or single)
      if (Array.isArray(user.access)) {
        user.access = user.access.map((a) => {
          const companyWithSettings = withSettings.find(
            (c) => c._id.toString() === a.company._id.toString(),
          );
          return {
            ...a,
            company: companyWithSettings || a.company, // fallback to original if not found
          };
        });
      } else {
        const companyWithSettings = withSettings.find(
          (c) => c._id.toString() === user.access.company._id.toString(),
        );
        user.access.company = companyWithSettings || user.access.company; // fallback to original if not found
      }
    }

    return res.status(200).json({
      message: "user found",
      data: user,
    });
  } catch (error) {
    console.log("error", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUserAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { access = [] } = req.body;

    const loggedInUserId = req.user?._id?.toString();
    const isAdmin = req.user?.role?.toLowerCase?.() === "admin";

    if (!loggedInUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin && loggedInUserId !== id) {
      return res.status(403).json({
        message: "You are not allowed to update this user access",
      });
    }

    if (!Array.isArray(access)) {
      return res.status(400).json({ message: "Access must be an array" });
    }

    const normalizedAccess = [];

    for (const entry of access) {
      const companyId = entry?.company;
      const branchIds = Array.isArray(entry?.branches) ? entry.branches : [];

      if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
        return res.status(400).json({ message: "Invalid company in access" });
      }

      const uniqueBranchIds = [...new Set(branchIds)].filter((branchId) =>
        mongoose.Types.ObjectId.isValid(branchId),
      );

      if (uniqueBranchIds.length !== branchIds.length) {
        return res.status(400).json({ message: "Invalid branch in access" });
      }

      if (uniqueBranchIds.length > 0) {
        const validBranchCount = await BranchModel.countDocuments({
          _id: { $in: uniqueBranchIds },
          companyId: companyId,
        });

        if (validBranchCount !== uniqueBranchIds.length) {
          return res.status(400).json({
            message: "Some branches do not belong to the selected company",
          });
        }
      }

      normalizedAccess.push({
        company: companyId,
        branches: uniqueBranchIds,
      });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      id,
      { access: normalizedAccess },
      { new: true, runValidators: true },
    )
      .select("-password")
      .populate({
        path: "access.company",
      })
      .populate({
        path: "access.branches",
        select: "branchName _id",
      });

    if (!updatedUser) {
      return res.status(404).json({ message: "user not found" });
    }

    return res.status(200).json({
      message: "User access updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.log("error", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
