// Headless integration harness: permit Inspector's interactive OAuth path while
// MCP_AUTO_OPEN_ENABLED=false prevents launching a browser. No protocol changes.
Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
