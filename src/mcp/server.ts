/**
 * MAPS MCP Server
 * Per spec 03-mcp-server.md
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MapsDatabase } from '../db/database.js';
import { MapsError } from './errors.js';
import {
  taskCreate,
  taskGet,
  taskUpdate,
  taskList,
  nextTask,
} from './tools/task-tools.js';
import {
  blockerAdd,
  blockerRemove,
  blockerDependencies,
  blockerDependents,
} from './tools/blocker-tools.js';
import {
  artifactRegister,
  artifactList,
} from './tools/artifact-tools.js';
import {
  configSet,
  configGet,
} from './tools/config-tools.js';
import { epicList } from './tools/epic-tools.js';
import { projectInit } from './tools/project-init.js';
import { compress } from '../compressor/compress.js';

export class MapsServer {
  private server: Server;
  private database: MapsDatabase | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'maps-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Task management
        {
          name: 'task_create',
          description: 'Create a new task (must be parented under the current epic)',
          inputSchema: {
            type: 'object',
            properties: {
              parent_id: { type: 'number', description: 'Parent task ID' },
              type: { type: 'string', description: 'Task type' },
              name: { type: 'string', description: 'Task name' },
              description: { type: 'string', description: 'Task description' },
              agent: { type: 'string', description: 'Agent responsible for this task' },
            },
            required: ['parent_id', 'type', 'name', 'description', 'agent'],
          },
        },
        {
          name: 'task_get',
          description: 'Retrieve a single task by ID',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
            },
            required: ['task_id'],
          },
        },
        {
          name: 'task_update',
          description: 'Update task status, results, or other fields',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
              status: { type: 'string', description: 'New status (optional)' },
              name: { type: 'string', description: 'New name (optional)' },
              description: { type: 'string', description: 'New description (optional)' },
              agent: { type: 'string', description: 'New agent (optional)' },
              results: { type: 'string', description: 'Task results (optional)' },
            },
            required: ['task_id'],
          },
        },
        {
          name: 'task_list',
          description: 'List tasks with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'Filter by status (optional)' },
              type: { type: 'string', description: 'Filter by type (optional)' },
              parent_id: { type: 'number', description: 'Filter by parent (optional)' },
              agent: { type: 'string', description: 'Filter by agent (optional)' },
            },
          },
        },
        {
          name: 'next_task',
          description: 'Find the next unblocked open task',
          inputSchema: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Filter by agent role (optional)' },
            },
          },
        },

        // Epic management
        {
          name: 'epic_list',
          description: 'List epics',
          inputSchema: {
            type: 'object',
            properties: {
              active_only: { type: 'boolean', description: 'Only return non-done epics (optional)' },
            },
          },
        },

        // Blocker management
        {
          name: 'blocker_add',
          description: 'Create a blocking relationship between two tasks',
          inputSchema: {
            type: 'object',
            properties: {
              blocked_task_id: { type: 'number', description: 'Task that is blocked' },
              blocked_by_task_id: { type: 'number', description: 'Task that blocks' },
            },
            required: ['blocked_task_id', 'blocked_by_task_id'],
          },
        },
        {
          name: 'blocker_remove',
          description: 'Remove a blocking relationship',
          inputSchema: {
            type: 'object',
            properties: {
              blocked_task_id: { type: 'number', description: 'Task that is blocked' },
              blocked_by_task_id: { type: 'number', description: 'Task that blocks' },
            },
            required: ['blocked_task_id', 'blocked_by_task_id'],
          },
        },
        {
          name: 'blocker_dependencies',
          description: 'Get all tasks that block the given task',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
            },
            required: ['task_id'],
          },
        },
        {
          name: 'blocker_dependents',
          description: 'Get all tasks that the given task blocks',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
            },
            required: ['task_id'],
          },
        },

        // Artifact management
        {
          name: 'artifact_register',
          description: 'Register a new artifact file',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
              artifact_type: { type: 'string', description: 'Artifact type' },
              file_path: { type: 'string', description: 'Path to artifact file' },
            },
            required: ['task_id', 'artifact_type', 'file_path'],
          },
        },
        {
          name: 'artifact_list',
          description: 'List artifacts with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Filter by task (optional)' },
              artifact_type: { type: 'string', description: 'Filter by type (optional)' },
            },
          },
        },

        // Config management
        {
          name: 'config_set',
          description: 'Set a configuration key-value pair',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Config key' },
              value: { type: 'string', description: 'Config value' },
            },
            required: ['key', 'value'],
          },
        },
        {
          name: 'config_get',
          description: 'Get a configuration value by key',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Config key' },
            },
            required: ['key'],
          },
        },

        // Compression
        {
          name: 'compress',
          description: 'Compress markdown text using semantic densification',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Markdown text to compress' },
            },
            required: ['text'],
          },
        },

        // Project initialization
        {
          name: 'project_init',
          description: 'Initialize MAPS directory structure',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Project directory path' },
            },
            required: ['project_path'],
          },
        },
      ],
    }));

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Special case: project_init doesn't need database
        if (name === 'project_init') {
          const result = projectInit(args as any);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Special case: compress doesn't need database
        if (name === 'compress') {
          const result = compress((args as any).text);
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        // All other tools need database
        if (!this.database) {
          throw new Error('Database not initialized. Call project_init first or provide project_path.');
        }

        const db = this.database.getDb();
        let result: any;

        // Route to appropriate tool function
        switch (name) {
          // Task tools
          case 'task_create':
            result = taskCreate(db, args as any);
            break;
          case 'task_get':
            result = taskGet(db, args as any);
            break;
          case 'task_update':
            result = taskUpdate(db, args as any);
            break;
          case 'task_list':
            result = taskList(db, args as any);
            break;
          case 'next_task':
            result = nextTask(db, args as any);
            break;

          // Epic tools
          case 'epic_list':
            result = epicList(db, args as any);
            break;

          // Blocker tools
          case 'blocker_add':
            result = blockerAdd(db, args as any);
            break;
          case 'blocker_remove':
            result = blockerRemove(db, args as any);
            break;
          case 'blocker_dependencies':
            result = blockerDependencies(db, args as any);
            break;
          case 'blocker_dependents':
            result = blockerDependents(db, args as any);
            break;

          // Artifact tools
          case 'artifact_register':
            result = artifactRegister(db, args as any);
            break;
          case 'artifact_list':
            result = artifactList(db, args as any);
            break;

          // Config tools
          case 'config_set':
            result = configSet(db, args as any);
            break;
          case 'config_get':
            result = configGet(db, args as any);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        if (error instanceof MapsError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: error.category,
                    message: error.message,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  initDatabase(projectPath: string) {
    this.database = new MapsDatabase(projectPath);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
