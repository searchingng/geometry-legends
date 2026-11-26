import { randomBytes } from "node:crypto";
import { hashPassword } from "./AdminAuth.js";

const password = process.argv[2] ?? randomBytes(15).toString("base64url");
const generated = process.argv[2] === undefined;

if (generated) console.log(`ADMIN_PASSWORD (keep it secret): ${password}`);
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString("hex")}`);
