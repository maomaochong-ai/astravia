const fs = require("fs");
const s = fs.readFileSync("bun.lock", "utf8");
const lines = s.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("ignore")) {
    console.log(i, JSON.stringify(lines[i].slice(0, 140)));
  }
}
