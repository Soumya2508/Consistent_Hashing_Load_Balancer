const crypto = require("crypto");
const { identifyNode, generateRandomIP } = require("./utils");

// Consistent hashing state
let consistentServers = [];
let hashRing = [];

// Metrics state
// routedRequests stores just the IP and its hash. The actual destination is
// recomputed at display time so add/remove/health changes update the view.
let routedRequests = [];     // [{ ip, hashValue }]
let blockedRequests = 0;

// Rate limiting state - simple fixed window per IP
let rateLimitMap = {};       // { ip: { count, firstRequestTime } }
const RATE_LIMIT_WINDOW_MS = 30 * 1000;  // 30 seconds
const RATE_LIMIT_MAX = 10;               // max requests per window per IP

// Returned true if the request is allowed, false if it should be blocked
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap[ip];

  if (!record) {
    // First time we have seen this IP
    rateLimitMap[ip] = { count: 1, firstRequestTime: now };
    return true;
  }

  if (now - record.firstRequestTime > RATE_LIMIT_WINDOW_MS) {
    // Old window expired - reset and start fresh
    record.count = 1;
    record.firstRequestTime = now;
    return true;
  }

  // Still inside the same window
  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    return false;
  }
  return true;
}

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

// Walked the ring clockwise from ipHash and returned the first healthy server name
// Returned null if the ring is empty or no healthy server exists
function findRouteForHash(ipHash) {
  if (hashRing.length === 0) {
    return null;
  }

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

  for (let step = 0; step < hashRing.length; step++) {
    const idx = (startIdx + step) % hashRing.length;
    const entry = hashRing[idx];
    if (isHealthy(entry.actualNode)) {
      return entry.actualNode;
    }
  }
  return null;
}

function loadBalancerConsistentHashing(ip) {
  // Rate limit check happens before anything else - testRequest just loops,
  // so calling test-consistent <ip> 12 naturally hits this check on each call
  if (!checkRateLimit(ip)) {
    blockedRequests++;
    console.log(`Rate limit exceeded for IP: ${ip}`);
    return null;
  }

  // Hashed the IP and stored the request - the actual destination is computed
  // at display time so it stays current as servers are added or marked unhealthy
  const ipHash = hashKey(ip);
  routedRequests.push({ ip: ip, hashValue: ipHash });

  const target = findRouteForHash(ipHash);
  if (target === null) {
    if (hashRing.length === 0) {
      console.log(`Incoming IP: ${ip} -> No servers available`);
    } else {
      console.log(`Incoming IP: ${ip} -> No healthy server available`);
    }
    return null;
  }

  identifyNode(ip, target);
  return target;
}

function testRequestConsistentHashing(ip, count = 1) {
  for (let i = 0; i < count; i++) {
    loadBalancerConsistentHashing(ip);
  }
}

// Generated count random IPs and routed each through consistent hashing
// Mirrors simulateTraffic from the original task PDF
function simulateTrafficConsistentHashing(count = 10) {
  for (let i = 0; i < count; i++) {
    const ip = generateRandomIP();
    loadBalancerConsistentHashing(ip);
  }
}

function showHashRing() {
  console.log("\n===== CONSISTENT HASH RING =====");
  if (hashRing.length === 0 && routedRequests.length === 0) {
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
    // Recomputed where this request would route given the current ring state
    let routeNow = findRouteForHash(req.hashValue);
    if (routeNow === null) {
      routeNow = (hashRing.length === 0) ? "(no servers)" : "(no healthy server)";
    }
    display.push({
      kind: "REQUEST",
      hashValue: req.hashValue,
      ip: req.ip,
      routedTo: routeNow
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

  // Servers
  console.log("\nServers:");
  if (consistentServers.length === 0) {
    console.log("  (none)");
  } else {
    for (let server of consistentServers) {
      const status = server.healthy ? "HEALTHY" : "UNHEALTHY";
      console.log(`  ${server.name} (weight ${server.weight}, ${status})`);
    }
  }

  // Stored requests with their current routing
  console.log(`\nStored requests (${routedRequests.length}):`);
  if (routedRequests.length === 0) {
    console.log("  (none)");
  } else {
    for (let req of routedRequests) {
      let routeNow = findRouteForHash(req.hashValue);
      if (routeNow === null) {
        routeNow = (hashRing.length === 0) ? "(no servers)" : "(no healthy server)";
      }
      console.log(`  ${req.ip} -> ${routeNow}`);
    }
  }

  // Distribution computed dynamically from the current ring
  const distribution = {};
  let routedCount = 0;
  for (let req of routedRequests) {
    const target = findRouteForHash(req.hashValue);
    if (target !== null) {
      if (!distribution[target]) {
        distribution[target] = 0;
      }
      distribution[target]++;
      routedCount++;
    }
  }

  console.log("\nCurrent distribution:");
  if (routedCount === 0) {
    console.log("  (no requests currently routable)");
  } else {
    for (let server of consistentServers) {
      const count = distribution[server.name] || 0;
      const percent = ((count / routedCount) * 100).toFixed(1);
      console.log(`  ${server.name} -> ${count} requests (${percent}%)`);
    }
  }

  console.log(`\nBlocked by rate limit: ${blockedRequests}`);
  console.log("");
}

module.exports = {
  addServerConsistentHashing,
  removeServerConsistentHashing,
  loadBalancerConsistentHashing,
  testRequestConsistentHashing,
  simulateTrafficConsistentHashing,
  setHealthConsistentHashing,
  showHashRing,
  showMetricsConsistentHashing
};
