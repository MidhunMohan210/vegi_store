import CompanySettingsModel from "../../model/CompanySettings.model.js";
import UserModel from "../../model/userModel.js";
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

    // Normalize to array
    const companies = Array.isArray(user.access?.company)
      ? user.access.company
      : user.access?.company
      ? [user.access.company]
      : [];

    if (companies.length > 0) {
      const companyIds = companies.map((c) => c._id);

      const settingsDocs = await CompanySettingsModel.find({
        company: { $in: companyIds },
      })
        .lean()
        .select("company financialYear");

      const settingsMap = new Map(
        settingsDocs.map((s) => [s.company.toString(), s])
      );

      const withSettings = companies.map((c) => {
        const s = settingsMap.get(c._id.toString());
        return {
          ...c,
          settings: s ? s.financialYear : null, // or whole s if you prefer
        };
      });

      // Put back in user object in same shape (array or single)
      if (Array.isArray(user.access.company)) {
        user.access.company = withSettings;
      } else {
        user.access.company = withSettings[0] || null;
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