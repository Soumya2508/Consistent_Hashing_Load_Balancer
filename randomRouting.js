const { identifyNode } = require("./utils");

// Random routing state - intentionally bare for the baseline comparison
let randomServers = [];
let randomRequests = [];

function addServerRandomRouting(name) {
  for (let server of randomServers) {
    if (server === name) {
      console.log("Server already exists");
      return;
    }
  }
  randomServers.push(name);
  console.log(`Added ${name} to random routing`);
}

function removeServerRandomRouting(name) {
  let foundIdx = -1;
  for (let i = 0; i < randomServers.length; i++) {
    if (randomServers[i] === name) {
      foundIdx = i;
      break;
    }
  }
  if (foundIdx === -1) {
    console.log("Server does not exist");
    return;
  }
  randomServers.splice(foundIdx, 1);
  console.log(`Removed ${name} from random routing`);
}

// The naive load balancer from the original task PDF
function loadBalancerRandomRouting(ip) {
  if (randomServers.length === 0) {
    console.log("No servers available");
    return null;
  }
  // Picked a random server every call - same IP can land on different servers
  const randomIndex = Math.floor(Math.random() * randomServers.length);
  const selectedNode = randomServers[randomIndex];

  // Stored unique IPs only - just for displaying the request set later
  let alreadySeen = false;
  for (let req of randomRequests) {
    if (req === ip) {
      alreadySeen = true;
      break;
    }
  }
  if (!alreadySeen) {
    randomRequests.push(ip);
  }

  identifyNode(ip, selectedNode);
  return selectedNode;
}

function testRequestRandomRouting(ip, count = 1) {
  for (let i = 0; i < count; i++) {
    loadBalancerRandomRouting(ip);
  }
}

function showServersRandomRouting() {
  console.log("\n===== RANDOM ROUTING SERVERS =====");
  if (randomServers.length === 0) {
    console.log("(no servers)");
  } else {
    console.log(randomServers.join(", "));
  }

  console.log("\n===== ROUTED REQUESTS =====");
  if (randomRequests.length === 0) {
    console.log("(no requests yet)");
  } else {
    console.log(randomRequests.join(", "));
  }
  console.log("");
}

module.exports = {
  addServerRandomRouting,
  removeServerRandomRouting,
  loadBalancerRandomRouting,
  testRequestRandomRouting,
  showServersRandomRouting
};
