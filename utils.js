// Random IP generator (kept from the original task PDF)
function generateRandomIP() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(".");
}

// Logged which node received the request (kept from the original task PDF)
function identifyNode(ip, selectedNode) {
  console.log(`Incoming IP: ${ip} -> Routed to: ${selectedNode}`);
}

module.exports = {
  generateRandomIP,
  identifyNode
};
