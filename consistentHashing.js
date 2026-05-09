const crypto = require("crypto");
const { identifyNode } = require("./utils");

// Consistent hashing state
let consistentServers = [];
let hashRing = [];

// Metrics state
let metrics = {};            // { "Node-A": 12, ... } counts only physical servers
let totalRequests = 0;
let blockedRequests = 0;
let routedRequests = [];     // [{ ip, hashValue, routedTo }] - display overlay only

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
  // Defaulted healthy to true so a fresh server starts taking traffic immediately
  consistentServers.push({ name, weight, healthy: true });
  buildHashRing();
  console.log(`Added ${name} (weight ${weight}) to consistent hashing`);
  showHashRing();
}

// One internal helper, two REPL commands - keeps the intent explicit
function setHealthConsistentHashing(name, desiredState) {
  let target = null;
  for (let server of consistentServers) {
    if (server.name === name) {
      target = server;
      break;
    }
  }
  if (target === null) {
    console.log("Server does not exist");
    return;
  }
  if (target.healthy === desiredState) {
    if (desiredState === false) {
      console.log("Server already unhealthy");
    } else {
      console.log("Server already healthy");
    }
    return;
  }
  target.healthy = desiredState;
  if (desiredState === false) {
    console.log(`${name} marked UNHEALTHY`);
  } else {
    console.log(`${name} marked HEALTHY`);
  }
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

// Looked up the healthy flag for the physical server that owns a virtual node
function isHealthy(actualNode) {
  for (let server of consistentServers) {
    if (server.name === actualNode) {
      return server.healthy;
    }
  }
  return false;
}

function loadBalancerConsistentHashing(ip) {
  if (hashRing.length === 0) {
    console.log("No servers available");
    return null;
  }

  const ipHash = hashKey(ip);

  // Found the starting index on the ring (first virtual node with hashValue >= ipHash)
  let startIdx = 0;
  let foundStart = false;
  for (let i = 0; i < hashRing.length; i++) {
    if (ipHash <= hashRing[i].hashValue) {
      startIdx = i;
      foundStart = true;
      break;
    }
  }
  if (!foundStart) {
    // Wrapped around to the first virtual node
    startIdx = 0;
  }

  // Walked clockwise from startIdx, skipped unhealthy nodes
  for (let step = 0; step < hashRing.length; step++) {
    const idx = (startIdx + step) % hashRing.length;
    const entry = hashRing[idx];
    if (isHealthy(entry.actualNode)) {
      // Updated metrics and recorded the routed request for the ring overlay
      totalRequests++;
      if (!metrics[entry.actualNode]) {
        metrics[entry.actualNode] = 0;
      }
      metrics[entry.actualNode]++;
      routedRequests.push({
        ip: ip,
        hashValue: ipHash,
        routedTo: entry.actualNode
      });
      identifyNode(ip, entry.actualNode);
      return entry.actualNode;
    }
  }

  console.log("No healthy server available");
  return null;
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

  // Built a merged display list (server entries + routed requests) sorted by hash
  // The actual hashRing is never mutated - this overlay is display-only
  const display = [];
  for (let entry of hashRing) {
    display.push({
      kind: "SERVER",
      hashValue: entry.hashValue,
      virtualNode: entry.virtualNode,
      actualNode: entry.actualNode
    });
  }
  for (let req of routedRequests) {
    display.push({
      kind: "REQUEST",
      hashValue: req.hashValue,
      ip: req.ip,
      routedTo: req.routedTo
    });
  }
  display.sort((a, b) => a.hashValue - b.hashValue);

  for (let item of display) {
    if (item.kind === "SERVER") {
      const tag = isHealthy(item.actualNode) ? "[HEALTHY]" : "[UNHEALTHY]";
      console.log(`${item.hashValue} -> [SERVER]  ${item.virtualNode} ${tag}`);
    } else {
      console.log(`${item.hashValue} -> [REQUEST] ${item.ip} -> ${item.routedTo}`);
    }
  }
  console.log("");
}

function showMetricsConsistentHashing() {
  console.log("\n===== METRICS =====");
  if (totalRequests === 0) {
    console.log("(no requests routed yet)");
    console.log("");
    return;
  }
  for (let server of consistentServers) {
    const count = metrics[server.name] || 0;
    const percent = ((count / totalRequests) * 100).toFixed(1);
    console.log(`${server.name} -> ${count} requests (${percent}%)`);
  }
  console.log("");
  console.log(`Total requests:   ${totalRequests}`);
  console.log(`Blocked requests: ${blockedRequests}`);
  console.log("");
}

module.exports = {
  addServerConsistentHashing,
  removeServerConsistentHashing,
  loadBalancerConsistentHashing,
  testRequestConsistentHashing,
  setHealthConsistentHashing,
  showHashRing,
  showMetricsConsistentHashing
};
