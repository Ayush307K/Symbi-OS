import { NextResponse } from "next/server";
import { getAuthFromCookie, type JWTPayload } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function requireAuth(): Promise<
  | { auth: JWTPayload }
  | { response: NextResponse<{ error: string }> }
> {
  const auth = await getAuthFromCookie();
  if (!auth) {
    return {
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
  return { auth };
}

export function parsePositiveInt(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export function isValidIndianPincode(value: string) {
  return /^[1-9][0-9]{5}$/.test(value);
}

export function serviceabilityForPincode(pincode: string) {
  if (!isValidIndianPincode(pincode)) {
    return { serviceable: false, city: "", state: "", message: "Enter a valid 6-digit Indian pincode." };
  }

  const prefix = pincode.slice(0, 2);
  const regions: Record<string, { state: string; city: string }> = {
    "11": { state: "Delhi", city: "Delhi" },
    "12": { state: "Haryana", city: "Gurugram" },
    "13": { state: "Haryana", city: "Panipat" },
    "14": { state: "Punjab", city: "Ludhiana" },
    "16": { state: "Punjab", city: "Chandigarh" },
    "17": { state: "Himachal Pradesh", city: "Shimla" },
    "18": { state: "Jammu and Kashmir", city: "Jammu" },
    "20": { state: "Uttar Pradesh", city: "Ghaziabad" },
    "22": { state: "Uttar Pradesh", city: "Varanasi" },
    "24": { state: "Uttar Pradesh", city: "Bareilly" },
    "30": { state: "Rajasthan", city: "Jaipur" },
    "31": { state: "Rajasthan", city: "Udaipur" },
    "32": { state: "Rajasthan", city: "Kota" },
    "36": { state: "Gujarat", city: "Rajkot" },
    "37": { state: "Gujarat", city: "Kutch" },
    "38": { state: "Gujarat", city: "Ahmedabad" },
    "39": { state: "Gujarat", city: "Vadodara" },
    "40": { state: "Maharashtra", city: "Mumbai" },
    "41": { state: "Maharashtra", city: "Pune" },
    "42": { state: "Maharashtra", city: "Nashik" },
    "44": { state: "Maharashtra", city: "Nagpur" },
    "45": { state: "Madhya Pradesh", city: "Indore" },
    "46": { state: "Madhya Pradesh", city: "Bhopal" },
    "49": { state: "Chhattisgarh", city: "Raipur" },
    "50": { state: "Telangana", city: "Hyderabad" },
    "51": { state: "Andhra Pradesh", city: "Anantapur" },
    "52": { state: "Andhra Pradesh", city: "Vijayawada" },
    "53": { state: "Andhra Pradesh", city: "Visakhapatnam" },
    "56": { state: "Karnataka", city: "Bengaluru" },
    "57": { state: "Karnataka", city: "Mysuru" },
    "58": { state: "Karnataka", city: "Hubballi" },
    "60": { state: "Tamil Nadu", city: "Chennai" },
    "62": { state: "Tamil Nadu", city: "Madurai" },
    "64": { state: "Tamil Nadu", city: "Coimbatore" },
    "67": { state: "Kerala", city: "Kozhikode" },
    "68": { state: "Kerala", city: "Kochi" },
    "70": { state: "West Bengal", city: "Kolkata" },
    "71": { state: "West Bengal", city: "Howrah" },
    "75": { state: "Odisha", city: "Bhubaneswar" },
    "76": { state: "Odisha", city: "Rourkela" },
    "80": { state: "Bihar", city: "Patna" },
    "83": { state: "Jharkhand", city: "Jamshedpur" },
  };

  const region = regions[prefix] ?? { state: "India", city: "India" };
  return { serviceable: true, ...region, message: "Serviceable for marketplace orders." };
}

export function orderNumber() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `SYM-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function notify(userId: string | null | undefined, type: string, title: string, body: string, actionUrl?: string) {
  if (!userId) return;
  await prisma.notification.create({
    data: { userId, type, title, body, actionUrl },
  });
}
