// Vérification manuelle (lecture seule) de la détection DefaultStatsAPI.ini
// Usage : node scripts/check-statsapi.cjs
const path = require("path");
const fs = require("fs");

function findStatsApiFiles() {
  const installDirs = new Set();

  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const steamRoots = [path.join(pf86, "Steam")];
  try {
    const vdf = fs.readFileSync(
      path.join(pf86, "Steam", "steamapps", "libraryfolders.vdf"),
      "utf-8",
    );
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      steamRoots.push(m[1].replace(/\\\\/g, "\\"));
    }
  } catch {}
  for (const root of steamRoots) {
    installDirs.add(path.join(root, "steamapps", "common", "rocketleague"));
  }

  const manifestsDir = path.join(
    process.env.ProgramData ?? "C:\\ProgramData",
    "Epic", "EpicGamesLauncher", "Data", "Manifests",
  );
  try {
    for (const f of fs.readdirSync(manifestsDir)) {
      if (!f.endsWith(".item")) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), "utf-8"));
        if (/rocket\s*league/i.test(m.DisplayName ?? "") && m.InstallLocation) {
          installDirs.add(m.InstallLocation);
        }
      } catch {}
    }
  } catch {}
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  installDirs.add(path.join(pf, "Epic Games", "rocketleague"));

  console.log("Dossiers candidats :");
  for (const d of installDirs) console.log("  -", d, fs.existsSync(d) ? "(existe)" : "");

  return [...installDirs]
    .map((dir) => path.join(dir, "TAGame", "Config", "DefaultStatsAPI.ini"))
    .filter((p) => fs.existsSync(p));
}

const files = findStatsApiFiles();
console.log("\nFichiers DefaultStatsAPI.ini trouvés :");
if (files.length === 0) console.log("  (aucun)");
for (const f of files) {
  const txt = fs.readFileSync(f, "utf-8");
  const m = txt.match(/^\s*PacketSendRate\s*=\s*(\S*)\s*$/m);
  console.log(`  - ${f}`);
  console.log(`    PacketSendRate = ${m ? m[1] : "(absent)"}`);
}
