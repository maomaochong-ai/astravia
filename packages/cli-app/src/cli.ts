#!/usr/bin/env node
import { runCli } from "./index.js";

await runCli(process.argv.slice(2));
