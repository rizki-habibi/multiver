#!/usr/bin/env node
/**
 * link-global.js — Daftarkan `multiver` CLI sebagai global command tanpa publish ke npm.
 *
 * Windows:  npm.cmd ..\.. --prefix <repo> install -g .    (npm pack + install tarball)
 * Fallback: membuat shim .cmd di npm global prefix yang memanggil cli.js langsung.
 *
 * Jalankan:  node cli/link-global.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliEntry = path.join(__dirname, "cli.js");

function log(msg) { console.log(`[multiver-link] ${msg}`); }

function getNpmGlobalPrefix() {
  try {
    return execSync("npm config get prefix", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function main() {
  log(`Repo: ${repoRoot}`);
  log(`CLI entry: ${cliEntry}`);

  const prefix = getNpmGlobalPrefix();
  if (!prefix) {
    log("ERROR: tidak bisa membaca npm global prefix. Pastikan npm terinstall.");
    process.exit(1);
  }
  log(`NPM global prefix: ${prefix}`);

  // Coba cara resmi: install paket lokal secara global (tarball) — akan mendaftarkan bin "multiver".
  try {
    log("Mencoba: npm install -g . (tarball install)...");
    execSync("npm install -g . --no-audit --no-fund", {
      cwd: path.join(repoRoot, "cli"),
      stdio: "inherit",
      windowsHide: true,
    });
    log("✅ Terinstall via npm global (tarball). Coba: multiver --version");
    return;
  } catch (e) {
    log(`npm install -g gagal (${e.message.split("\n")[0]}), beralih ke shim manual...`);
  }

  // Fallback: buat shim .cmd di prefix (Windows) atau symlink (Unix).
  const ext = process.platform === "win32" ? ".cmd" : "";
  const shimPath = path.join(prefix, `multiver${ext}`);
  const nodeBin = process.execPath;

  let shimContent;
  if (process.platform === "win32") {
    shimContent = `@echo off\r\n"${nodeBin}" "${cliEntry}" %*\r\n`;
  } else {
    shimContent = `#!/bin/sh\r\nexec "${nodeBin}" "${cliEntry}" "$@"\r\n`;
  }

  try {
    fs.writeFileSync(shimPath, shimContent);
    if (process.platform !== "win32") fs.chmodSync(shimPath, 0o755);
    log(`✅ Shim dibuat: ${shimPath}`);
    log("Coba: multiver --version");
  } catch (e) {
    log(`ERROR membuat shim: ${e.message}`);
    process.exit(1);
  }
}

main();
