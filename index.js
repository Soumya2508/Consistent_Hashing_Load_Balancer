const readline = require("readline");
const random = require("./randomRouting");
const consistent = require("./consistentHashing");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> "
});

function printHelp() {
  console.log(`
===== AVAILABLE COMMANDS =====

Random routing:
  add-random <name>              add a server
  remove-random <name>           remove a server
  test-random <ip> [count]       route an IP through the random load balancer
  simulate-random <count>        generate <count> random IPs and route each
  show-random                    show servers and stored requests

Consistent hashing:
  add-consistent <name> [weight] add a server (weight controls virtual node count)
  remove-consistent <name>       remove a server
  test-consistent <ip> [count]   route an IP through consistent hashing
  simulate-consistent <count>    generate <count> random IPs and route each
  ring                           show the hash ring (with routed requests overlay)
  metrics                        show per-server request counts and totals
  unhealthy <name>               mark a server as unhealthy
  healthy <name>                 mark a server as healthy again

Other:
  help                           show this help
  exit                           quit
`);
}

function handleCommand(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0];

  switch (cmd) {
    case "add-random":
      if (parts.length < 2) { console.log("Usage: add-random <name>"); break; }
      random.addServerRandomRouting(parts[1]);
      break;

    case "remove-random":
      if (parts.length < 2) { console.log("Usage: remove-random <name>"); break; }
      random.removeServerRandomRouting(parts[1]);
      break;

    case "test-random": {
      if (parts.length < 2) { console.log("Usage: test-random <ip> [count]"); break; }
      let count = 1;
      if (parts[2]) {
        count = parseInt(parts[2]);
        if (Number.isNaN(count) || count <= 0) {
          console.log("count must be a positive integer (e.g. test-random 1.1.1.1 5)");
          break;
        }
      }
      random.testRequestRandomRouting(parts[1], count);
      break;
    }

    case "show-random":
      random.showServersRandomRouting();
      break;

    case "simulate-random": {
      if (parts.length < 2) { console.log("Usage: simulate-random <count>"); break; }
      const count = parseInt(parts[1]);
      if (Number.isNaN(count) || count <= 0) {
        console.log("count must be a positive integer (e.g. simulate-random 10)");
        break;
      }
      random.simulateTrafficRandom(count);
      break;
    }

    case "add-consistent": {
      if (parts.length < 2) { console.log("Usage: add-consistent <name> [weight]"); break; }
      let weight = 1;
      if (parts[2]) {
        weight = parseInt(parts[2]);
        if (Number.isNaN(weight) || weight <= 0) {
          console.log("weight must be a positive integer (e.g. add-consistent Node-A 3)");
          break;
        }
      }
      consistent.addServerConsistentHashing(parts[1], weight);
      break;
    }

    case "remove-consistent":
      if (parts.length < 2) { console.log("Usage: remove-consistent <name>"); break; }
      consistent.removeServerConsistentHashing(parts[1]);
      break;

    case "test-consistent": {
      if (parts.length < 2) { console.log("Usage: test-consistent <ip> [count]"); break; }
      let count = 1;
      if (parts[2]) {
        count = parseInt(parts[2]);
        if (Number.isNaN(count) || count <= 0) {
          console.log("count must be a positive integer (e.g. test-consistent 1.1.1.1 5)");
          break;
        }
      }
      consistent.testRequestConsistentHashing(parts[1], count);
      break;
    }

    case "simulate-consistent": {
      if (parts.length < 2) { console.log("Usage: simulate-consistent <count>"); break; }
      const count = parseInt(parts[1]);
      if (Number.isNaN(count) || count <= 0) {
        console.log("count must be a positive integer (e.g. simulate-consistent 10)");
        break;
      }
      consistent.simulateTrafficConsistentHashing(count);
      break;
    }

    case "ring":
      consistent.showHashRing();
      break;

    case "metrics":
      consistent.showMetricsConsistentHashing();
      break;

    case "unhealthy":
      if (parts.length < 2) { console.log("Usage: unhealthy <name>"); break; }
      consistent.setHealthConsistentHashing(parts[1], false);
      break;

    case "healthy":
      if (parts.length < 2) { console.log("Usage: healthy <name>"); break; }
      consistent.setHealthConsistentHashing(parts[1], true);
      break;

    case "help":
      printHelp();
      break;

    case "exit":
      rl.close();
      return;

    case "":
      break;

    default:
      console.log(`Unknown command: ${cmd}. Type 'help' for the list.`);
  }
}

console.log("Load Balancer CLI - type 'help' for commands");
rl.prompt();

rl.on("line", (line) => {
  handleCommand(line);
  rl.prompt();
});

rl.on("close", () => {
  console.log("Bye!");
  process.exit(0);
});
