import fs from "fs";
import path from "path";

console.log("=== INSPECTING ALL ENV FILES IN WORKSPACE ===");

const files = [".env", ".env.local", ".env.development", ".env.production"];
files.forEach((f) => {
  const p = path.resolve(process.cwd(), f);
  if (fs.existsSync(p)) {
    console.log(`Found ${f}:`);
    const content = fs.readFileSync(p, "utf-8");
    console.log(content);
  }
});
