import { z } from "zod";

export const CompanySchema = z.object({
  companyName: z.string().min(2, "Company Name must be at least 2 characters"),
  companyType: z.string().optional(),
  registrationNumber: z.string().optional(),
  incorporationDate: z.string().optional(),
  permanentAddress: z.string().optional(),
  residentialAddress: z.string().optional(),
  email: z.string().email("Invalid email address"),
  notificationEmail: z.string().email("Invalid email address").optional(),
  mobile: z.string().optional(),
  landline: z.string().optional(),
  // gstNumber: z.string().optional(),
  // panNumber: z.string().optional(),
  gstNumber: z
    .string()
    .regex(/^\d{15}$/, "GST Number must be 15 digits")
    .optional(),

  panNumber: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format")
    .optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  authorizedSignatory: z.string().optional(),
  numEmployees: z.number().optional(),
  createdBy: z.string().optional()
});
