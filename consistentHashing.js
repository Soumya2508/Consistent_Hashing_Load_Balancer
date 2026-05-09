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

function addServerConsistentHashing(name) {
  for (let server of consistentServers) {
    if (server.name === name) {
      console.log("Server already exists");
      return;
    }
  }
  consistentServers.push({ name });
  buildHashRing();
  console.log(`Added ${name} to consistent hashing`);
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
function buildHashRing() {
  hashRing = [];
  for (let server of consistentServers) {
    hashRing.push({
      node: server.name,
      hashValue: hashKey(server.name)
    });
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

  // Picked the first server with hashValue >= ipHash (clockwise)
  for (let entry of hashRing) {
    if (ipHash <= entry.hashValue) {
      identifyNode(ip, entry.node);
      return entry.node;
    }
  }

  // Wrapped around to the first server in the ring
  const first = hashRing[0];
  identifyNode(ip, first.node);
  return first.node;
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
    console.log(`${entry.hashValue} -> ${entry.node}`);
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
