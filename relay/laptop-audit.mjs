import { readFile } from "node:fs/promises";
import { auditLaptops } from "../connectors/intune/index.mjs";

if (process.argv.length !== 3) throw Error("Supply the issued-laptop inventory JSON path");
const inventory = JSON.parse(await readFile(process.argv[2], "utf8"));
console.log(JSON.stringify(await auditLaptops(inventory, process.env.INTUNE_ACCESS_TOKEN), null, 2));
