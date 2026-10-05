import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { app, runtimeDeps } from "./app.js";
import { createMilestoneMcpServer } from "./milestone-tools.js";
import { useStdioTransport } from "./transport.js";

export { app, useStdioTransport };
export default app;

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  // A terminal keeps the HTTP listener only. A pipe attaches stdin and speaks MCP there.
  const stdio = useStdioTransport(process.stdin.isTTY);
  app.listen(port, () => {
    const line = `Milestone listening on ${port}`;
    if (stdio) console.error(line);
    else console.log(line);
  });
  if (stdio) {
    const stdioServer = createMilestoneMcpServer({ userId: "", entitled: false, store: runtimeDeps.store });
    await stdioServer.connect(new StdioServerTransport());
  }
}
