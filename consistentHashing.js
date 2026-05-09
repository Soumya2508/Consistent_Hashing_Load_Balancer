const crypto = require("crypto");
const { identifyNode } = require("./utils");

// Consistent hashing state
let consistentServers = [];
let hashRing = [];

// Used MD5 and took the first 4 hex chars to keep a readable 16-bit hash space (0 - 65535)
function hashKey(key) {
  const hash = crypto.createHash("md5").update(key).digest("hex");
  return parseInt(hash.substring(0, 4), 16);
}

function addServerConsistentHashing(name, weight) {
  for (let server of consistentServers) {
    if (server.name === name) {
      console.log("Server already exists");
      return;
    }
  }
  // Defaulted weight to 1 so a missing weight still works
  if (!weight || weight < 1) {
    weight = 1;
  }
  consistentServers.push({ name, weight });
  buildHashRing();
  console.log(`Added ${name} (weight ${weight}) to consistent hashing`);
  showHashRing();
}

function removeServerConsistentHashing(name) {
  let foundIdx = -1;
  for (let i = 0; i < consistentServers.length; i++) {
    if (consistentServers[i].name === name) {
      foundIdx = i;
      break;
    }
  }
  if (foundIdx === -1) {
    console.log("Server does not exist");
    return;
  }
  consistentServers.splice(foundIdx, 1);
  buildHashRing();
  console.log(`Removed ${name} from consistent hashing`);
  showHashRing();
}

// Rebuilt the ring after every server add or remove
// Each server gets `weight` virtual nodes spread across the ring for better balance
function buildHashRing() {
  hashRing = [];
  for (let server of consistentServers) {
    for (let i = 0; i < server.weight; i++) {
      const virtualNode = `${server.name}#${i}`;
      hashRing.push({
        virtualNode: virtualNode,
        actualNode: server.name,
        hashValue: hashKey(virtualNode)
      });
    }
  }
  // Sorted ascending so we can walk clockwise
  hashRing.sort((a, b) => a.hashValue - b.hashValue);
}

function loadBalancerConsistentHashing(ip) {
  if (hashRing.length === 0) {
    console.log("No servers available");
    return null;
  }

  const ipHash = hashKey(ip);

  // Picked the first virtual node with hashValue >= ipHash (clockwise)
  // Returned the actual physical server name, not the virtual node label
  for (let entry of hashRing) {
    if (ipHash <= entry.hashValue) {
      identifyNode(ip, entry.actualNode);
      return entry.actualNode;
    }
  }

  // Wrapped around to the first virtual node in the ring
  const first = hashRing[0];
  identifyNode(ip, first.actualNode);
  return first.actualNode;
}

function testRequestConsistentHashing(ip, count = 1) {
  for (let i = 0; i < count; i++) {
    loadBalancerConsistentHashing(ip);
  }
}

function showHashRing() {
  console.log("\n===== CONSISTENT HASH RING =====");
  if (hashRing.length === 0) {
    console.log("(empty)");
    console.log("");
    return;
  }
  for (let entry of hashRing) {
    console.log(`${entry.hashValue} -> ${entry.virtualNode}`);
  }
  console.log("");
}

module.exports = {
  addServerConsistentHashing,
  removeServerConsistentHashing,
  loadBalancerConsistentHashing,
  testRequestConsistentHashing,
  showHashRing
};
