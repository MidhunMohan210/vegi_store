// import mongoose from "mongoose";


// const UserSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     email: { type: String, required: true, unique: true },
//     password: { type: String, required: true },
//     aadharNumber: { type: Number, required: true },
//     mobile: { type: String, required: true },
//     address: { type: String, required: true },
//     access: [{
//         company: { type: mongoose.Types.ObjectId, ref: "Company", required: true },
//         branches: [{ type: mongoose.Types.ObjectId, ref: "Branch" }]
//     }]
// }, { timestamps: true })
// export default UserSchema