// index.ts — Task 3.B.15: stdio MCP transport + tools registry
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadEnv } from "./env.js";
import { readFileTool } from "./tools/read_file.js";
import { writeFileTool } from "./tools/write_file.js";
import { listFilesTool } from "./tools/list_files.js";
import { showToUserTool } from "./tools/show_to_user.js";
import { doneTool } from "./tools/done.js";

// fail-fast：啟動時驗證 env vars
export const env = loadEnv();

const server = new Server(
  { name: "design_house", version: "0.0.0" },
  { capabilities: { tools: {} } }
);

// tools metadata — 名稱用短名（CC 端會加 mcp__design_house__ 前綴）
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_file",
      description: "Read a file from the project directory",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "write_file",
      description: "Write content to a file in the project directory (auto-creates directories)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "list_files",
      description: "List files in the project directory",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root (default: .)" },
          depth: {
            type: "integer",
            description: "Directory traversal depth (default: 1, max: 5)",
            minimum: 1,
            maximum: 5,
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "show_to_user",
      description: "Navigate the UI preview iframe to the given file path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "done",
      description:
        "Signal that the artifact is ready for review. Blocks until UI acknowledges (max 5s). Returns ok, timedOut, and any console errors from the iframe.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path of the artifact file" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  ],
}));

// tool call dispatch
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  type ToolResult =
    | { isError: true; content: Array<{ type: "text"; text: string }> }
    | Record<string, unknown>;

  let result: ToolResult;

  try {
    switch (name) {
      case "read_file":
        result = (await readFileTool(args)) as ToolResult;
        break;
      case "write_file":
        result = (await writeFileTool(args)) as ToolResult;
        break;
      case "list_files":
        result = (await listFilesTool(args)) as ToolResult;
        break;
      case "show_to_user":
        result = (await showToUserTool(args)) as ToolResult;
        break;
      case "done":
        result = (await doneTool(args)) as ToolResult;
        break;
      default:
        result = {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        };
    }
  } catch (e) {
    const err = e as Error;
    result = {
      isError: true,
      content: [{ type: "text", text: `Internal error: ${err.message}` }],
    };
  }

  // MCP protocol response envelope
  if ("isError" in result && result.isError === true) {
    return {
      content: result.content as Array<{ type: "text"; text: string }>,
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
});

// stdio transport 啟動
const transport = new StdioServerTransport();
await server.connect(transport);
