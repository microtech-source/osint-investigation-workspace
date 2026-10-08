import { SignJWT } from "jose";
export async function createSession(){const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw new Error("SESSION_SECRET must be at least 32 characters");return new SignJWT({sub:"owner"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(new TextEncoder().encode(secret))}
