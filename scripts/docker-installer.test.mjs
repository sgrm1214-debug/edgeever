import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const installerPath = resolve(projectRoot, "apps/site/public/install.sh");
const composePath = resolve(projectRoot, "compose.yaml");
const hostedComposePath = resolve(projectRoot, "apps/site/public/compose.yaml");

describe("Docker installer", () => {
  test("publishes the repository Compose file unchanged", async () => {
    expect(await readFile(hostedComposePath, "utf8")).toBe(await readFile(composePath, "utf8"));
  });

  test("installs with TCR and preserves the generated password on rerun", async () => {
    const fixture = await mkdtemp(resolve(tmpdir(), "edgeever-installer-"));
    const fakeBin = resolve(fixture, "bin");
    const installDirectory = resolve(fixture, "edgeever");
    const dockerLog = resolve(fixture, "docker.log");
    const curlLog = resolve(fixture, "curl.log");
    const fakeDocker = resolve(fakeBin, "docker");
    const fakeCurl = resolve(fakeBin, "curl");

    try {
      await mkdir(fakeBin, { recursive: true });
      await writeFile(
        fakeDocker,
        `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$EDGE_EVER_TEST_DOCKER_LOG"
if [[ "$1" == "inspect" ]]; then
  printf 'healthy\\n'
elif [[ "$1" == "compose" && "$*" == *" ps -q edgeever"* ]]; then
  printf 'edgeever-test-container\\n'
fi
`,
      );
      await writeFile(
        fakeCurl,
        `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$EDGE_EVER_TEST_CURL_LOG"
output=''
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output" ]]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
cp "$EDGE_EVER_TEST_COMPOSE_SOURCE" "$output"
`,
      );
      await chmod(fakeDocker, 0o755);
      await chmod(fakeCurl, 0o755);

      const environment = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        EDGE_EVER_INSTALL_DIR: installDirectory,
        EDGE_EVER_TEST_COMPOSE_SOURCE: composePath,
        EDGE_EVER_TEST_CURL_LOG: curlLog,
        EDGE_EVER_TEST_DOCKER_LOG: dockerLog,
      };
      const first = spawnSync("bash", [installerPath, "--mirror", "tcr", "--port", "18789"], {
        env: environment,
        encoding: "utf8",
        stdio: ["ignore", "ignore", "pipe"],
      });
      if (first.status !== 0) {
        const commands = await readFile(dockerLog, "utf8").catch(() => "no Docker commands");
        throw new Error(
          `installer failed (exit=${first.status}, signal=${first.signal}):\n${first.stderr}\n${commands}`,
        );
      }
      expect(first.status).toBe(0);

      const firstEnvironment = await readFile(resolve(installDirectory, ".env"), "utf8");
      expect(firstEnvironment).toContain(
        "EDGE_EVER_IMAGE='ccr.ccs.tencentyun.com/edgeever/edgeever'",
      );
      expect(firstEnvironment).toContain("EDGE_EVER_VERSION='latest'");
      expect(firstEnvironment).toContain("EDGE_EVER_PORT='18789'");
      expect(firstEnvironment).toMatch(/EDGE_EVER_AUTH_PASSWORD='[a-f0-9]{32}'/);

      const second = spawnSync("bash", [installerPath], {
        env: environment,
        encoding: "utf8",
        stdio: ["ignore", "ignore", "pipe"],
      });
      if (second.status !== 0) {
        throw new Error(
          `installer rerun failed (exit=${second.status}, signal=${second.signal}):\n${second.stdout}\n${second.stderr}`,
        );
      }
      expect(second.status).toBe(0);
      expect(await readFile(resolve(installDirectory, ".env"), "utf8")).toBe(firstEnvironment);

      const log = await readFile(dockerLog, "utf8");
      expect(log).toContain("compose version");
      expect(log.match(/ pull$/gm)).toHaveLength(2);
      expect(log.match(/ up -d --remove-orphans$/gm)).toHaveLength(2);
      expect(log).toContain("inspect --format");
      const curlRequests = await readFile(curlLog, "utf8");
      expect(
        curlRequests.match(
          /edgeever-installer-1256854452\.cos\.ap-guangzhou\.myqcloud\.com\/compose\.yaml/g,
        ),
      ).toHaveLength(2);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
