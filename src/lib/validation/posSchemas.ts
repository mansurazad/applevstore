import { z } from "zod";

/**
 * Validation schemas for POS inputs.
 * Kept lightweight & client-side only — server-side RLS already gates writes.
 */

/** Bangladesh mobile: 11 digits starting with 01, optional +88 prefix. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?88)?01[3-9]\d{8}$/,
    "মোবাইল নম্বর সঠিক নয় (১১ ডিজিট, ০১ দিয়ে শুরু)"
  );

/** Optional phone — empty string passes. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^(?:\+?88)?01[3-9]\d{8}$/.test(v),
    { message: "মোবাইল নম্বর সঠিক নয় (১১ ডিজিট, ০১ দিয়ে শুরু)" }
  );

/** IMEI: exactly 15 digits. */
export const imeiSchema = z
  .string()
  .trim()
  .regex(/^\d{15}$/, "IMEI অবশ্যই ১৫ ডিজিটের সংখ্যা হতে হবে");

/** Customer name when provided as instant customer. */
export const instantCustomerNameSchema = z
  .string()
  .trim()
  .max(100, "নাম ১০০ অক্ষরের বেশি হতে পারবে না");

/** Single cart item — used to compose the sale schema. */
export const cartItemSchema = z.object({
  product_id: z.string().min(1, "পণ্য নির্বাচন করুন"),
  quantity: z
    .number({ invalid_type_error: "পরিমাণ সংখ্যা হতে হবে" })
    .int("পরিমাণ পূর্ণসংখ্যা হতে হবে")
    .positive("পরিমাণ ০ এর বেশি হতে হবে"),
  unit_price: z
    .number({ invalid_type_error: "মূল্য সংখ্যা হতে হবে" })
    .nonnegative("মূল্য ০ বা তার বেশি হতে হবে"),
  total_price: z.number().nonnegative(),
});

/** Whole sale payload. */
export const saleSchema = z
  .object({
    customer_id: z.string().nullable().optional(),
    total_amount: z.number().positive("মোট মূল্য ০ এর বেশি হতে হবে"),
    payment_method: z.enum(["cash", "card", "mobile", "credit", "bank"], {
      errorMap: () => ({ message: "পেমেন্ট পদ্ধতি বৈধ নয়" }),
    }),
    paid_amount: z.number().nonnegative("প্রদত্ত মূল্য ঋণাত্মক হতে পারবে না"),
    due_amount: z.number().nonnegative(),
    instant_customer_name: z.string().nullable().optional(),
    instant_customer_phone: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    items: z.array(cartItemSchema).min(1, "কার্ট খালি"),
  })
  .superRefine((data, ctx) => {
    if (data.paid_amount > data.total_amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "প্রদত্ত মূল্য মোট মূল্যের চেয়ে বেশি হতে পারবে না",
        path: ["paid_amount"],
      });
    }
    // If credit/due, a tracked customer must be linked so we can collect later.
    if (data.due_amount > 0 && !data.customer_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "বাকি বিক্রয়ের জন্য নিবন্ধিত ক্রেতা নির্বাচন করুন (Instant ক্রেতার বাকি ট্র্যাক করা যাবে না)",
        path: ["customer_id"],
      });
    }
    // Instant customer phone format check (only if provided)
    const phone = (data.instant_customer_phone ?? "").trim();
    if (phone && !/^(?:\+?88)?01[3-9]\d{8}$/.test(phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Instant ক্রেতার মোবাইল নম্বর সঠিক নয়",
        path: ["instant_customer_phone"],
      });
    }
  });

export type SaleInput = z.infer<typeof saleSchema>;