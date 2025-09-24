import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
const userSchema = new Schema(
  {
    name: { type: String, required: [true, "Name is required"] },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      match: [/\S+@\S+\.\S+/, "Please use a valid email address"],
    },
    mobile: { type: String, match: /^[0-9]{10}$/ },
    password: { type: String, required: [true, "Password is required"] },
    role: { type: String, required: [true, "Role is required"] },
    aadharNumber: { type: Number, unique: true, sparse: true },
    address: { type: String },

    access: [
      {
        company: { type: Schema.Types.ObjectId, ref: "Company" },
        branches: [{ type: Schema.Types.ObjectId, ref: "Branch" }],
      },
    ],
  },
  { timestamps: true }
);
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});
const User = mongoose.model("User", userSchema);
export default User;
