import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import fetch from 'node-fetch';

// Environment validation
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
if (!WEBFLOW_API_TOKEN) {
  throw new Error('WEBFLOW_API_TOKEN environment variable is required');
}

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

// Zod schemas for validation
const GetSiteSchema = z.object({
  siteId: z.string(),
});

const GetCollectionsSchema = z.object({
  siteId: z.string(),
});

const CreateCollectionItemSchema = z.object({
  collectionId: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  fieldData: z.record(z.any()).optional(),
  isDraft: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
});

const UpdateCollectionItemSchema = z.object({
  collectionId: z.string(),
  itemId: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  fieldData: z.record(z.any()).optional(),
  isDraft: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

const DeleteCollectionItemSchema = z.object({
  collectionId: z.string(),
  itemId: z.string(),
});

const GetCollectionItemsSchema = z.object({
  collectionId: z.string(),
  limit: z.number().optional().default(10),
  offset: z.number().optional().default(0),
});

// Webflow API helper class
class WebflowAPI {
  private headers: Record<string, string>;

  constructor(apiToken: string) {
    this.headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

private async makeRequest(endpoint: string, options: any = {}) {
  const url = `${WEBFLOW_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...this.headers,
      ...options.headers,
    },
  } as any);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Webflow API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

  async getSites() {
    return this.makeRequest('/sites');
  }

  async getSite(siteId: string) {
    return this.makeRequest(`/sites/${siteId}`);
  }

  async getCollections(siteId: string) {
    return this.makeRequest(`/sites/${siteId}/collections`);
  }

  async getCollectionItems(collectionId: string, limit = 10, offset = 0) {
    return this.makeRequest(`/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
  }

  async createCollectionItem(collectionId: string, data: any) {
    return this.makeRequest(`/collections/${collectionId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollectionItem(collectionId: string, itemId: string, data: any) {
    return this.makeRequest(`/collections/${collectionId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCollectionItem(collectionId: string, itemId: string) {
    return this.makeRequest(`/collections/${collectionId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async publishCollectionItems(collectionId: string, itemIds: string[]) {
    return this.makeRequest(`/collections/${collectionId}/items/publish`, {
      method: 'POST',
      body: JSON.stringify({ itemIds }),
    });
  }
}

// Create server instance
const server = new Server(
  {
    name: 'custom-webflow-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Webflow API
const webflowAPI = new WebflowAPI(WEBFLOW_API_TOKEN);

// Tool definitions
const tools = [
  {
    name: 'get_sites',
    description: 'Retrieve a list of all Webflow sites accessible to the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_site',
    description: 'Retrieve detailed information about a specific Webflow site by ID',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: {
          type: 'string',
          description: 'The unique identifier of the Webflow site',
        },
      },
      required: ['siteId'],
    },
  },
  {
    name: 'get_collections',
    description: 'Retrieve a list of all CMS collections for a specific Webflow site',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: {
          type: 'string',
          description: 'The unique identifier of the Webflow site',
        },
      },
      required: ['siteId'],
    },
  },
  {
    name: 'get_collection_items',
    description: 'Retrieve items from a specific collection',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The unique identifier of the collection',
        },
        limit: {
          type: 'number',
          description: 'Number of items to retrieve (default: 10)',
          default: 10,
        },
        offset: {
          type: 'number',
          description: 'Number of items to skip (default: 0)',
          default: 0,
        },
      },
      required: ['collectionId'],
    },
  },
  {
    name: 'create_collection_item',
    description: 'Create a new item in a collection',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The unique identifier of the collection',
        },
        name: {
          type: 'string',
          description: 'The name of the collection item',
        },
        slug: {
          type: 'string',
          description: 'The slug for the item (optional, will be auto-generated if not provided)',
        },
        fieldData: {
          type: 'object',
          description: 'Additional field data for the collection item',
        },
        isDraft: {
          type: 'boolean',
          description: 'Whether the item should be created as a draft (default: false)',
          default: false,
        },
        isArchived: {
          type: 'boolean',
          description: 'Whether the item should be archived (default: false)',
          default: false,
        },
      },
      required: ['collectionId', 'name'],
    },
  },
  {
    name: 'update_collection_item',
    description: 'Update an existing collection item',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The unique identifier of the collection',
        },
        itemId: {
          type: 'string',
          description: 'The unique identifier of the item to update',
        },
        name: {
          type: 'string',
          description: 'The new name of the collection item',
        },
        slug: {
          type: 'string',
          description: 'The new slug for the item',
        },
        fieldData: {
          type: 'object',
          description: 'Updated field data for the collection item',
        },
        isDraft: {
          type: 'boolean',
          description: 'Whether the item should be a draft',
        },
        isArchived: {
          type: 'boolean',
          description: 'Whether the item should be archived',
        },
      },
      required: ['collectionId', 'itemId'],
    },
  },
  {
    name: 'delete_collection_item',
    description: 'Delete a collection item',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The unique identifier of the collection',
        },
        itemId: {
          type: 'string',
          description: 'The unique identifier of the item to delete',
        },
      },
      required: ['collectionId', 'itemId'],
    },
  },
  {
    name: 'publish_collection_items',
    description: 'Publish one or more collection items',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The unique identifier of the collection',
        },
        itemIds: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of item IDs to publish',
        },
      },
      required: ['collectionId', 'itemIds'],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_sites': {
        const result = await webflowAPI.getSites();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_site': {
        const { siteId } = GetSiteSchema.parse(args);
        const result = await webflowAPI.getSite(siteId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_collections': {
        const { siteId } = GetCollectionsSchema.parse(args);
        const result = await webflowAPI.getCollections(siteId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_collection_items': {
        const { collectionId, limit, offset } = GetCollectionItemsSchema.parse(args);
        const result = await webflowAPI.getCollectionItems(collectionId, limit, offset);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'create_collection_item': {
        const { collectionId, name, slug, fieldData, isDraft, isArchived } = 
          CreateCollectionItemSchema.parse(args);
        
        const itemData = {
          fieldData: {
            name,
            slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            ...fieldData,
          },
          isDraft,
          isArchived,
        };

        const result = await webflowAPI.createCollectionItem(collectionId, itemData);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully created collection item!\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'update_collection_item': {
        const { collectionId, itemId, name, slug, fieldData, isDraft, isArchived } = 
          UpdateCollectionItemSchema.parse(args);
        
        const updateData: any = {};
        
        if (name || slug || fieldData) {
          updateData.fieldData = {};
          if (name) updateData.fieldData.name = name;
          if (slug) updateData.fieldData.slug = slug;
          if (fieldData) updateData.fieldData = { ...updateData.fieldData, ...fieldData };
        }
        
        if (isDraft !== undefined) updateData.isDraft = isDraft;
        if (isArchived !== undefined) updateData.isArchived = isArchived;

        const result = await webflowAPI.updateCollectionItem(collectionId, itemId, updateData);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully updated collection item!\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'delete_collection_item': {
        const { collectionId, itemId } = DeleteCollectionItemSchema.parse(args);
        await webflowAPI.deleteCollectionItem(collectionId, itemId);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully deleted collection item ${itemId}`,
            },
          ],
        };
      }

      case 'publish_collection_items': {
        const { collectionId, itemIds } = z.object({
          collectionId: z.string(),
          itemIds: z.array(z.string()),
        }).parse(args);
        
        const result = await webflowAPI.publishCollectionItems(collectionId, itemIds);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully published ${itemIds.length} item(s)!\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 Custom Webflow MCP Server running on stdio');
}

runServer().catch((error) => {
  console.error('💥 Fatal error running server:', error);
  process.exit(1);
});