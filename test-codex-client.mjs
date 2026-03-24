import readline from "node:readline";
import { spawn } from "node:child_process";

const userPrompt =
  process.argv.slice(2).join(" ") ||
  "Summarize this project in 3 bullets.";

const projectDir = process.cwd();
let threadId = null;

// Windows-safe launch for Codex CLI
const codex =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "codex", "app-server"], {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      })
    : spawn("codex", ["app-server"], {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

codex.on("error", (err) => {
  console.error("[spawn error]", err);
});

codex.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  if (text.trim()) {
    console.error("[codex stderr]", text);
  }
});

codex.on("exit", (code) => {
  console.log(`\n[codex exited with code ${code}]`);
});

function send(msg) {
  codex.stdin.write(JSON.stringify(msg) + "\n");
}

const rl = readline.createInterface({ input: codex.stdout });

rl.on("line", (line) => {
  if (!line.trim()) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    console.log("[raw]", line);
    return;
  }

  // Uncomment if you want to inspect all traffic
  // console.log("[rpc]", JSON.stringify(msg, null, 2));

  // 1) initialize response
  if (msg.id === 1 && msg.result) {
    send({ method: "initialized", params: {} });
    send({
      method: "account/read",
      id: 2,
      params: { refreshToken: false },
    });
    return;
  }

  // 2) auth state
  if (msg.id === 2 && msg.result) {
    const account = msg.result.account;

    if (!account) {
      console.log("Not signed in. Run: codex login");
      codex.kill();
      return;
    }

    console.log(`[signed in as ${account.type}]`);

    // Minimal thread/start: no approvalPolicy or sandbox overrides
    send({
      method: "thread/start",
      id: 3,
      params: {
        model: "gpt-5.4",
        cwd: projectDir,
        serviceName: "my_test_client",
      },
    });
    return;
  }

  // 3) thread started
  if (msg.id === 3 && msg.result?.thread?.id) {
    threadId = msg.result.thread.id;
    console.log(`[thread started: ${threadId}]`);

    // Minimal turn/start: only thread + input
    send({
      method: "turn/start",
      id: 4,
      params: {
        threadId,
        input: [{ type: "text", text: userPrompt }],
      },
    });
    return;
  }

  // 4) streamed text
  if (msg.method === "item/agentMessage/delta") {
    const delta = msg.params?.delta ?? "";
    process.stdout.write(delta);
    return;
  }

  // 5) approval requests
  if (msg.method === "item/commandExecution/requestApproval") {
    console.log("\n[command approval requested]");
    console.log(JSON.stringify(msg.params, null, 2));
    return;
  }

  if (msg.method === "item/fileChange/requestApproval") {
    console.log("\n[file change approval requested]");
    console.log(JSON.stringify(msg.params, null, 2));
    return;
  }

  // 6) completion
  if (msg.method === "item/completed") {
    const item = msg.params?.item;
    if (item?.type === "agentMessage") {
      process.stdout.write("\n\n[done]\n");
    }
    return;
  }

  if (msg.method === "turn/completed") {
    console.log("[turn completed]");
    codex.kill();
    return;
  }

  if (msg.method === "account/updated") {
    console.log(`\n[auth mode: ${msg.params?.authMode}]`);
    return;
  }

  if (msg.method === "account/login/completed") {
    console.log("\n[login completed]", msg.params);
    return;
  }

  if (msg.error) {
    console.error("\n[rpc error]", JSON.stringify(msg.error, null, 2));
    codex.kill();
  }
});

// Start handshake
send({
  method: "initialize",
  id: 1,
  params: {
    clientInfo: {
      name: "my_test_client",
      title: "My Test Client",
      version: "0.1.0",
    },
  },
});