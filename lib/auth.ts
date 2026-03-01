import { betterAuth } from "better-auth";
import { dash } from "@better-auth/infra";

export const auth = betterAuth({
  baseURL: "http://localhost:3000/",
  plugins: [
    dash()
  ]
});
