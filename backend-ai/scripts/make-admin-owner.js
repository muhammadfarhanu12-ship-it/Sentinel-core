const { existsSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pythonCandidates = process.platform === 'win32'
  ? [
      path.join(root, 'venv', 'Scripts', 'python.exe'),
      'python',
      'py',
    ]
  : [
      path.join(root, 'venv', 'bin', 'python'),
      'python3',
      'python',
    ];

const python = pythonCandidates.find((candidate) => candidate.includes(path.sep) ? existsSync(candidate) : true);
if (!python) {
  console.error('Unable to locate a Python interpreter for make-admin-owner.');
  process.exit(1);
}

const scriptPath = path.join(__dirname, 'make_admin_owner.py');
const result = spawnSync(python, [scriptPath, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
