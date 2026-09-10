import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDirectory = resolve(repositoryRoot, "backend");
const environmentFile = resolve(repositoryRoot, ".env");

const virtualEnvironmentPython =
  process.platform === "win32"
    ? [
        resolve(repositoryRoot, ".venv", "Scripts", "python.exe"),
        resolve(backendDirectory, ".venv", "Scripts", "python.exe"),
      ]
    : [
        resolve(repositoryRoot, ".venv", "bin", "python"),
        resolve(backendDirectory, ".venv", "bin", "python"),
      ];

const pythonExecutable = virtualEnvironmentPython.find(existsSync);

if (!pythonExecutable) {
  console.error(
    [
      "MathSmart could not find a Python virtual environment.",
      "Create .venv at the repository root and install backend/requirements.txt, then run npm run dev again.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!existsSync(environmentFile)) {
  console.error(
    "MathSmart could not find the repository .env file. Create it from .env.example, then run npm run dev again.",
  );
  process.exit(1);
}

const api = spawn(
  pythonExecutable,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    backendDirectory,
    "--env-file",
    environmentFile,
    "--reload",
    "--reload-dir",
    backendDirectory,
    "--port",
    "8000",
  ],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);

let shuttingDown = false;

function stopApi(signal) {
  if (shuttingDown || api.exitCode !== null) {
    return;
  }

  shuttingDown = true;
  api.kill(signal);
}

process.once("SIGINT", () => stopApi("SIGINT"));
process.once("SIGTERM", () => stopApi("SIGTERM"));

api.once("error", (error) => {
  console.error(`MathSmart could not start the API: ${error.message}`);
  process.exitCode = 1;
});

api.once("exit", (code, signal) => {
  if (typeof code === "number") {
    process.exitCode = code;
    return;
  }

  process.exitCode = signal && !shuttingDown ? 1 : 0;
});
