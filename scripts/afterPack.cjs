/**
 * Hook electron-builder : installe les dépendances du serveur
 * directement dans le dossier packagé (resources/server/).
 *
 * Avantages vs copier node_modules depuis la source :
 *  - Pas de symlinks cassés (ex: "rl-overlay": "file:..")
 *  - npm installe proprement pour l'environnement cible
 *  - Toujours cohérent avec le package.json embarqué
 */

const { execSync } = require('child_process');
const path         = require('path');
const fs           = require('fs');

exports.default = async function afterPack(context) {
  const serverDir = path.join(context.appOutDir, 'resources', 'server');

  if (!fs.existsSync(serverDir)) {
    console.warn('[afterPack] resources/server not found — skipping npm install');
    return;
  }

  console.log(`[afterPack] npm install --omit=dev in ${serverDir}`);
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd:   serverDir,
    stdio: 'inherit',
  });
  console.log('[afterPack] Server dependencies installed ✓');
};
