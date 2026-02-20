import mongoose from "mongoose";
const BranchSchema = new mongoose.Schema(
    {
        companyId: {
            type: String,
            required: [true, "Company name is required"],
        },
        branchName: {
            type: String, required: [true, "Branch name is required"],
            minlength: [2, "Minimum 2 characters required"],
            trim: true
        },
        address: {
            type: String,
            required: true,
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
        },
        country: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        mobile: {
            type: String,
            required: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        landline: { type: String },
        status: { type: String }

    },
    { timestamps: true })
export default BranchSchema
