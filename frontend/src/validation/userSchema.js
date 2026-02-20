import { z } from "zod"
const objectIdRegex = /^[a-f\d]{24}$/i;
// const CompanyBranchSchema = z.object({
//   companyId: z.string().min(1, "Company is required"),
//   branches: z.array(z.string()).min(1, "At least one branch must be selected")
// })

export const UserSchema = z.object({
  userName: z.string().min(2, "User name must be at least 2 character"),
  address: z.string().min(2, "address must be at least 2 character"),
  email: z.string().email("Invalid email address"),
  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be 10 digits"),
  aadhar: z.string().length(12, "Aadhar number must be exactly 12 digits"),
  password: z.string().length(6, "Pasword must be exactly 6 digits"),
  companyName: z.string().min(1, "Company is required"),
  branchName: z.string().min(1, "Branch is required")
})

export const UserAccessSchema = z.object({
  userId: z.string().regex(objectIdRegex, "Invalid user id"),
  access: z.array(
    z.object({
      company: z.string().regex(objectIdRegex, "Invalid company id"),
      branches: z.array(z.string().regex(objectIdRegex, "Invalid branch id")),
    }),
  ),
});
